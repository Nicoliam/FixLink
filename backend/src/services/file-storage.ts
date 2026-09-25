/**
 * FixLink Stage 6F — file-storage abstraction (MVP local adapter) +
 * Stage 7D voice-note support.
 *
 * Flow: User → Backend → File Storage → Metadata → MySQL.
 * The database stores only metadata (`job_images.file_reference`,
 * `job_voice_notes.file_reference` and friends); binary bytes live
 * outside MySQL. This module is the single seam where a future
 * object-storage implementation (S3-compatible) can replace the local
 * adapter without touching API or database code.
 *
 * Security: storage keys are generated server-side (`job-images/<jobId>/
 * <randomHex>.<ext>` and `job-voice-notes/<jobId>/<randomHex>.<ext>`);
 * original filenames are never used for paths, so path traversal is
 * impossible. Raw filesystem paths are never exposed through the API —
 * retrieval goes through an authorized backend route.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export const JOB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const JOB_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type JobImageMime = (typeof JOB_IMAGE_ALLOWED_MIME)[number];

/**
 * Stage 7D — technician voice notes. Conservative allowlist compatible
 * with normal browser/mobile recording (MediaRecorder). 10MB keeps
 * multi-minute notes practical without weakening the security model.
 */
export const VOICE_NOTE_MAX_BYTES = 10 * 1024 * 1024;

export const VOICE_NOTE_ALLOWED_MIME = [
  'audio/webm',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
] as const;

export type VoiceNoteMime = (typeof VOICE_NOTE_ALLOWED_MIME)[number];

export interface StoredFile {
  /** Opaque key stored in `job_images.file_reference` (never a filesystem path). */
  storageKey: string;
  size: number;
}

export type AdminDocumentKind = 'verification' | 'certificate';

export interface FileStorage {
  save(jobId: string, buffer: Buffer, extension: string): Promise<StoredFile>;
  saveVoiceNote(jobId: string, buffer: Buffer, extension: string): Promise<StoredFile>;
  saveAdminDocument(kind: AdminDocumentKind, id: string, buffer: Buffer, extension: string): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

const IMAGE_STORAGE_KEY_PATTERN = /^job-images\/[1-9][0-9]*\/[0-9a-f]{32}\.(jpg|png|webp)$/;
const VOICE_STORAGE_KEY_PATTERN = /^job-voice-notes\/[1-9][0-9]*\/[0-9a-f]{32}\.(webm|mp4|m4a|mp3|wav|ogg)$/;
const ADMIN_DOCUMENT_STORAGE_KEY_PATTERN = /^(verification|certificates)\/[1-9][0-9]*\/[0-9a-f]{32}\.(pdf|jpg|png|webp)$/;

function isStorageKey(value: string): boolean {
  return IMAGE_STORAGE_KEY_PATTERN.test(value) || VOICE_STORAGE_KEY_PATTERN.test(value) || ADMIN_DOCUMENT_STORAGE_KEY_PATTERN.test(value);
}

export function defaultStorageDir(): string {
  const override = process.env['FILE_STORAGE_DIR'];
  if (override !== undefined && override.trim() !== '') return override;
  // backend/uploads — already covered by the repo-root `uploads/` gitignore.
  return path.join(__dirname, '..', '..', 'uploads');
}

export class LocalFileStorage implements FileStorage {
  constructor(private readonly baseDir: string = defaultStorageDir()) {}

