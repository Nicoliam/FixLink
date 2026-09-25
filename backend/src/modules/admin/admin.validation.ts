import type {
  AdminAuditFilters,
  AdminBusinessFilters,
  AdminCertificateFilters,
  AdminDisputeFilters,
  AdminJobFilters,
  AdminProviderFilters,
  AdminReportFilters,
  AdminReviewFilters,
  AdminServiceFilters,
  AdminTechnicianFilters,
  AdminUserFilters,
  AdminVerificationFilters,
  DisputeUpdateInput,
  ReportStatusInput,
  ServiceMutationInput,
  VerificationDecisionInput,
  CertificateDecisionInput,
} from './admin.types';

type Result<T> = { value: T; error: string | null };
type Query = Record<string, unknown>;
const PAGE_MAX = 1000;
const PAGE_SIZE_MAX = 50;
const TEXT_MAX = 128;

function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown, required = false): Result<string | null> {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) return { value: required ? null : null, error: required ? 'Value is required.' : null };
  if (typeof value !== 'string' || value.trim().length > TEXT_MAX) return { value: null as never, error: 'Invalid text value.' };
  return { value: value.trim(), error: null };
}
function number(value: unknown, label: string, min: number, max: number, fallback = min): Result<number> {
  if (value === undefined || value === null || String(value).trim() === '') return { value: fallback, error: null };
  const parsed = Number(String(value).trim());
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return { value: null as never, error: `Invalid ${label}.` };
  return { value: parsed, error: null };
}
function enumValue<T extends string>(value: unknown, values: readonly T[], label: string): Result<T | null> {
  if (value === undefined || value === null || value === '') return { value: null as never, error: null };
  if (typeof value !== 'string' || !values.includes(value as T)) return { value: null as never, error: `Invalid ${label}.` };
  return { value: value as T, error: null };
}
function boolean(value: unknown): Result<boolean | null> {
  if (value === undefined || value === null || value === '') return { value: null as never, error: null };
  if (typeof value === 'boolean') return { value, error: null };
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return { value: true, error: null };
    if (['false', '0', 'no'].includes(normalized)) return { value: false, error: null };
  }
  return { value: null as never, error: 'Invalid boolean filter.' };
}
function isoDate(value: unknown, label: string): Result<string | null> {
  if (value === undefined || value === null || value === '') return { value: null as never, error: null };
  if (typeof value !== 'string' || value.length > 64) return { value: null as never, error: `Invalid ${label}; use an ISO date.` };
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) {
    const year = Number(dateOnly[1]); const month = Number(dateOnly[2]); const day = Number(dateOnly[3]);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return { value: null as never, error: `Invalid ${label}; use an ISO date.` };
    return { value, error: null };
  }
  if (!/^\d{4}-\d{2}-\d{2}T[^ ]+(?:Z|[+-]\d{2}:?\d{2})$/.test(value) || Number.isNaN(Date.parse(value))) return { value: null as never, error: `Invalid ${label}; use an ISO date.` };
  return { value, error: null };
}
function dateBoundary(value: string, end = false): number {
  return Date.parse(value.length === 10 && end ? `${value}T23:59:59.999Z` : value.length === 10 ? `${value}T00:00:00.000Z` : value);
}
function id(value: unknown, label: string): Result<string | null> {
  if (value === undefined || value === null || value === '') return { value: null as never, error: null };
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value.trim())) return { value: null as never, error: `Invalid ${label}.` };
  return { value: value.trim(), error: null };
}
function queryBase(query: Query, allowed: string[]): Result<{ search: string | null; page: number; pageSize: number }> {
  for (const key of Object.keys(query)) if (!allowed.includes(key)) return { value: null as never, error: `Unsupported query parameter: "${key}".` };
  const search = text(query.search ?? query.q, false);
  const page = number(query.page, 'page', 1, PAGE_MAX);
  const pageSize = number(query.pageSize ?? query.page_size, 'pageSize', 1, PAGE_SIZE_MAX, 20);
  if (search.error) return { value: null as never, error: search.error };
  if (page.error) return { value: null as never, error: page.error };
  if (pageSize.error) return { value: null as never, error: pageSize.error };
  return { value: { search: search.value, page: page.value, pageSize: pageSize.value }, error: null };
}

