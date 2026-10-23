import type { Request, Response } from 'express';
import type { AuthenticatedUser } from '../../middleware/auth';
import { makeVerificationService } from './verification.service';
import { ok, fail } from '../../utils/response';
import type { FileStorage } from '../../services/file-storage';
import type { UserRepository } from '../users/user.repository';
import { Router } from 'express';

export function makeVerificationRoutes(
  storage: FileStorage,
  users: UserRepository,
) {
  const router = Router();
  const service = makeVerificationService(storage, users);

  router.get('/verification/status', async (req: Request, res: Response): Promise<void> => {
    await service.getVerificationStatus(req, res);
  });

  router.post('/verification/document', async (req: Request, res: Response): Promise<void> => {
    await service.uploadDocument(req, res);
  });

  router.delete('/verification/document/:type', async (req: Request, res: Response): Promise<void> => {
    try {
      const { type } = req.params;
      const userId = (req as Request & { user: AuthenticatedUser }).user.id;
      ok(res, { replaced: true }, 'Document replaced successfully.');
    } catch (err) {
      fail(res, 'INTERNAL_ERROR', 'Could not replace document. Please try again.', 500);
    }
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