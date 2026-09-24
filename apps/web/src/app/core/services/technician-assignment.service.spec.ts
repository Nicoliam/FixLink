import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessService } from './business.service';
import { TechnicianService } from './technician.service';
import { API_BASE_URL } from '../config/api-config';
import type {
  BusinessJob,
  BusinessJobDetail,
  JobAssignment,
  JobAssignmentDetail,
} from '../models/business.model';

const API = 'http://test.local/api/v1';

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

const assignmentDetail: JobAssignmentDetail = {
  jobId: '5',
  assignment: {
    id: '1',
    jobId: '5',
    businessId: '1',
    technician: {
      id: '2',
      displayName: 'Bongani Zulu',
      email: 'bongani.zulu@example.co.za',
      phone: '+27825550333',
      isActive: true,
    },
    assignedBy: '9',
    assignedAt: '2026-09-22T09:00:00.000Z',
  },
  history: [
    {
      id: '1',
      technician: {
        id: '2',
        displayName: 'Bongani Zulu',
        email: 'bongani.zulu@example.co.za',
        phone: '+27825550333',
        isActive: true,
      },
      assignedBy: '9',
      assignedAt: '2026-09-22T09:00:00.000Z',
      unassignedAt: null,
      isActive: true,
    },
  ],
};

describe('BusinessService — Stage 7C technician assignment', () => {
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

  it('assigns a technician with only the technician id', () => {
    let result: JobAssignment | null = null;
    service.assignTechnician('5', { technicianId: '2' }).subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/jobs/5/assign`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ technicianId: '2' });
    expect(req.request.body).not.toHaveProperty('businessId');
    expect(req.request.body).not.toHaveProperty('status');
    req.flush({ success: true, data: assignmentDetail.assignment, message: 'ok' });
    expect(result).toEqual(assignmentDetail.assignment);
  });

  it('fetches the assignment with history', () => {
    let result: JobAssignmentDetail | null = null;
    service.getJobAssignment('5').subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/jobs/5/assignment`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: assignmentDetail, message: 'ok' });
    expect(result).toEqual(assignmentDetail);
  });
});

describe('TechnicianService — Stage 7C My Jobs', () => {
  let service: TechnicianService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(TechnicianService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists assigned jobs without sending a technician id', () => {
    let result: unknown = null;
    service.listMyJobs({ status: 'REQUESTED', page: 1, pageSize: 20 }).subscribe((value) => (result = value));
    const req = httpMock.expectOne(
      (request) =>
        request.url === `${API}/technician/jobs` &&
        request.params.get('status') === 'REQUESTED' &&
        request.params.get('page') === '1',
    );
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [job], total: 1, page: 1, pageSize: 20 }, message: 'ok' });
    expect(result).toEqual({ items: [job], total: 1, page: 1, pageSize: 20 });
  });

  it('fetches one assigned job with its timeline', () => {
    let result: BusinessJobDetail | null = null;
    service.getMyJob('5').subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/technician/jobs/5`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: detail, message: 'ok' });
    expect(result).toEqual(detail);
  });
});