export function parseUsersQuery(query: Query): Result<AdminUserFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'status', 'role']);
  if (base.error) return { value: null as never, error: base.error };
  const status = enumValue(query.status, ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED'], 'user status');
  const role = enumValue(query.role, ['CUSTOMER', 'PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER', 'TECHNICIAN', 'ADMIN'], 'role');
  if (status.error || role.error) return { value: null as never, error: status.error ?? role.error };
  return { value: { ...base.value, status: status.value, role: role.value }, error: null };
}
export function parseCustomersQuery(query: Query): Result<{ search: string | null; page: number; pageSize: number }> { return queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size']); }
export function parseProfessionalsQuery(query: Query): Result<AdminProviderFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'status', 'verificationStatus']);
  const status = enumValue(query.status ?? query.verificationStatus, ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'], 'verification status');
  if (base.error || status.error) return { value: null as never, error: base.error ?? status.error };
  return { value: { ...base.value, status: status.value }, error: null };
}
export function parseBusinessesQuery(query: Query): Result<AdminBusinessFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'status', 'verificationStatus']);
  const status = enumValue(query.status ?? query.verificationStatus, ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'], 'verification status');
  if (base.error || status.error) return { value: null as never, error: base.error ?? status.error };
  return { value: { ...base.value, status: status.value }, error: null };
}
export function parseTechniciansQuery(query: Query): Result<AdminTechnicianFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'businessId', 'business_id', 'isActive', 'active']);
  const businessId = id(query.businessId ?? query.business_id, 'businessId');
  const active = boolean(query.isActive ?? query.active);
  if (base.error || businessId.error || active.error) return { value: null as never, error: base.error ?? businessId.error ?? active.error };
  return { value: { ...base.value, businessId: businessId.value, isActive: active.value }, error: null };
}
export function parseServicesQuery(query: Query): Result<AdminServiceFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'categoryId', 'category_id', 'status', 'isActive', 'active']);
  const categoryId = id(query.categoryId ?? query.category_id, 'categoryId');
  const active = boolean(query.isActive ?? query.active);
  const status = enumValue(query.status, ['ACTIVE', 'INACTIVE'], 'service status');
  if (base.error || categoryId.error || active.error || status.error) return { value: null as never, error: base.error ?? categoryId.error ?? active.error ?? status.error };
  return { value: { ...base.value, categoryId: categoryId.value, isActive: active.value ?? (status.value === 'ACTIVE' ? true : status.value === 'INACTIVE' ? false : null) }, error: null };
}
export function parseJobsQuery(query: Query): Result<AdminJobFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'source', 'status', 'from', 'to', 'customerId', 'customer_id', 'professionalId', 'professional_id', 'businessId', 'business_id']);
  const source = enumValue(query.source, ['MARKETPLACE', 'INTERNAL'], 'job source');
  const status = enumValue(query.status, ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CONFIRMED', 'CLOSED', 'CANCELLED', 'DISPUTED'], 'job status');
  const from = isoDate(query.from, 'from date'); const to = isoDate(query.to, 'to date');
  const customerId = id(query.customerId ?? query.customer_id, 'customerId'); const professionalId = id(query.professionalId ?? query.professional_id, 'professionalId'); const businessId = id(query.businessId ?? query.business_id, 'businessId');
  if (base.error || source.error || status.error || from.error || to.error || customerId.error || professionalId.error || businessId.error) return { value: null as never, error: base.error ?? source.error ?? status.error ?? from.error ?? to.error ?? customerId.error ?? professionalId.error ?? businessId.error };
  if (from.value && to.value && dateBoundary(from.value) > dateBoundary(to.value, true)) return { value: null as never, error: 'The from date must be before the to date.' };
  return { value: { ...base.value, source: source.value, status: status.value, from: from.value, to: to.value, customerId: customerId.value, professionalId: professionalId.value, businessId: businessId.value }, error: null };
}
export function parseVerificationsQuery(query: Query): Result<AdminVerificationFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'type', 'status', 'userId', 'user_id']);
  const type = enumValue(query.type, ['IDENTITY', 'CERTIFICATE', 'BUSINESS'], 'verification type'); const status = enumValue(query.status, ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'], 'verification status'); const userId = id(query.userId ?? query.user_id, 'userId');
  if (base.error || type.error || status.error || userId.error) return { value: null as never, error: base.error ?? type.error ?? status.error ?? userId.error };
  return { value: { ...base.value, type: type.value, status: status.value, userId: userId.value }, error: null };
}
export function parseCertificatesQuery(query: Query): Result<AdminCertificateFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'status', 'professionalId', 'professional_id', 'businessId', 'business_id']);
  const status = enumValue(query.status, ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO'], 'certificate status'); const professionalId = id(query.professionalId ?? query.professional_id, 'professionalId'); const businessId = id(query.businessId ?? query.business_id, 'businessId');
  if (base.error || status.error || professionalId.error || businessId.error) return { value: null as never, error: base.error ?? status.error ?? professionalId.error ?? businessId.error };
  return { value: { ...base.value, status: status.value, professionalId: professionalId.value, businessId: businessId.value }, error: null };
}
export function parseReviewsQuery(query: Query): Result<AdminReviewFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'rating', 'minRating', 'min_rating', 'maxRating', 'max_rating']);
  const rating = number(query.rating, 'rating', 1, 5, 0); const minRating = number(query.minRating ?? query.min_rating, 'minRating', 1, 5, 0); const maxRating = number(query.maxRating ?? query.max_rating, 'maxRating', 1, 5, 0);
  if (base.error || rating.error || minRating.error || maxRating.error) return { value: null as never, error: base.error ?? rating.error ?? minRating.error ?? maxRating.error };
  return { value: { ...base.value, rating: rating.value >= 1 ? rating.value : null, minRating: minRating.value >= 1 ? minRating.value : null, maxRating: maxRating.value >= 1 ? maxRating.value : null }, error: null };
}
export function parseReportsQuery(query: Query): Result<AdminReportFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'type', 'reportType', 'report_type', 'status']);
  const type = enumValue(query.type ?? query.reportType ?? query.report_type, ['PROVIDER', 'REVIEW', 'JOB', 'USER', 'CONTENT'], 'report type'); const status = enumValue(query.status, ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'], 'report status');
  if (base.error || type.error || status.error) return { value: null as never, error: base.error ?? type.error ?? status.error };
  return { value: { ...base.value, type: type.value, status: status.value }, error: null };
}
export function parseDisputesQuery(query: Query): Result<AdminDisputeFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'status']); const status = enumValue(query.status, ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'], 'dispute status');
  if (base.error || status.error) return { value: null as never, error: base.error ?? status.error };
  return { value: { ...base.value, status: status.value }, error: null };
}
export function parseAuditQuery(query: Query): Result<AdminAuditFilters> {
  const base = queryBase(query, ['search', 'q', 'page', 'pageSize', 'page_size', 'actorId', 'actor_id', 'action', 'entityType', 'entity_type', 'entityId', 'entity_id', 'from', 'to']);
  const actorId = id(query.actorId ?? query.actor_id, 'actorId'); const action = text(query.action); const entityType = text(query.entityType ?? query.entity_type); const entityId = id(query.entityId ?? query.entity_id, 'entityId'); const from = isoDate(query.from, 'from date'); const to = isoDate(query.to, 'to date');
  if (base.error || actorId.error || action.error || entityType.error || entityId.error || from.error || to.error) return { value: null as never, error: base.error ?? actorId.error ?? action.error ?? entityType.error ?? entityId.error ?? from.error ?? to.error };
  if (from.value && to.value && dateBoundary(from.value) > dateBoundary(to.value, true)) return { value: null as never, error: 'The from date must be before the to date.' };
  return { value: { ...base.value, actorId: actorId.value, action: action.value, entityType: entityType.value, entityId: entityId.value, from: from.value, to: to.value }, error: null };
}

