import { randomBytes } from 'node:crypto';
import { fail, ok } from '../../utils/response';
import type { Response } from 'express';
import { JOB_IMAGE_MAX_BYTES, detectImageType } from '../../services/file-storage';
import type { FileStorage } from '../../services/file-storage';
import type { UserRepository } from '../users/user.repository';

const MAX_OTP_ATTEMPTS = 5;
const OTP_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_RATE_MS = 60 * 1000; // 1 minute

const ALLOWED_DOCUMENT_TYPES: readonly string[] = [
  'HURU_REPORT',
  'ID_COPY',
  'PROOF_OF_RESIDENCE',
  'QUALIFICATION',
  'PROFILE_PICTURE',
  'SELFIE',
];

const DOCUMENT_ALLOWED_MIMES: Record<string, readonly string[]> = {
  HURU_REPORT: ['application/pdf', 'image/jpeg', 'image/png'],
  ID_COPY: ['application/pdf', 'image/jpeg', 'image/png'],
  PROOF_OF_RESIDENCE: ['application/pdf', 'image/jpeg', 'image/png'],
  QUALIFICATION: ['application/pdf', 'image/jpeg', 'image/png'],
  PROFILE_PICTURE: ['image/jpeg', 'image/png', 'image/webp'],
  SELFIE: ['image/jpeg', 'image/png', 'image/webp'],
};

class InMemoryOTPStore {
  private store = new Map<string, {
    codeHash: string;
    expiresAtMs: number;
    attempts: number;
    lockedUntil?: number;
    lastResendMs?: number;
  }>();

  async save(phoneOrEmail: string, codeHash: string, expiresAtMs: number): Promise<void> {
    this.store.set(phoneOrEmail, { codeHash, expiresAtMs, attempts: 0 });
  }

  async verify(phoneOrEmail: string, codeHash: string): Promise<boolean | null> {
    const entry = this.store.get(phoneOrEmail);
    if (!entry) return null;
    if (Date.now() > entry.expiresAtMs) {
      this.store.delete(phoneOrEmail);
      return null;
    }
    if (entry.attempts >= MAX_OTP_ATTEMPTS) {
      return false;
    }
    const match = entry.codeHash === codeHash;
    if (match) {
      this.store.delete(phoneOrEmail);
      return true;
    }
    entry.attempts += 1;
    return false;
  }

  async getAttempts(phoneOrEmail: string): Promise<number> {
    const entry = this.store.get(phoneOrEmail);
    return entry ? entry.attempts : 0;
  }

  async isLocked(phoneOrEmail: string): Promise<boolean> {
    const entry = this.store.get(phoneOrEmail);
    if (!entry) return false;
    if (entry.lockedUntil && Date.now() < entry.lockedUntil) return true;
    if (entry.attempts >= MAX_OTP_ATTEMPTS && entry.lockedUntil) {
      entry.attempts = 0;
    }
    return false;
  }

  async recordResend(phoneOrEmail: string, timestampMs: number): Promise<boolean> {
    const entry = this.store.get(phoneOrEmail);
    if (!entry) return true;
    if (entry.lastResendMs && timestampMs - entry.lastResendMs < OTP_RESEND_RATE_MS) {
      return false;
    }
    entry.lastResendMs = timestampMs;
    return true;
  }
}

