import type { UserRepository } from '../users/user.repository';
import { basename } from 'node:path';
import type { FileStorage } from '../../services/file-storage';
import { toSafeUser } from '../users/user.repository';
import { AdminStoreError } from './admin.store';
import type { AdminStore } from './admin.store';
import type {
  AdminBusinessFilters, AdminCertificateFilters, AdminDisputeFilters, AdminJobFilters, AdminProviderFilters,
  AdminReportFilters, AdminReviewFilters, AdminServiceFilters, AdminTechnicianFilters, AdminUserFilters,
  AdminVerificationFilters,
} from './admin.types';
import * as validation from './admin.validation';

export interface AdminServiceResult<T> { status: number; code?: string; message?: string; data?: T; }
const invalid = <T>(message: string): AdminServiceResult<T> => ({ status: 422, code: 'VALIDATION_ERROR', message });
const notFound = <T>(message: string): AdminServiceResult<T> => ({ status: 404, code: 'NOT_FOUND', message });
const conflict = <T>(message: string): AdminServiceResult<T> => ({ status: 409, code: 'CONFLICT', message });
const ADMIN_DOCUMENT_MIMES = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);
const safeDocument = (reference: { mimeType: string; filename: string }): { mimeType: string; filename: string } | null => {
  if (!ADMIN_DOCUMENT_MIMES.has(reference.mimeType)) return null;
  const filename = basename(reference.filename).replace(/[^A-Za-z0-9._-]/g, '_');
  return filename ? { mimeType: reference.mimeType, filename } : null;
};
const storeError = <T>(error: unknown): AdminServiceResult<T> => {
  if (!(error instanceof AdminStoreError)) throw error;
  if (error.code === 'NOT_FOUND') return notFound(error.message);
  if (error.code === 'CONFLICT') return conflict(error.message);
  return { status: 500, code: 'INTERNAL_ERROR', message: 'Request failed. Please try again.' };
};

export interface AdminDocumentResult { buffer: Buffer; mimeType: string; filename: string; size: number; }

export class AdminService {
  constructor(private readonly users: UserRepository, private readonly store: AdminStore, private readonly storage: FileStorage) {}