function strictBody(body: unknown, allowed: string[]): Result<Record<string, unknown>> { if (!record(body)) return { value: null as never, error: 'Request body must be an object.' }; const unknown = Object.keys(body).find((key) => !allowed.includes(key)); return unknown ? { value: null as never, error: `Unsupported field: "${unknown}".` } : { value: body, error: null }; }
export function validateNoBodyFields(body: unknown): Result<Record<string, never>> { if (body === undefined) return { value: {} as Record<string, never>, error: null }; return strictBody(body, []) as Result<Record<string, never>>; }
function notes(value: unknown, required: boolean): Result<string | null> { if (value === undefined || value === null) return { value: null as never, error: required ? 'Notes are required.' : null }; if (typeof value !== 'string' || value.trim().length < 1 || value.trim().length > 1000) return { value: null as never, error: 'Notes must be 1–1000 characters.' }; return { value: value.trim(), error: null }; }
export function validateService(body: unknown, partial = false): Result<ServiceMutationInput | null> { const allowed = ['categoryId', 'name', 'slug', 'description', 'sortOrder', 'isActive']; const parsed = strictBody(body, allowed); if (parsed.error) return { value: null as never, error: parsed.error }; const b = parsed.value; const result: Partial<ServiceMutationInput> = {}; if (!partial || b.categoryId !== undefined) { const v = id(b.categoryId, 'categoryId'); if (v.error) return { value: null as never, error: v.error }; result.categoryId = v.value as string; } if (!partial || b.name !== undefined) { const v = text(b.name, true); if (v.error) return { value: null as never, error: v.error }; result.name = v.value as string; } if (!partial || b.slug !== undefined) { const v = text(b.slug, true); if (v.error) return { value: null as never, error: v.error }; result.slug = v.value as string; } if (b.description !== undefined) { const v = text(b.description); if (v.error) return { value: null as never, error: v.error }; result.description = v.value; } if (!partial || b.sortOrder !== undefined) { const v = number(b.sortOrder, 'sortOrder', 0, 100000); if (v.error) return { value: null as never, error: v.error }; result.sortOrder = v.value; } if (!partial || b.isActive !== undefined) { const v = boolean(b.isActive); if (v.error) return { value: null as never, error: v.error }; result.isActive = v.value ?? true; } if (partial && Object.keys(result).length === 0) return { value: null as never, error: 'No service changes supplied.' }; return { value: result as ServiceMutationInput, error: null }; }
export function validateVerificationDecision(body: unknown, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'): Result<VerificationDecisionInput> { const parsed = strictBody(body, ['notes']); if (parsed.error) return { value: null as never, error: parsed.error }; const value = notes(parsed.value.notes, decision !== 'APPROVED'); if (value.error) return { value: null as never, error: value.error }; return { value: { notes: value.value }, error: null }; }
export function validateCertificateDecision(body: unknown, decision: 'APPROVED' | 'REJECTED' | 'NEEDS_INFO'): Result<CertificateDecisionInput> { const parsed = strictBody(body, ['notes']); if (parsed.error) return { value: null as never, error: parsed.error }; const value = notes(parsed.value.notes, decision !== 'APPROVED'); if (value.error) return { value: null as never, error: value.error }; return { value: { notes: value.value }, error: null }; }
export function validateReportStatus(body: unknown): Result<ReportStatusInput> { const parsed = strictBody(body, ['status']); if (parsed.error) return { value: null as never, error: parsed.error }; const value = enumValue(parsed.value.status, ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'], 'report status'); if (value.error || !value.value) return { value: null as never, error: value.error ?? 'Status is required.' }; return { value: { status: value.value }, error: null }; }
export function validateDisputeUpdate(body: unknown): Result<DisputeUpdateInput> { const parsed = strictBody(body, ['status', 'resolution']); if (parsed.error) return { value: null as never, error: parsed.error }; const value = enumValue(parsed.value.status, ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'], 'dispute status'); const resolution = notes(parsed.value.resolution, value.value === 'RESOLVED' || value.value === 'CLOSED'); if (value.error || !value.value) return { value: null as never, error: value.error ?? 'Status is required.' }; if (resolution.error) return { value: null as never, error: resolution.error }; return { value: { status: value.value, resolution: resolution.value }, error: null }; }
export function validateEntityId(value: unknown): Result<string> { const parsed = id(value, 'resource id'); return parsed.error || !parsed.value ? { value: null as never, error: parsed.error ?? 'Invalid resource id.' } : { value: parsed.value, error: null }; }