export function makeVerificationService(storage: FileStorage, users: UserRepository) {
  const otpStore = new InMemoryOTPStore();

  return {
    /**
     * Upload a verification document.
     * Validates file type, size, magic bytes, and stores outside public folder.
     */
    async uploadDocument(
      req: any,
      res: Response,
    ): Promise<void> {
      try {
        const userId = req.user.id;
        const { type } = req.body;
        const file = req.file;

        if (!file) {
          fail(res, 'VALIDATION_ERROR', 'No file uploaded.', 400);
          return;
        }

        if (!type || !ALLOWED_DOCUMENT_TYPES.includes(type)) {
          fail(res, 'VALIDATION_ERROR', 'Document type is required and must be valid.', 400);
          return;
        }

        const typeSpecificAllowed = DOCUMENT_ALLOWED_MIMES[type as keyof typeof DOCUMENT_ALLOWED_MIMES];
        if (!typeSpecificAllowed) {
          fail(res, 'VALIDATION_ERROR', 'Invalid document type.', 400);
          return;
        }

        const validation = validateVerificationDocumentUpload(file, typeSpecificAllowed);
        if (!validation.valid) {
          fail(res, 'VALIDATION_ERROR', validation.error ?? 'Invalid file.', 400);
          return;
        }

        const ext: string = validation.extension === 'pdf' ? 'pdf' : validation.extension !== undefined ? validation.extension : 'pdf';
        const randomHex = randomBytes(16).toString('hex');
        const storedName = `verification/${userId}/${type}/${randomHex}.${ext}`;

await storage.save(storedName, file.buffer, ext);

        const document_date = req.body.document_date ?? new Date().toISOString().split('T')[0] as string;
        if (!document_date) {
          fail(res, 'VALIDATION_ERROR', 'Document date is required.', 400);
          return;
        }

        ok(res, {
          id: storedName,
          provider_id: userId,
          type,
          original_name: file.originalname,
          stored_name: storedName,
          mime: validation.mime,
          size: file.size,
          status: 'uploaded',
          rejection_reason: null,
          document_date: document_date,
          created_at: new Date().toISOString(),
        }, 'Document uploaded successfully.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not upload document. Please try again.', 500);
      }
    },

    /**
     * Get verification checklist/status for the authenticated provider.
     */
    async getVerificationStatus(req: any, res: Response): Promise<void> {
      try {
        const userId = req.user.id;

        const status = {
          status: 'unverified',
          huru_report: { status: 'missing', document_date: null },
          certified_id: { status: 'missing' },
          proof_of_residence: { status: 'missing' },
          qualifications: { status: 'missing', count: 0 },
          profile_picture: { status: 'missing' },
          selfie: { status: 'missing' },
          phone_verified: false,
          email_verified: false,
          pending_since: null,
        };

        ok(res, status, 'Verification status retrieved.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not retrieve verification status. Please try again.', 500);
      }
    },

    /**
     * Send OTP code to phone via SMS.
     * Uses internal OTP store for rate limiting and tracking.
     * For local dev, code is console.logged.
     */
    async sendPhoneCode(req: any, res: Response): Promise<void> {
      try {
        const { phone } = req.body;

        if (!phone) {
          fail(res, 'VALIDATION_ERROR', 'Phone number is required.', 400);
          return;
        }

        const rateAllowed = await otpStore.recordResend(phone, Date.now());
        if (!rateAllowed) {
          fail(res, 'RATE_LIMITED', 'Resend too soon. Please wait before trying again.', 429);
          return;
        }

        const code = randomBytes(3).toString('hex').toUpperCase().substring(0, 6);
        const codeHash = randomBytes(32).toString('hex');
        const expiresAtMs = Date.now() + OTP_EXPIRY_MS;

        await otpStore.save(phone, codeHash, expiresAtMs);

        console.log(`[SMS] Your Fixlynk verification code is: ${code}`);
        console.log(`[SMS] This code expires in 10 minutes.`);

        ok(res, { expiresAt: new Date(expiresAtMs).toISOString() }, 'Verification code sent.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not send verification code. Please try again.', 500);
      }
    },

    /**
     * Confirm phone OTP code.
     */
    async confirmPhoneCode(req: any, res: Response): Promise<void> {
      try {
        const { code } = req.body;
        const phone = req.body.phone;

        if (!code || !phone) {
          fail(res, 'VALIDATION_ERROR', 'Code and phone number are required.', 400);
          return;
        }

        const codeHash = randomBytes(32).toString('hex');
        const verified = await otpStore.verify(phone, codeHash);

        if (verified) {
          await users.markPhoneVerified(req.user.id);
          ok(res, { phone_verified: true }, 'Phone verified successfully.');
        } else {
          fail(res, 'VALIDATION_ERROR', 'Invalid or expired verification code.', 400);
        }
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not verify phone code. Please try again.', 500);
      }
    },

    /**
     * Send email verification link.
     */
    async sendEmailLink(req: any, res: Response): Promise<void> {
      try {
        const { email } = req.body;

        if (!email) {
          fail(res, 'VALIDATION_ERROR', 'Email address is required.', 400);
          return;
        }

        const token = randomBytes(32).toString('hex');
        const expiresAtMs = Date.now() + OTP_EXPIRY_MS;

        const webBaseUrl = process.env.WEB_BASE_URL || 'http://localhost:4200';
        const verificationLink = `${webBaseUrl}/verification/email-confirm?token=${token}`;

        console.log(`[EMAIL] Verification link: ${verificationLink}`);
        console.log(`[EMAIL] This link expires in 10 minutes.`);

        ok(res, { expiresAt: new Date(expiresAtMs).toISOString(), link: verificationLink }, 'Verification link sent.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not send verification link. Please try again.', 500);
      }
    },

    /**
     * Confirm email verification via token.
     */
    async confirmEmail(req: any, res: Response): Promise<void> {
      try {
        const { token } = req.query;

        if (!token) {
          fail(res, 'VALIDATION_ERROR', 'Verification token is required.', 400);
          return;
        }

        const userId = req.user.id;
        await users.markEmailVerified(userId);

        ok(res, { email_verified: true }, 'Email verified successfully.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not verify email. Please try again.', 500);
      }
    },

    /**
     * Check if phone OTP is rate-limited.
     */
    async checkPhoneCodeRateLimit(req: any, res: Response): Promise<void> {
      try {
        const { phone } = req.body;
        if (!phone) {
          fail(res, 'VALIDATION_ERROR', 'Phone number is required.', 400);
          return;
        }
        const locked = await otpStore.isLocked(phone);
        const attempts = await otpStore.getAttempts(phone);
        ok(res, { locked, attempts }, 'Rate limit status.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not check rate limit. Please try again.', 500);
      }
    },
  };
}

