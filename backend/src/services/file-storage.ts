/**
 * FixLink Stage 6F — file-storage abstraction (MVP local adapter).
 *
 * Flow: User → Backend → File Storage → Metadata → MySQL.
 * The database stores only metadata (`job_images.file_reference` and
 * friends); binary bytes live outside MySQL. This module is the single
 * seam where a future object-storage implementation (S3-compatible) can
 * replace the local adapter without touching API or database code.
 *
 * Security: storage keys are generated server-side (`job-images/<jobId>/
 * <randomHex>.<ext>`); original filenames are never used for paths, so
 * path traversal is impossible. Raw filesystem paths are never exposed
 * through the API — retrieval goes through an authorized backend route.
 */
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import * as path from 'node:path';

export const JOB_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

export const JOB_IMAGE_ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type JobImageMime = (typeof JOB_IMAGE_ALLOWED_MIME)[number];

export interface StoredFile {
  /** Opaque key stored in `job_images.file_reference` (never a filesystem path). */
  storageKey: string;
  size: number;
}

export interface FileStorage {
  save(jobId: string, buffer: Buffer, extension: string): Promise<StoredFile>;
  read(storageKey: string): Promise<Buffer | null>;
  remove(storageKey: string): Promise<void>;
}

const STORAGE_KEY_PATTERN = /^job-images\/[1-9][0-9]*\/[0-9a-f]{32}\.(jpg|png|webp)$/;

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
    if (!STORAGE_KEY_PATTERN.test(storageKey)) return null;
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

/** Strip directories, control characters and overlong names from uploads. */
export function sanitizeOriginalFilename(name: string): string {
  const base = path.basename(name).replace(/[-]/g, '').trim();
  const fallback = 'upload';
  const cleaned = base === '' || base === '.' || base === '..' ? fallback : base;
  return cleaned.length > 255 ? cleaned.slice(-255) : cleaned;
}
