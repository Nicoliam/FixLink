import { Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AdminDashboardComponent } from './admin-dashboard';
import { AdminDetailPage } from './admin-detail-page';
import { AdminResourcePage } from './admin-resource-page';
import { AdminServiceEditor } from './admin-service-editor';
import { AdminNotFoundComponent } from './admin-not-found';
import { AdminApiService } from '../../core/services/admin-api.service';
import type { AdminDashboard, AdminListItem, AdminResource, AdminUser } from '../../core/models/admin.model';

const user: AdminUser = { id: '9', email: 'person@example.co.za', phone: null, status: 'ACTIVE', roles: ['CUSTOMER'], emailVerifiedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-02', lastLoginAt: '2026-01-02T10:00:00.000Z' };
@Component({ template: '' })
class DummyComponent {}
const dashboard: AdminDashboard = { users: { total: 2, active: 1, pending: 1, suspended: 0 }, customers: 2, professionals: { total: 1, verified: 1, pending: 0 }, businesses: { total: 1, verified: 1, pending: 0 }, technicians: { total: 2, active: 2 }, services: { total: 3, active: 3, inactive: 0 }, jobs: { total: 4, open: 1, inProgress: 1, completed: 2 }, verification: { pending: 2, needsInfo: 0 }, certificates: { pending: 1, needsInfo: 0 }, reports: { open: 1, inReview: 0 }, disputes: { open: 0, inReview: 1 } };

function list(item: AdminListItem = user) { return of({ items: [item], total: 21, page: 1, pageSize: 20 }); }
function routeData(resource: AdminResource, id: string | null = '9') { return { snapshot: { data: { resource }, paramMap: { get: (key: string) => key === 'id' ? id : null }, queryParamMap: { get: () => null } } }; }

async function configure<T>(component: Type<T>, resource: AdminResource, api: Record<string, ReturnType<typeof vi.fn>>, id: string | null = '9'): Promise<ComponentFixture<T>> {
  await TestBed.configureTestingModule({ imports: [component], providers: [provideRouter([{ path: 'admin/services', component: DummyComponent }, { path: 'admin', component: DummyComponent }]), { provide: ActivatedRoute, useValue: routeData(resource, id) }, { provide: AdminApiService, useValue: api }] }).compileComponents();
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  return fixture;
}

describe('admin screens', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('renders the operations dashboard and its queues', async () => {
    const fixture = await configure<AdminDashboardComponent>(AdminDashboardComponent, 'users', { getDashboard: vi.fn().mockReturnValue(of(dashboard)) });
    expect((fixture.nativeElement.textContent as string)).toContain('Dashboard');
    expect((fixture.nativeElement.textContent as string)).toContain('Verification requests');
    expect((fixture.nativeElement.textContent as string)).toContain('2');
  });

  it('renders the admin not-found screen', async () => {
    const fixture = await configure<AdminNotFoundComponent>(AdminNotFoundComponent, 'users', {});
    expect((fixture.nativeElement.textContent as string)).toContain('Page not found');
    expect((fixture.nativeElement.textContent as string)).toContain('Back to dashboard');
  });

  it('renders loading and error states for resource lists', async () => {
    const fixture = await configure<AdminResourcePage>(AdminResourcePage, 'users', { listUsers: vi.fn().mockReturnValue(throwError(() => ({ error: { error: { message: 'Service unavailable' } } }))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Service unavailable');
  });

  it.each([
    ['users', 'Users'], ['customers', 'Customers'], ['professionals', 'Professionals'], ['businesses', 'Businesses'], ['technicians', 'Technicians'], ['services', 'Services'], ['jobs', 'Jobs'], ['verifications', 'Verification'], ['certificates', 'Certificates'], ['reviews', 'Reviews'], ['reports', 'Reports'], ['disputes', 'Disputes'], ['audit-logs', 'Audit logs'],
  ] as const)('provides a list screen for %s', async (resource, title) => {
    const method = { users: 'listUsers', customers: 'listCustomers', professionals: 'listProfessionals', businesses: 'listBusinesses', technicians: 'listTechnicians', services: 'listServices', jobs: 'listJobs', verifications: 'listVerifications', certificates: 'listCertificates', reviews: 'listReviews', reports: 'listReports', disputes: 'listDisputes', 'audit-logs': 'listAuditLogs' }[resource];
    const fixture = await configure<AdminResourcePage>(AdminResourcePage, resource, { [method]: vi.fn().mockReturnValue(list()) });
    expect((fixture.nativeElement.textContent as string)).toContain(title);
  });

  it('sends filters and pagination through the list API', async () => {
    const listUsers = vi.fn().mockReturnValue(list());
    const fixture = await configure<AdminResourcePage>(AdminResourcePage, 'users', { listUsers });
    const component = fixture.componentInstance as unknown as { filters: { controls: { search: { setValue(value: string): void }; status: { setValue(value: string): void } } }; applyFilters(): void; load(page: number): void };
    component.filters.controls.search.setValue('  Nadia  ');
    component.filters.controls.status.setValue('ACTIVE');
    component.applyFilters();
    component.load(2);
    expect(listUsers).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'Nadia', status: 'ACTIVE', page: 2, pageSize: 20 }));
  });

  it('does not let an older list response overwrite a newer result', async () => {
    const first = new Subject<{ items: AdminListItem[]; total: number; page: number; pageSize: number }>();
    const second = new Subject<{ items: AdminListItem[]; total: number; page: number; pageSize: number }>();
    const listUsers = vi.fn().mockReturnValueOnce(first).mockReturnValueOnce(second);
    const fixture = await configure<AdminResourcePage>(AdminResourcePage, 'users', { listUsers });
    const component = fixture.componentInstance as unknown as { load(page: number): void; items: { (): AdminListItem[] } };
    component.load(2);
    second.next({ items: [{ ...user, id: '2' }], total: 1, page: 2, pageSize: 20 });
    second.complete();
    first.next({ items: [{ ...user, id: '1' }], total: 1, page: 1, pageSize: 20 });
    first.complete();
    fixture.detectChanges();
    expect(component.items()[0]?.id).toBe('2');
  });

  it('shows an empty list and keeps detail routes usable', async () => {
    const listUsers = vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 }));
    const fixture = await configure<AdminResourcePage>(AdminResourcePage, 'users', { listUsers });
    expect((fixture.nativeElement.textContent as string)).toContain('No users found');
  });

  it('renders the user last login from the enriched DTO', async () => {
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'users', { getUser: vi.fn().mockReturnValue(of(user)) });
    expect((fixture.nativeElement.textContent as string)).toContain('Last login');
    expect((fixture.nativeElement.textContent as string)).toContain('2026');
  });

  it('renders enriched customer job history and reviews', async () => {
    const detail = { id: '9', userId: '1', businessId: null, firstName: 'Naledi', lastName: 'Dlamini', displayName: 'Naledi Dlamini', email: 'n@example.co.za', phone: null, preferredContact: 'EMAIL', createdAt: '', updatedAt: '', jobs: [{ id: '1', reference: 'FL-1', source: 'MARKETPLACE', status: 'COMPLETED', customerId: '9', professionalId: '1', businessId: null, serviceId: '1', title: null, description: 'Repair', city: 'Cape Town', province: 'Western Cape', scheduledAt: null, agreedAmount: 200, currency: 'ZAR', createdAt: '2026-01-01', updatedAt: '2026-01-02', providerName: 'Sipho Ndlovu', serviceName: 'Leak Repair' }], reviews: [{ id: '2', jobId: '1', customerId: '9', professionalId: '1', businessId: null, customerName: 'Naledi Dlamini', providerName: 'Sipho Ndlovu', rating: 5, comment: 'Excellent', isVisible: true, createdAt: '', updatedAt: '' }], summary: { jobCount: 1, activeJobCount: 0, reviewCount: 1, ratingAvg: 5 } };
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'customers', { getCustomer: vi.fn().mockReturnValue(of(detail)) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Job history');
    expect(text).toContain('FL-1');
    expect(text).toContain('Excellent');
  });

  it('renders enriched professional detail sections', async () => {
    const detail = { id: '9', userId: '1', name: 'Sipho Ndlovu', bio: null, experienceYears: 9, verificationStatus: 'VERIFIED', ratingAvg: 4.8, ratingCount: 1, isActive: true, city: 'Cape Town', province: 'Western Cape', serviceCount: 1, portfolioCount: 1, certificateCount: 1, createdAt: '', updatedAt: '', services: [{ id: '1', name: 'Leak Repair', slug: 'leak-repair', categoryId: '1', categoryName: 'Plumbing' }], serviceAreas: [{ areaName: 'Cape Town', city: 'Cape Town', province: 'Western Cape' }], portfolio: [{ id: '1', title: 'Kitchen repair', description: null, serviceId: '1', serviceName: 'Leak Repair', isPublished: true, imageCount: 2, createdAt: '' }], certificates: [{ id: '1', professionalId: '9', businessId: null, ownerType: 'PROFESSIONAL', title: 'PIRB', issuingOrganisation: 'PIRB', issueDate: null, expiryDate: null, verificationStatus: 'APPROVED', reviewedBy: null, reviewedAt: null, reviewNotes: null, createdAt: '', updatedAt: '' }], identityVerification: { id: '1', status: 'APPROVED', reviewedAt: null }, reviews: [], summary: { serviceCount: 1, portfolioCount: 1, certificateCount: 1, reviewCount: 0, ratingAvg: 4.8 } };
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'professionals', { getProfessional: vi.fn().mockReturnValue(of(detail)) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Service areas');
    expect(text).toContain('Portfolio metadata');
    expect(text).toContain('PIRB');
  });

  it('renders enriched business, technician and job detail sections', async () => {
    const business = { id: '1', ownerUserId: '1', name: 'Ubuntu Plumbing', description: null, email: null, phone: null, addressLine1: null, city: 'Cape Town', province: 'Western Cape', postalCode: null, verificationStatus: 'VERIFIED', ratingAvg: 4.6, ratingCount: 1, isActive: true, technicianCount: 1, serviceCount: 1, createdAt: '', updatedAt: '', owner: { id: '1', email: 'owner@example.co.za', phone: null, status: 'ACTIVE', roles: ['BUSINESS_OWNER'], lastLoginAt: null }, members: [], technicians: [], jobs: [], summary: { memberCount: 1, technicianCount: 0, jobCount: 0, activeJobCount: 0 } };
    const businessFixture = await configure<AdminDetailPage>(AdminDetailPage, 'businesses', { getBusiness: vi.fn().mockReturnValue(of(business)) });
    expect((businessFixture.nativeElement.textContent as string)).toContain('Owner');
    TestBed.resetTestingModule();
    const technician = { id: '1', businessId: '1', userId: '2', displayName: 'Lerato', email: null, phone: null, isActive: true, createdAt: '', updatedAt: '', business: { id: '1', name: 'Ubuntu Plumbing', city: 'Cape Town', province: 'Western Cape' }, assignedJobCount: 1, jobs: [], assignments: [] };
    const technicianFixture = await configure<AdminDetailPage>(AdminDetailPage, 'technicians', { getTechnician: vi.fn().mockReturnValue(of(technician)) });
    expect((technicianFixture.nativeElement.textContent as string)).toContain('Assigned jobs');
    TestBed.resetTestingModule();
    const job = { id: '1', reference: 'FL-1', source: 'INTERNAL', status: 'IN_PROGRESS', customerId: '1', professionalId: null, businessId: '1', serviceId: '1', title: null, description: 'Repair', city: null, province: null, scheduledAt: null, agreedAmount: null, currency: 'ZAR', createdAt: '', updatedAt: '', timeline: [{ previousStatus: null, status: 'REQUESTED', reason: 'Created', createdAt: '' }], quotes: [], assignments: [], documentation: { images: [{ id: '1', uploadedBy: null, phase: 'BEFORE', originalFilename: 'private.jpg', mimeType: 'image/jpeg', size: 100, createdAt: '' }], updates: [], voiceNotes: [], partsRequests: [] } };
    const jobFixture = await configure<AdminDetailPage>(AdminDetailPage, 'jobs', { getJob: vi.fn().mockReturnValue(of(job)) });
    const text = jobFixture.nativeElement.textContent as string;
    expect(text).toContain('Status timeline');
    expect(text).toContain('Execution photos');
    expect(text).not.toContain('private.jpg');
  });

  it('confirms and performs user status actions', async () => {
    const suspendUser = vi.fn().mockReturnValue(of({ ...user, status: 'SUSPENDED' as const }));
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'users', { getUser: vi.fn().mockReturnValue(of(user)), suspendUser });
    const component = fixture.componentInstance as unknown as { userStatus(): void };
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    component.userStatus();
    expect(suspendUser).not.toHaveBeenCalled();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.userStatus();
    expect(suspendUser).toHaveBeenCalledWith('9');
  });

  it('requires notes for verification rejection and sends the decision body', async () => {
    const decideVerification = vi.fn().mockReturnValue(of({ id: '9', userId: '1', userEmail: 'p@example.co.za', type: 'IDENTITY', status: 'REJECTED', reviewedBy: null, reviewedAt: null, reviewNotes: 'Unclear', createdAt: '', updatedAt: '' }));
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'verifications', { getVerification: vi.fn().mockReturnValue(of({ id: '9', userId: '1', userEmail: 'p@example.co.za', type: 'IDENTITY', status: 'PENDING', reviewedBy: null, reviewedAt: null, reviewNotes: null, createdAt: '', updatedAt: '' })), decideVerification });
    const component = fixture.componentInstance as unknown as { actionForm: { controls: { notes: { setValue(value: string): void } } }; decision(action?: 'reject' | 'request-info'): void };
    component.decision('reject');
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Notes are required');
    component.actionForm.controls.notes.setValue('Unclear document');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    component.decision('reject');
    expect(decideVerification).toHaveBeenCalledWith('9', 'reject', { notes: 'Unclear document' });
  });

  it('suppresses decision actions for terminal verification and certificate records', async () => {
    const approved = { id: '9', userId: '1', userEmail: 'p@example.co.za', type: 'IDENTITY' as const, status: 'APPROVED' as const, reviewedBy: '1', reviewedAt: '', reviewNotes: null, createdAt: '', updatedAt: '' };
    const fixture = await configure<AdminDetailPage>(AdminDetailPage, 'verifications', { getVerification: vi.fn().mockReturnValue(of(approved)) });
    expect((fixture.nativeElement.textContent as string)).not.toContain('Decision notes');
    expect((fixture.nativeElement.textContent as string)).toContain('No further decision');
  });

  it('updates report and dispute statuses with the required payloads', async () => {
    const updateReport = vi.fn().mockReturnValue(of({ id: '9', reporterId: null, reportType: 'JOB', entityType: null, entityId: null, reason: 'Issue', description: null, status: 'IN_REVIEW', resolvedBy: null, resolvedAt: null, createdAt: '', updatedAt: '' }));
    const updateDispute = vi.fn().mockReturnValue(of({ id: '9', jobId: '1', openedBy: null, reason: 'Issue', description: null, status: 'RESOLVED', resolution: 'Agreed', resolvedBy: null, resolvedAt: null, createdAt: '', updatedAt: '' }));
    const reportFixture = await configure<AdminDetailPage>(AdminDetailPage, 'reports', { getReport: vi.fn().mockReturnValue(of({ id: '9', reporterId: null, reportType: 'JOB', entityType: null, entityId: null, reason: 'Issue', description: null, status: 'OPEN', resolvedBy: null, resolvedAt: null, createdAt: '', updatedAt: '' })), updateReport });
    (reportFixture.componentInstance as unknown as { actionForm: { controls: { status: { setValue(value: string): void } } }; updateReport(): void }).actionForm.controls.status.setValue('IN_REVIEW');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (reportFixture.componentInstance as unknown as { updateReport(): void }).updateReport();
    expect(updateReport).toHaveBeenCalledWith('9', { status: 'IN_REVIEW' });
    TestBed.resetTestingModule();
    const disputeFixture = await configure<AdminDetailPage>(AdminDetailPage, 'disputes', { getDispute: vi.fn().mockReturnValue(of({ id: '9', jobId: '1', openedBy: null, reason: 'Issue', description: null, status: 'OPEN', resolution: null, resolvedBy: null, resolvedAt: null, createdAt: '', updatedAt: '' })), updateDispute });
    (disputeFixture.componentInstance as unknown as { actionForm: { controls: { status: { setValue(value: string): void }; resolution: { setValue(value: string): void } } }; updateDispute(): void }).actionForm.controls.status.setValue('RESOLVED');
    (disputeFixture.componentInstance as unknown as { actionForm: { controls: { resolution: { setValue(value: string): void } } } }).actionForm.controls.resolution.setValue('Agreed');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    (disputeFixture.componentInstance as unknown as { updateDispute(): void }).updateDispute();
    expect(updateDispute).toHaveBeenCalledWith('9', { status: 'RESOLVED', resolution: 'Agreed' });
  });

  it('matches backend service field limits before submission', async () => {
    const createService = vi.fn();
    const fixture = await configure<AdminServiceEditor>(AdminServiceEditor, 'services', { listServiceCategories: vi.fn().mockReturnValue(of([])), createService }, null);
    const component = fixture.componentInstance as unknown as { form: { controls: Record<string, { setValue(value: string | number | boolean): void }> }; submit(): void };
    component.form.controls['categoryId']?.setValue('2');
    component.form.controls['name']?.setValue('x'.repeat(129));
    component.form.controls['slug']?.setValue('valid-slug');
    component.submit();
    expect(createService).not.toHaveBeenCalled();
  });

  it('submits a strict service mutation body', async () => {
    const createService = vi.fn().mockReturnValue(of({ id: '3' }));
    const fixture = await configure<AdminServiceEditor>(AdminServiceEditor, 'services', { listServiceCategories: vi.fn().mockReturnValue(of([{ id: '2', name: 'Plumbing', slug: 'plumbing', description: null, isActive: true, sortOrder: 1 }])), createService }, null);
    const component = fixture.componentInstance as unknown as { form: { controls: Record<string, { setValue(value: string | number | boolean): void }> }; submit(): void };
    component.form.controls['categoryId']?.setValue('2');
    component.form.controls['name']?.setValue('Drain cleaning');
    component.form.controls['slug']?.setValue('drain-cleaning');
    component.submit();
    expect(createService).toHaveBeenCalledWith({ categoryId: '2', name: 'Drain cleaning', slug: 'drain-cleaning', description: null, sortOrder: 0, isActive: true });
  });
});