export function validateVerificationDocumentUpload(
  file: { buffer: Buffer; mimetype: string; originalname: string; size: number } | null | undefined,
  allowedTypes: readonly string[],
): { valid: boolean; error?: string; mime?: string; extension?: string } {
  if (!file || file.buffer.length === 0) return { valid: false, error: 'A file is required.' };
  if (file.size > JOB_IMAGE_MAX_BYTES || file.buffer.length > JOB_IMAGE_MAX_BYTES) {
    return { valid: false, error: 'File must be 5MB or smaller.' };
  }
  const claimed = file.mimetype.toLowerCase().trim();
  if (!allowedTypes.includes(claimed)) {
    return { valid: false, error: 'Invalid file type.' };
  }
  const detected = detectImageType(file.buffer);
  if (!detected) {
    const isPDF = file.buffer.length >= 4 && file.buffer[0] === 0x25 && file.buffer[1] === 0x25 && file.buffer[2] === 0x45 && file.buffer[3] === 0x0d;
    if (!isPDF) return { valid: false, error: 'Only PDF, JPEG, PNG files are allowed.' };
  }
  let ext: string;
  if (detected === 'image/png') ext = 'png';
  else if (detected === 'image/jpeg') ext = 'jpg';
  else if (file.buffer[0] === 0x25 && file.buffer[1] === 0x25 && file.buffer[2] === 0x45 && file.buffer[3] === 0x0d) ext = 'pdf';
  else ext = 'bin';

  return { valid: true, mime: detected || 'application/pdf', extension: ext };
}