  async save(jobId: string, buffer: Buffer, extension: string): Promise<StoredFile> {
    if (!/^[1-9][0-9]*$/.test(jobId)) throw new Error('Invalid job id for storage.');
    const ext = extension.toLowerCase();
    if (ext !== 'jpg' && ext !== 'png' && ext !== 'webp') throw new Error('Unsupported image extension.');
    const storageKey = `job-images/${jobId}/${randomBytes(16).toString('hex')}.${ext}`;
    const absolute = this.pathFor(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return { storageKey, size: buffer.length };
  }

  async saveVoiceNote(jobId: string, buffer: Buffer, extension: string): Promise<StoredFile> {
    if (!/^[1-9][0-9]*$/.test(jobId)) throw new Error('Invalid job id for storage.');
    const ext = extension.toLowerCase();
    if (ext !== 'webm' && ext !== 'mp4' && ext !== 'm4a' && ext !== 'mp3' && ext !== 'wav' && ext !== 'ogg') {
      throw new Error('Unsupported audio extension.');
    }
    const storageKey = `job-voice-notes/${jobId}/${randomBytes(16).toString('hex')}.${ext}`;
    const absolute = this.pathFor(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return { storageKey, size: buffer.length };
  }

  async saveAdminDocument(kind: AdminDocumentKind, id: string, buffer: Buffer, extension: string): Promise<StoredFile> {
    if (!/^[1-9][0-9]*$/.test(id)) throw new Error('Invalid document id for storage.');
    const ext = extension.toLowerCase();
    if (ext !== 'pdf' && ext !== 'jpg' && ext !== 'png' && ext !== 'webp') throw new Error('Unsupported document extension.');
    const storageKey = `${kind === 'certificate' ? 'certificates' : kind}/${id}/${randomBytes(16).toString('hex')}.${ext}`;
    const absolute = this.pathFor(storageKey);
    await mkdir(path.dirname(absolute), { recursive: true });
    await writeFile(absolute, buffer);
    return { storageKey, size: buffer.length };
  }

  async read(storageKey: string): Promise<Buffer | null> {
    const absolute = this.tryResolve(storageKey);
    if (!absolute) return null;
    try {
      return await readFile(absolute);
    } catch {
      return null;
    }
  }

  async remove(storageKey: string): Promise<void> {
    const absolute = this.tryResolve(storageKey);
    if (!absolute) return;
    try {
      await rm(absolute, { force: true });
    } catch {
      // Best effort: metadata deletion already preserves timeline integrity.
    }
  }

  /** Resolve a generated storage key (throws when malformed). */
  private pathFor(storageKey: string): string {
    const absolute = this.tryResolve(storageKey);
    if (!absolute) throw new Error('Invalid storage key.');
    return absolute;
  }

  /** Resolve a storage key to an absolute path, or null when malformed. */
  private tryResolve(storageKey: string): string | null {
    if (!isStorageKey(storageKey)) return null;
    const absolute = path.normalize(path.join(this.baseDir, storageKey));
    const base = path.normalize(this.baseDir + path.sep);
    if (!absolute.startsWith(base)) return null;
    return absolute;
  }
}

/**
 * Detect the true image type from magic bytes — never trust the
 * client-provided extension or MIME type alone.
 */
export function detectImageType(buffer: Buffer): JobImageMime | null {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }
  return null;
}

export function extensionForMime(mime: JobImageMime): 'jpg' | 'png' | 'webp' {
  if (mime === 'image/png') return 'png';
  if (mime === 'image/webp') return 'webp';
  return 'jpg';
}

/**
 * Stage 7D — detect the true audio type from magic bytes / container
 * signatures. Never trust the client-provided extension or MIME alone.
 * Accepted containers: WebM/EBML, MP4/M4A (ftyp), MP3 (ID3 or frame
 * sync), WAV (RIFF....WAVE), Ogg (OggS).
 */
export function detectAudioType(buffer: Buffer): VoiceNoteMime | null {
  if (buffer.length >= 4 && buffer[0] === 0x1a && buffer[1] === 0x45 && buffer[2] === 0xdf && buffer[3] === 0xa3) {
    return 'audio/webm';
  }
  if (
    buffer.length >= 12 &&
    buffer[4] === 0x66 &&
    buffer[5] === 0x74 &&
    buffer[6] === 0x79 &&
    buffer[7] === 0x70
  ) {
    return 'audio/mp4';
  }
  if (buffer.length >= 3 && buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33) {
    return 'audio/mpeg';
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) {
    return 'audio/mpeg';
  }
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x41 &&
    buffer[10] === 0x56 &&
    buffer[11] === 0x45
  ) {
    return 'audio/wav';
  }
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x4f &&
    buffer[1] === 0x67 &&
    buffer[2] === 0x67 &&
    buffer[3] === 0x53
  ) {
    return 'audio/ogg';
  }
  return null;
}

export function extensionForAudioMime(mime: VoiceNoteMime): 'webm' | 'mp4' | 'mp3' | 'wav' | 'ogg' {
  if (mime === 'audio/mp4') return 'mp4';
  if (mime === 'audio/mpeg') return 'mp3';
  if (mime === 'audio/wav') return 'wav';
  if (mime === 'audio/ogg') return 'ogg';
  return 'webm';
}

/** Strip directories, control characters and overlong names from uploads. */
export function sanitizeOriginalFilename(name: string): string {
  const base = path.basename(name).replace(/[-]/g, '').trim();
  const fallback = 'upload';
  const cleaned = base === '' || base === '.' || base === '..' ? fallback : base;
  return cleaned.length > 255 ? cleaned.slice(-255) : cleaned;
}
