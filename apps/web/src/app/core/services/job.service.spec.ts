import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { JobService } from './job.service';
import { API_BASE_URL } from '../config/api-config';

const API = 'http://test.local/api/v1';

describe('JobService', () => {
  let service: JobService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(JobService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('posts a job request with trimmed fields and resolves the created job', () => {
    let result: unknown = null;
    service
      .createJob({
        providerId: 'professional-1',
        serviceId: '1',
        description: '  Kitchen mixer tap leaking at the base and the cupboard floor is damp.  ',
        location: 'Fourways, Johannesburg',
        preferredDate: '2026-10-05',
        preferredTime: '14:30',
        notes: '',
      })
      .subscribe((job) => (result = job));
    const req = httpMock.expectOne(`${API}/jobs`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      providerId: 'professional-1',
      serviceId: '1',
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
    });
    req.flush({ success: true, data: { id: '7', status: 'REQUESTED' }, message: 'ok' });
    expect(result).toEqual({ id: '7', status: 'REQUESTED' });
  });

  it('omits empty optional fields from the request body', () => {
    service
      .createJob({ providerId: 'business-1', serviceId: '2', description: 'x'.repeat(20), location: 'Pretoria' })
      .subscribe();
    const req = httpMock.expectOne(`${API}/jobs`);
    expect(req.request.body).toEqual({
      providerId: 'business-1',
      serviceId: '2',
      description: 'x'.repeat(20),
      location: 'Pretoria',
    });
    req.flush({ success: true, data: {}, message: 'ok' });
  });

  it('lists the customer jobs with pagination', () => {
    let result: unknown = null;
    service.listMyJobs(2, 10).subscribe((list) => (result = list));
    const req = httpMock.expectOne((r) => r.url === `${API}/jobs`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ success: true, data: { items: [], total: 0, page: 2, pageSize: 10 }, message: 'ok' });
    expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 10 });
  });

  it('fetches a single job by id', () => {
    service.getJob('7').subscribe();
    const req = httpMock.expectOne(`${API}/jobs/7`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { id: '7' }, message: 'ok' });
  });
});
