import { JOB_IMAGE_MAX_BYTES, detectImageType } from '../../services/file-storage';

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
  // Validate magic bytes - never trust client-provided MIME type
  const detected = detectImageType(file.buffer);
  if (!detected) {
    // Not an image - check if it's a PDF
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