import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminApiService } from './admin-api.service';
import { API_BASE_URL } from '../config/api-config';
import type { AdminDashboard, AdminUser } from '../models/admin.model';

const API = 'http://test.local/api/v1';
const user: AdminUser = { id: '9', email: 'person@example.co.za', phone: null, status: 'ACTIVE', roles: ['CUSTOMER'], emailVerifiedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-02', lastLoginAt: '2026-01-02T10:00:00.000Z' };
const dashboard: AdminDashboard = { users: { total: 1, active: 1, pending: 0, suspended: 0 }, customers: 2, professionals: { total: 1, verified: 1, pending: 0 }, businesses: { total: 1, verified: 1, pending: 0 }, technicians: { total: 2, active: 2 }, services: { total: 3, active: 3, inactive: 0 }, jobs: { total: 4, open: 1, inProgress: 1, completed: 2 }, verification: { pending: 0, needsInfo: 0 }, certificates: { pending: 0, needsInfo: 0 }, reports: { open: 0, inReview: 0 }, disputes: { open: 0, inReview: 0 } };

describe('AdminApiService', () => {
  let service: AdminApiService;
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }] }).compileComponents();
    service = TestBed.inject(AdminApiService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); TestBed.resetTestingModule(); });

  it('uses the dashboard contract', () => {
    let result: AdminDashboard | null = null;
    service.getDashboard().subscribe((value) => (result = value));
    const request = http.expectOne(`${API}/admin/dashboard`);
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, data: dashboard, message: 'Success' });
    expect(result).toEqual(dashboard);
  });

  it('sends server-side user filters and pagination', () => {
    service.listUsers({ search: 'Nadia', status: 'ACTIVE', role: 'CUSTOMER', page: 2, pageSize: 10 }).subscribe();
    const request = http.expectOne((value) => value.url === `${API}/admin/users` && value.params.get('search') === 'Nadia' && value.params.get('status') === 'ACTIVE' && value.params.get('role') === 'CUSTOMER' && value.params.get('page') === '2' && value.params.get('pageSize') === '10');
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, data: { items: [user], total: 1, page: 2, pageSize: 10 }, message: 'Success' });
  });

  it('serializes job, audit and review filters using backend keys', () => {
    service.listJobs({ status: 'IN_PROGRESS', source: 'INTERNAL', customerId: '1', professionalId: '2', businessId: '3', from: '2026-09-01', to: '2026-09-30', page: 2, pageSize: 10 }).subscribe();
    let request = http.expectOne((value) => value.url === `${API}/admin/jobs` && value.params.get('status') === 'IN_PROGRESS' && value.params.get('source') === 'INTERNAL' && value.params.get('customerId') === '1' && value.params.get('professionalId') === '2' && value.params.get('businessId') === '3' && value.params.get('from') === '2026-09-01' && value.params.get('to') === '2026-09-30');
    request.flush({ success: true, data: { items: [], total: 0, page: 2, pageSize: 10 }, message: 'Success' });
    service.listAuditLogs({ actorId: '4', action: 'USER_SUSPENDED', entityType: 'USER', entityId: '5', from: '2026-09-01', to: '2026-09-02' }).subscribe();
    request = http.expectOne((value) => value.url === `${API}/admin/audit-logs` && value.params.get('actorId') === '4' && value.params.get('action') === 'USER_SUSPENDED' && value.params.get('entityType') === 'USER' && value.params.get('entityId') === '5');
    request.flush({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 }, message: 'Success' });
    service.listReviews({ search: 'Excellent', rating: 5, minRating: 4, maxRating: 5 }).subscribe();
    request = http.expectOne((value) => value.url === `${API}/admin/reviews` && value.params.get('rating') === '5' && value.params.get('minRating') === '4' && value.params.get('maxRating') === '5');
    request.flush({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 }, message: 'Success' });
  });

  it('uses the supported user status endpoints with an empty body', () => {
    service.suspendUser('9').subscribe();
    let request = http.expectOne(`${API}/admin/users/9/suspend`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, data: { ...user, status: 'SUSPENDED' }, message: 'Success' });
    service.reactivateUser('9').subscribe();
    request = http.expectOne(`${API}/admin/users/9/reactivate`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, data: user, message: 'Success' });
  });

  it('uses exact service, decision, report and dispute contracts without client actor fields', () => {
    service.createService({ categoryId: '2', name: 'Drain cleaning', slug: 'drain-cleaning', description: null, sortOrder: 1, isActive: true }).subscribe();
    let request = http.expectOne(`${API}/admin/services`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ categoryId: '2', name: 'Drain cleaning', slug: 'drain-cleaning', description: null, sortOrder: 1, isActive: true });
    request.flush({ success: true, data: { id: '3' }, message: 'Success' });
    service.decideVerification('4', 'request-info', { notes: 'Please provide a clearer copy.' }).subscribe();
    request = http.expectOne(`${API}/admin/verifications/4/request-info`);
    expect(request.request.body).toEqual({ notes: 'Please provide a clearer copy.' });
    request.flush({ success: true, data: { id: '4' }, message: 'Success' });
    service.updateReport('5', { status: 'IN_REVIEW' }).subscribe();
    request = http.expectOne(`${API}/admin/reports/5/status`);
    expect(request.request.body).toEqual({ status: 'IN_REVIEW' });
    request.flush({ success: true, data: { id: '5' }, message: 'Success' });
    service.updateDispute('6', { status: 'RESOLVED', resolution: 'Parties agreed.' }).subscribe();
    request = http.expectOne(`${API}/admin/disputes/6`);
    expect(request.request.body).toEqual({ status: 'RESOLVED', resolution: 'Parties agreed.' });
    request.flush({ success: true, data: { id: '6' }, message: 'Success' });
  });

  it('uses the exact service activation and deactivation endpoints', () => {
    service.activateService('3', true).subscribe();
    let request = http.expectOne(`${API}/admin/services/3/activate`);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({});
    request.flush({ success: true, data: { id: '3' }, message: 'Success' });
    service.activateService('3', false).subscribe();
    request = http.expectOne(`${API}/admin/services/3/deactivate`);
    expect(request.request.body).toEqual({});
    request.flush({ success: true, data: { id: '3' }, message: 'Success' });
  });

  it('downloads verification and certificate documents as authenticated blobs', () => {
    let verificationBlob: Blob | null = null;
    service.getVerificationDocument('7').subscribe((value) => (verificationBlob = value));
    let request = http.expectOne(`${API}/admin/verifications/7/document`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['verification'], { type: 'application/pdf' }));
    expect(verificationBlob).not.toBeNull();
    service.getCertificateDocument('8').subscribe();
    request = http.expectOne(`${API}/admin/certificates/8/document`);
    expect(request.request.method).toBe('GET');
    expect(request.request.responseType).toBe('blob');
    request.flush(new Blob(['certificate'], { type: 'image/png' }));
  });

  it('loads service categories before service detail paths', () => {
    service.listServiceCategories().subscribe();
    const request = http.expectOne(`${API}/admin/services/categories`);
    expect(request.request.method).toBe('GET');
    request.flush({ success: true, data: [], message: 'Success' });
  });
});
