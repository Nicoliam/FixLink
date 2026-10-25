import { randomBytes } from 'node:crypto';
import { fail, ok } from '../../utils/response';
import type { Response } from 'express';
import { JOB_IMAGE_MAX_BYTES, detectImageType, sanitizeOriginalFilename } from '../../services/file-storage';
import type { FileStorage } from '../../services/file-storage';
import type { UserRepository } from '../users/user.repository';
import type { VerificationDocument, VerificationDocumentStore, VerificationDocumentType } from './verification.store';

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

export function makeVerificationService(storage: FileStorage, users: UserRepository, documents: VerificationDocumentStore) {
  const otpStore = new InMemoryOTPStore();

  return {
    /** Remove the latest document of a type (approved documents cannot be removed). */
    async deleteDocument(req: any, res: Response): Promise<void> {
      try {
        const userId = req.user?.id;
        if (!userId) {
          fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
          return;
        }
        const type = String(req.params.type ?? '');
        if (!ALLOWED_DOCUMENT_TYPES.includes(type)) {
          fail(res, 'VALIDATION_ERROR', 'Invalid document type.', 400);
          return;
        }
        const providerId = await documents.findProfessionalProfileByUserId(String(userId));
        if (!providerId) {
          fail(res, 'NOT_FOUND', 'No provider profile found for your account.', 404);
          return;
        }
        const latest = (await documents.listByProvider(providerId)).find((d) => d.type === type);
        if (!latest) {
          fail(res, 'NOT_FOUND', 'There is no document of that type to remove.', 404);
          return;
        }
        if (latest.status === 'approved') {
          fail(res, 'CONFLICT', 'An approved document cannot be removed.', 409);
          return;
        }
        await documents.delete(providerId, latest.id);
        await storage.remove(latest.stored_name);
        ok(res, { removed: true }, 'Document removed.');
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not remove the document. Please try again.', 500);
      }
    },

    /** Stream a document back to its owner only. */
    async viewDocument(req: any, res: Response): Promise<void> {
      try {
        const userId = req.user?.id;
        if (!userId) {
          fail(res, 'UNAUTHORIZED', 'Authentication required.', 401);
          return;
        }
        const doc = await documents.findOwnedDocument(String(userId), String(req.params.id ?? ''));
        if (!doc) {
          fail(res, 'NOT_FOUND', 'Document not found.', 404);
          return;
        }
        const bytes = await storage.read(doc.stored_name);
        if (!bytes) {
          fail(res, 'NOT_FOUND', 'The file is no longer available.', 404);
          return;
        }
        res.setHeader('Content-Type', doc.mime);
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, no-store');
        res.send(bytes);
      } catch (err) {
        fail(res, 'INTERNAL_ERROR', 'Could not open the document. Please try again.', 500);
      }
    },

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
        const providerId = await documents.findProfessionalProfileByUserId(String(userId));
        if (!providerId) {
          fail(res, 'NOT_FOUND', 'No provider profile found for your account.', 404);
          return;
        }

        const todayIso = new Date().toISOString().split('T')[0] as string;
        let documentDate = todayIso;
        if (type === 'HURU_REPORT') {
          const raw = typeof req.body.document_date === 'string' ? req.body.document_date.trim() : '';
          if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(Date.parse(raw))) {
            fail(res, 'VALIDATION_ERROR', 'The Huru report date is required (YYYY-MM-DD).', 400);
            return;
          }
          if (raw > todayIso) {
            fail(res, 'VALIDATION_ERROR', 'The Huru report date cannot be in the future.', 400);
            return;
          }
          const oldest = new Date();
          oldest.setMonth(oldest.getMonth() - 3);
          if (raw < (oldest.toISOString().split('T')[0] as string)) {
            fail(res, 'VALIDATION_ERROR', 'The Huru report must not be older than 3 months.', 400);
            return;
          }
          documentDate = raw;
        }

        const stored = await storage.saveAdminDocument('verification', String(userId), file.buffer, ext);
        let record;
        try {
          record = await documents.create({
            providerId,
            type: type as VerificationDocumentType,
            originalName: sanitizeOriginalFilename(file.originalname),
            storedName: stored.storageKey,
            mime: validation.mime ?? 'application/pdf',
            size: file.size,
            documentDate,
          });
        } catch (dbErr) {
          await storage.remove(stored.storageKey);
          throw dbErr;
        }

        if (type !== 'QUALIFICATION') {
          const previous = (await documents.listByProvider(providerId)).filter(
            (d) => d.type === type && d.id !== record.id && d.status !== 'approved',
          );
          for (const old of previous) {
            await documents.delete(providerId, old.id);
            await storage.remove(old.stored_name);
          }
        }

        ok(res, record, 'Document uploaded successfully.');
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

        const providerId = await documents.findProfessionalProfileByUserId(String(userId));
        const docs: VerificationDocument[] = providerId ? await documents.listByProvider(providerId) : [];
        // listByProvider returns newest first, so find() yields the latest upload.
        const item = (t: VerificationDocumentType) => {
          const d = docs.find((x) => x.type === t);
          return { status: d?.status ?? 'missing', document_id: d?.id ?? null, file_name: d?.original_name ?? null };
        };

        const status = {
          status: 'unverified',
          huru_report: {
            ...item('HURU_REPORT'),
            document_date: docs.find((x) => x.type === 'HURU_REPORT')?.document_date ?? null,
          },
          certified_id: item('ID_COPY'),
          proof_of_residence: item('PROOF_OF_RESIDENCE'),
          qualifications: { ...item('QUALIFICATION'), count: docs.filter((x) => x.type === 'QUALIFICATION').length },
          profile_picture: item('PROFILE_PICTURE'),
          selfie: item('SELFIE'),
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
    const isPDF = file.buffer.length >= 4 && file.buffer[0] === 0x25 && file.buffer[1] === 0x50 && file.buffer[2] === 0x44 && file.buffer[3] === 0x46;
    if (!isPDF) return { valid: false, error: 'Only PDF, JPEG, PNG files are allowed.' };
  }
  let ext: string;
  if (detected === 'image/png') ext = 'png';
  else if (detected === 'image/jpeg') ext = 'jpg';
  else if (file.buffer[0] === 0x25 && file.buffer[1] === 0x50 && file.buffer[2] === 0x44 && file.buffer[3] === 0x46) ext = 'pdf';
  else ext = 'bin';

  return { valid: true, mime: detected || 'application/pdf', extension: ext };
}