  async dashboard(): Promise<AdminServiceResult<Awaited<ReturnType<AdminStore['dashboard']>>>> {
    const [dashboard, all, active, pending, suspended] = await Promise.all([
      this.store.dashboard(),
      this.users.listAdminUsers({ search: null, status: null, role: null, page: 1, pageSize: 50 }),
      this.users.listAdminUsers({ search: null, status: 'ACTIVE', role: null, page: 1, pageSize: 1 }),
      this.users.listAdminUsers({ search: null, status: 'PENDING', role: null, page: 1, pageSize: 1 }),
      this.users.listAdminUsers({ search: null, status: 'SUSPENDED', role: null, page: 1, pageSize: 1 }),
    ]);
    return { status: 200, data: { ...dashboard, users: { total: all.total, active: active.total, pending: pending.total, suspended: suspended.total } } };
  }
  async listUsers(query: Record<string, unknown>) { const parsed = validation.parseUsersQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.users.listAdminUsers(parsed.value) }; }
  async getUser(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const user = await this.users.findById(id.value); return user ? { status: 200, data: toSafeUser(user, await this.users.getRoles(user.id)) } : notFound('User not found.'); }
  async setUserStatus(idValue: string, status: 'SUSPENDED' | 'ACTIVE', actorId: string, body: unknown) { const id = validation.validateEntityId(idValue); const bodyCheck = validation.validateNoBodyFields(body); if (id.error) return invalid(id.error); if (bodyCheck.error) return invalid(bodyCheck.error); if (id.value === actorId) return conflict('An administrator cannot change their own account status.'); const user = await this.users.findById(id.value); if (!user) return notFound('User not found.'); if (status === 'ACTIVE' && user.status !== 'SUSPENDED') return conflict('Only suspended users can be reactivated.'); if (status === 'SUSPENDED' && (user.status === 'SUSPENDED' || user.status === 'DELETED')) return conflict('User cannot be suspended from its current state.'); try { const changed = await this.store.setUserStatus(id.value, user.status, status, actorId); return changed ? this.getUser(id.value) : notFound('User not found.'); } catch (error) { return storeError(error); } }
  async listCustomers(query: Record<string, unknown>) { const parsed = validation.parseCustomersQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listCustomers(parsed.value) }; }
  async getCustomer(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getCustomer(id.value); return row ? { status: 200, data: row } : notFound('Customer not found.'); }
  async listProfessionals(query: Record<string, unknown>) { const parsed = validation.parseProfessionalsQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listProfessionals(parsed.value) }; }
  async getProfessional(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getProfessional(id.value); return row ? { status: 200, data: row } : notFound('Professional not found.'); }
  async listBusinesses(query: Record<string, unknown>) { const parsed = validation.parseBusinessesQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listBusinesses(parsed.value) }; }
  async getBusiness(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getBusiness(id.value); return row ? { status: 200, data: row } : notFound('Business not found.'); }
  async listTechnicians(query: Record<string, unknown>) { const parsed = validation.parseTechniciansQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listTechnicians(parsed.value) }; }
  async getTechnician(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getTechnician(id.value); return row ? { status: 200, data: row } : notFound('Technician not found.'); }
  async listServices(query: Record<string, unknown>) { const parsed = validation.parseServicesQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listServices(parsed.value) }; }
  async listServiceCategories() { return { status: 200, data: await this.store.listServiceCategories() }; }
  async getService(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getService(id.value); return row ? { status: 200, data: row } : notFound('Service not found.'); }
  async createService(body: unknown, actorId: string) { const parsed = validation.validateService(body); if (parsed.error || !parsed.value) return invalid(parsed.error ?? 'Invalid service.'); try { return { status: 201, data: await this.store.createService(parsed.value, actorId) }; } catch (error) { return storeError(error); } }
  async updateService(idValue: string, body: unknown, actorId: string) { const id = validation.validateEntityId(idValue); const parsed = validation.validateService(body, true); if (id.error) return invalid(id.error); if (parsed.error || !parsed.value) return invalid(parsed.error ?? 'Invalid service.'); try { const row = await this.store.updateService(id.value, parsed.value, actorId); return row ? { status: 200, data: row } : notFound('Service not found.'); } catch (error) { return storeError(error); } }
  async setServiceActive(idValue: string, active: boolean, actorId: string, body: unknown) { const id = validation.validateEntityId(idValue); const bodyCheck = validation.validateNoBodyFields(body); if (id.error) return invalid(id.error); if (bodyCheck.error) return invalid(bodyCheck.error); const existing = await this.store.getService(id.value); if (!existing) return notFound('Service not found.'); if (existing.isActive === active) return conflict(`Service is already ${active ? 'active' : 'inactive'}.`); try { const row = await this.store.updateService(id.value, { isActive: active }, actorId); return row ? { status: 200, data: row } : notFound('Service not found.'); } catch (error) { return storeError(error); } }
  async listJobs(query: Record<string, unknown>) { const parsed = validation.parseJobsQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listJobs(parsed.value) }; }
  async getJob(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getJob(id.value); return row ? { status: 200, data: row } : notFound('Job not found.'); }
  async listVerifications(query: Record<string, unknown>) { const parsed = validation.parseVerificationsQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listVerifications(parsed.value) }; }
  async getVerification(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getVerification(id.value); return row ? { status: 200, data: row } : notFound('Verification request not found.'); }
  async decideVerification(idValue: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO', body: unknown, actorId: string) { const id = validation.validateEntityId(idValue); const parsed = validation.validateVerificationDecision(body, decision); if (id.error) return invalid(id.error); if (parsed.error) return invalid(parsed.error); try { const row = await this.store.decideVerification(id.value, decision, parsed.value, actorId); return row ? { status: 200, data: row } : notFound('Verification request not found.'); } catch (error) { return storeError(error); } }
  async getVerificationDocument(idValue: string, actorId: string): Promise<AdminServiceResult<AdminDocumentResult>> { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const reference = await this.store.getVerificationDocument(id.value); if (!reference) return notFound('Verification document not found.'); const safe = safeDocument(reference); if (!safe) return notFound('Verification document not found.'); const buffer = await this.storage.read(reference.storageKey); if (!buffer) return notFound('Verification document not found.'); await this.store.appendAudit('VERIFICATION_DOCUMENT_VIEWED', 'VERIFICATION_REQUEST', id.value, actorId); return { status: 200, data: { buffer, mimeType: safe.mimeType, filename: safe.filename, size: buffer.length } }; }
  async getCertificateDocument(idValue: string, actorId: string): Promise<AdminServiceResult<AdminDocumentResult>> { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const reference = await this.store.getCertificateDocument(id.value); if (!reference) return notFound('Certificate document not found.'); const safe = safeDocument(reference); if (!safe) return notFound('Certificate document not found.'); const buffer = await this.storage.read(reference.storageKey); if (!buffer) return notFound('Certificate document not found.'); await this.store.appendAudit('CERTIFICATE_DOCUMENT_VIEWED', 'CERTIFICATE', id.value, actorId); return { status: 200, data: { buffer, mimeType: safe.mimeType, filename: safe.filename, size: buffer.length } }; }
  async listCertificates(query: Record<string, unknown>) { const parsed = validation.parseCertificatesQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listCertificates(parsed.value) }; }
  async getCertificate(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getCertificate(id.value); return row ? { status: 200, data: row } : notFound('Certificate not found.'); }
  async decideCertificate(idValue: string, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO', body: unknown, actorId: string) { const id = validation.validateEntityId(idValue); const parsed = validation.validateCertificateDecision(body, decision); if (id.error) return invalid(id.error); if (parsed.error) return invalid(parsed.error); try { const row = await this.store.decideCertificate(id.value, decision, parsed.value, actorId); return row ? { status: 200, data: row } : notFound('Certificate not found.'); } catch (error) { return storeError(error); } }
  async listReviews(query: Record<string, unknown>) { const parsed = validation.parseReviewsQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listReviews(parsed.value) }; }
  async getReview(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getReview(id.value); return row ? { status: 200, data: row } : notFound('Review not found.'); }
  async listReports(query: Record<string, unknown>) { const parsed = validation.parseReportsQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listReports(parsed.value) }; }
  async getReport(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getReport(id.value); return row ? { status: 200, data: row } : notFound('Report not found.'); }
  async updateReport(idValue: string, body: unknown, actorId: string) { const id = validation.validateEntityId(idValue); const parsed = validation.validateReportStatus(body); if (id.error) return invalid(id.error); if (parsed.error) return invalid(parsed.error); const current = await this.store.getReport(id.value); if (!current) return notFound('Report not found.'); try { const row = await this.store.updateReportStatus(id.value, current.status, parsed.value, actorId); return row ? { status: 200, data: row } : notFound('Report not found.'); } catch (error) { return storeError(error); } }
  async listDisputes(query: Record<string, unknown>) { const parsed = validation.parseDisputesQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listDisputes(parsed.value) }; }
  async getDispute(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getDispute(id.value); return row ? { status: 200, data: row } : notFound('Dispute not found.'); }
  async updateDispute(idValue: string, body: unknown, actorId: string) { const id = validation.validateEntityId(idValue); const parsed = validation.validateDisputeUpdate(body); if (id.error) return invalid(id.error); if (parsed.error) return invalid(parsed.error); const current = await this.store.getDispute(id.value); if (!current) return notFound('Dispute not found.'); try { const row = await this.store.updateDispute(id.value, current.status, parsed.value, actorId); return row ? { status: 200, data: row } : notFound('Dispute not found.'); } catch (error) { return storeError(error); } }
  async listAuditLogs(query: Record<string, unknown>) { const parsed = validation.parseAuditQuery(query); return parsed.error ? invalid(parsed.error) : { status: 200, data: await this.store.listAuditLogs(parsed.value) }; }
  async getAuditLog(idValue: string) { const id = validation.validateEntityId(idValue); if (id.error) return invalid(id.error); const row = await this.store.getAuditLog(id.value); return row ? { status: 200, data: row } : notFound('Audit log not found.'); }
}
