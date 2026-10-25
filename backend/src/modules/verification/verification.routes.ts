import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { makeVerificationService } from './verification.service';
import { ok, fail } from '../../utils/response';
import type { FileStorage } from '../../services/file-storage';
import type { UserRepository } from '../users/user.repository';
import { Router } from 'express';
import multer from 'multer';
import type { VerificationDocumentStore } from './verification.store';

export function makeVerificationRoutes(
  storage: FileStorage,
  users: UserRepository,
  documents: VerificationDocumentStore,
) {
  const router = Router();
  // Verification documents: held in memory (5 MB cap, same as the other upload
  // routes) and handed to the service as req.file. Field name: `file`.
  const documentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  const service = makeVerificationService(storage, users, documents);

  router.get('/verification/status', async (req: Request, res: Response): Promise<void> => {
    await service.getVerificationStatus(req, res);
  });

  router.post(
    '/verification/document',
    (req: Request, res: Response, next: () => void): void => {
      documentUpload.single('file')(req, res, (err: unknown) => {
        if (err) {
          const tooLarge = err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE';
          fail(
            res,
            'VALIDATION_ERROR',
            tooLarge ? 'File is too large. Maximum size is 5 MB.' : 'Could not read the uploaded file.',
            400,
          );
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response): Promise<void> => {
      await service.uploadDocument(req, res);
    },
  );

  router.delete('/verification/document/:type', async (req: Request, res: Response): Promise<void> => {
    await service.deleteDocument(req, res);
  });

  router.get('/verification/document/:id/file', async (req: Request, res: Response): Promise<void> => {
    await service.viewDocument(req, res);
  });

  router.post('/verification/phone-code', async (req: Request, res: Response): Promise<void> => {
    await service.sendPhoneCode(req, res);
  });

  router.post('/verification/phone-code/confirm', async (req: Request, res: Response): Promise<void> => {
    await service.confirmPhoneCode(req, res);
  });

  router.post('/verification/email-link', async (req: Request, res: Response): Promise<void> => {
    await service.sendEmailLink(req, res);
  });

  router.get('/verification/email-confirm', async (req: Request, res: Response): Promise<void> => {
    await service.confirmEmail(req, res);
  });

  router.get('/verification/phone-code/rate-limit', async (req: Request, res: Response): Promise<void> => {
    await service.checkPhoneCodeRateLimit(req, res);
  });

  return router;
}