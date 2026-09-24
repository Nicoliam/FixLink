import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessService } from './business.service';
import { API_BASE_URL } from '../config/api-config';
import type { BusinessCustomer, BusinessJob, BusinessJobDetail, BusinessJobsSummary } from '../models/business.model';

const API = 'http://test.local/api/v1';

const customer: BusinessCustomer = {
  id: '3',
  businessId: '1',
  firstName: 'Naledi',
  lastName: 'Dlamini',
  displayName: 'Naledi Dlamini',
  email: 'naledi.dlamini@example.co.za',
  phone: '+27825550111',
  preferredContact: null,
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const job: BusinessJob = {
  id: '5',
  reference: 'FL-2026-000123',
  source: 'INTERNAL',
  status: 'REQUESTED',
  businessId: '1',
  business: { id: '1', businessName: 'Ubuntu Plumbing Co.' },
  customerId: '3',
  customer: {
    id: '3',
    firstName: 'Naledi',
    lastName: 'Dlamini',
    displayName: 'Naledi Dlamini',
    email: 'naledi.dlamini@example.co.za',
    phone: '+27825550111',
  },
  service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
  title: null,
  description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
  addressLine1: '12 Protea Street, Randburg',
  city: null,
  province: null,
  postalCode: null,
  priority: 'HIGH',
  scheduledAt: null,
  createdAt: '2026-09-21T09:00:00.000Z',
  updatedAt: '2026-09-21T09:00:00.000Z',
};

const detail: BusinessJobDetail = {
  job,
  timeline: [
    {
      previousStatus: null,
      status: 'REQUESTED',
      reason: 'Internal job created by business',
      createdAt: '2026-09-21T09:00:00.000Z',
    },
  ],
};

const summary: BusinessJobsSummary = {
  total: 2,
  requested: 1,
  scheduled: 0,
  inProgress: 0,
  completed: 0,
  cancelled: 1,
};

describe('BusinessService — Stage 7B customers and internal jobs', () => {
  let service: BusinessService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(BusinessService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists business customers without sending a business id', () => {
    let result: unknown = null;
    service.listBusinessCustomers({ search: 'Naledi', page: 1, pageSize: 20 }).subscribe((value) => (result = value));
    const req = httpMock.expectOne(
      (request) =>
        request.url === `${API}/business/customers` &&
        request.params.get('search') === 'Naledi' &&
        request.params.get('page') === '1' &&
        request.params.get('pageSize') === '20',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [customer], total: 1, page: 1, pageSize: 20 }, message: 'ok' });
    expect(result).toEqual({ items: [customer], total: 1, page: 1, pageSize: 20 });
  });

  it('creates a business customer with trimmed fields', () => {
    let result: BusinessCustomer | null = null;
    service
      .createBusinessCustomer({ firstName: '  Naledi ', lastName: 'Dlamini', email: 'NALEDI@example.co.za ' })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/customers`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ firstName: 'Naledi', lastName: 'Dlamini', email: 'NALEDI@example.co.za' });
    req.flush({ success: true, data: customer, message: 'ok' });
    expect(result).toEqual(customer);
  });

  it('updates a business customer', () => {
    service.updateBusinessCustomer('3', { phone: '+27825550222' }).subscribe();
    const req = httpMock.expectOne(`${API}/business/customers/3`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ phone: '+27825550222' });
    req.flush({ success: true, data: { ...customer, phone: '+27825550222' }, message: 'ok' });
  });

  it('lists internal jobs with status, search and pagination params', () => {
    let result: unknown = null;
    service
      .listBusinessJobs({ status: 'REQUESTED', search: 'FL-2026', page: 2, pageSize: 10 })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(
      (request) =>
        request.url === `${API}/business/jobs` &&
        request.params.get('status') === 'REQUESTED' &&
        request.params.get('search') === 'FL-2026' &&
        request.params.get('page') === '2' &&
        request.params.get('pageSize') === '10',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [job], total: 1, page: 2, pageSize: 10 }, message: 'ok' });
    expect(result).toEqual({ items: [job], total: 1, page: 2, pageSize: 10 });
  });

  it('fetches one internal job with its timeline', () => {
    let result: BusinessJobDetail | null = null;
    service.getBusinessJob('5').subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/jobs/5`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: detail, message: 'ok' });
    expect(result).toEqual(detail);
  });

  it('creates an internal job without sending source, status or business id', () => {
    let result: BusinessJob | null = null;
    service
      .createBusinessJob({
        customerId: '3',
        serviceId: '1',
        description: '  Geyser is leaking from the pressure valve and the drip tray is overflowing. ',
        address: '12 Protea Street, Randburg',
        priority: 'HIGH',
      })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/jobs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      customerId: '3',
      serviceId: '1',
      description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
      addressLine1: '12 Protea Street, Randburg',
      priority: 'HIGH',
    });
    expect(req.request.body).not.toHaveProperty('source');
    expect(req.request.body).not.toHaveProperty('status');
    expect(req.request.body).not.toHaveProperty('businessId');
    req.flush({ success: true, data: job, message: 'ok' });
    expect(result).toEqual(job);
  });

  it('updates an internal job without status control', () => {
    service.updateBusinessJob('5', { priority: 'URGENT' }).subscribe();
    const req = httpMock.expectOne(`${API}/business/jobs/5`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ priority: 'URGENT' });
    expect(req.request.body).not.toHaveProperty('status');
    req.flush({ success: true, data: { ...job, priority: 'URGENT' }, message: 'ok' });
  });

  it('cancels an internal job through the dedicated endpoint', () => {
    service.cancelBusinessJob('5', 'Customer postponed').subscribe();
    const req = httpMock.expectOne(`${API}/business/jobs/5/cancel`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ reason: 'Customer postponed' });
    req.flush({ success: true, data: { ...job, status: 'CANCELLED' }, message: 'ok' });
  });

  it('fetches the real-data job summary', () => {
    let result: BusinessJobsSummary | null = null;
    service.getBusinessJobsSummary().subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/jobs-summary`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: summary, message: 'ok' });
    expect(result).toEqual(summary);
  });
});
