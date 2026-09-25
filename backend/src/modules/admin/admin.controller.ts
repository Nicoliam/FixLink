import type { Request, Response } from 'express';
import { fail, ok } from '../../utils/response';
import type { AdminService, AdminServiceResult } from './admin.service';

const param = (req: Request, name: string): string => String(req.params[name] ?? '');
const actor = (req: Request): string => (req as Request & { user: { id: string } }).user.id;
const id = (req: Request): string => param(req, 'id');
const result = <T>(res: Response, value: AdminServiceResult<T>): void => { if (value.data !== undefined) ok(res, value.data, 'Success', value.status); else fail(res, (value.code ?? 'INTERNAL_ERROR') as never, value.message ?? 'Request failed.', value.status); };
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response): void => { void fn(req, res).catch(() => fail(res, 'INTERNAL_ERROR', 'Request failed. Please try again.', 500)); };

export function makeAdminController(service: AdminService) {
  return {
    dashboard: wrap(async (_req, res) => result(res, await service.dashboard())),
    listUsers: wrap(async (req, res) => result(res, await service.listUsers(req.query as Record<string, unknown>))),
    getUser: wrap(async (req, res) => result(res, await service.getUser(id(req)))),
    suspendUser: wrap(async (req, res) => result(res, await service.setUserStatus(id(req), 'SUSPENDED', actor(req), req.body))),
    reactivateUser: wrap(async (req, res) => result(res, await service.setUserStatus(id(req), 'ACTIVE', actor(req), req.body))),
    listCustomers: wrap(async (req, res) => result(res, await service.listCustomers(req.query as Record<string, unknown>))),
    getCustomer: wrap(async (req, res) => result(res, await service.getCustomer(id(req)))),
    listProfessionals: wrap(async (req, res) => result(res, await service.listProfessionals(req.query as Record<string, unknown>))),
    getProfessional: wrap(async (req, res) => result(res, await service.getProfessional(id(req)))),
    listBusinesses: wrap(async (req, res) => result(res, await service.listBusinesses(req.query as Record<string, unknown>))),
    getBusiness: wrap(async (req, res) => result(res, await service.getBusiness(id(req)))),
    listTechnicians: wrap(async (req, res) => result(res, await service.listTechnicians(req.query as Record<string, unknown>))),
    getTechnician: wrap(async (req, res) => result(res, await service.getTechnician(id(req)))),
    listServices: wrap(async (req, res) => result(res, await service.listServices(req.query as Record<string, unknown>))),
    listServiceCategories: wrap(async (_req, res) => result(res, await service.listServiceCategories())),
    getService: wrap(async (req, res) => result(res, await service.getService(id(req)))),
    createService: wrap(async (req, res) => result(res, await service.createService(req.body, actor(req)))),
    updateService: wrap(async (req, res) => result(res, await service.updateService(id(req), req.body, actor(req)))),
    activateService: wrap(async (req, res) => result(res, await service.setServiceActive(id(req), true, actor(req), req.body))),
    deactivateService: wrap(async (req, res) => result(res, await service.setServiceActive(id(req), false, actor(req), req.body))),
    listJobs: wrap(async (req, res) => result(res, await service.listJobs(req.query as Record<string, unknown>))),
    getJob: wrap(async (req, res) => result(res, await service.getJob(id(req)))),
    listVerifications: wrap(async (req, res) => result(res, await service.listVerifications(req.query as Record<string, unknown>))),
    getVerification: wrap(async (req, res) => result(res, await service.getVerification(id(req)))),
    getVerificationDocument: wrap(async (req, res) => {
      const value = await service.getVerificationDocument(id(req), actor(req));
      if (value.data === undefined) { result(res, value); return; }
      res.status(value.status).setHeader('Content-Type', value.data.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${value.data.filename}"`);
      res.setHeader('Content-Length', String(value.data.size));
      res.send(value.data.buffer);
    }),
    approveVerification: wrap(async (req, res) => result(res, await service.decideVerification(id(req), 'APPROVED', req.body, actor(req)))),
    rejectVerification: wrap(async (req, res) => result(res, await service.decideVerification(id(req), 'REJECTED', req.body, actor(req)))),
    requestVerificationInfo: wrap(async (req, res) => result(res, await service.decideVerification(id(req), 'NEEDS_INFO', req.body, actor(req)))),
    listCertificates: wrap(async (req, res) => result(res, await service.listCertificates(req.query as Record<string, unknown>))),
    getCertificate: wrap(async (req, res) => result(res, await service.getCertificate(id(req)))),
    getCertificateDocument: wrap(async (req, res) => {
      const value = await service.getCertificateDocument(id(req), actor(req));
      if (value.data === undefined) { result(res, value); return; }
      res.status(value.status).setHeader('Content-Type', value.data.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${value.data.filename}"`);
      res.setHeader('Content-Length', String(value.data.size));
      res.send(value.data.buffer);
    }),
    approveCertificate: wrap(async (req, res) => result(res, await service.decideCertificate(id(req), 'APPROVED', req.body, actor(req)))),
    rejectCertificate: wrap(async (req, res) => result(res, await service.decideCertificate(id(req), 'REJECTED', req.body, actor(req)))),
    requestCertificateInfo: wrap(async (req, res) => result(res, await service.decideCertificate(id(req), 'NEEDS_INFO', req.body, actor(req)))),
    listReviews: wrap(async (req, res) => result(res, await service.listReviews(req.query as Record<string, unknown>))),
    getReview: wrap(async (req, res) => result(res, await service.getReview(id(req)))),
    listReports: wrap(async (req, res) => result(res, await service.listReports(req.query as Record<string, unknown>))),
    getReport: wrap(async (req, res) => result(res, await service.getReport(id(req)))),
    updateReport: wrap(async (req, res) => result(res, await service.updateReport(id(req), req.body, actor(req)))),
    listDisputes: wrap(async (req, res) => result(res, await service.listDisputes(req.query as Record<string, unknown>))),
    getDispute: wrap(async (req, res) => result(res, await service.getDispute(id(req)))),
    updateDispute: wrap(async (req, res) => result(res, await service.updateDispute(id(req), req.body, actor(req)))),
    listAuditLogs: wrap(async (req, res) => result(res, await service.listAuditLogs(req.query as Record<string, unknown>))),
    getAuditLog: wrap(async (req, res) => result(res, await service.getAuditLog(id(req)))),
  };
}
