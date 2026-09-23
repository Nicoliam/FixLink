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

  it('lists provider requests with pagination', () => {
    let result: unknown = null;
    service.listProviderRequests(1, 20).subscribe((list) => (result = list));
    const req = httpMock.expectOne((r) => r.url === `${API}/provider/requests`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('1');
    expect(req.request.params.get('pageSize')).toBe('20');
    expect(req.request.params.get('status')).toBeNull();
    req.flush({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 }, message: 'ok' });
    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
  });

  it('fetches a single provider request by id', () => {
    service.getProviderRequest('3').subscribe();
    const req = httpMock.expectOne(`${API}/provider/requests/3`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { id: '3' }, message: 'ok' });
  });

  it('posts a quote with trimmed fields and ZAR currency', () => {
    let result: unknown = null;
    service
      .createQuote('3', {
        total: 1250,
        currency: 'zar',
        message: '  Supply and install replacement kitchen mixer tap.  ',
        items: [{ description: '  Labour  ', quantity: 1, unitPrice: 950 }],
      })
      .subscribe((quote) => (result = quote));
    const req = httpMock.expectOne(`${API}/jobs/3/quotes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      total: 1250,
      currency: 'ZAR',
      message: 'Supply and install replacement kitchen mixer tap.',
      items: [{ description: '  Labour  ', quantity: 1, unitPrice: 950 }],
    });
    req.flush({ success: true, data: { id: '11', total: 1250 }, message: 'ok' });
    expect(result).toEqual({ id: '11', total: 1250 });
  });

  it('accepts a quote and resolves the accepted job and quote', () => {
    let result: unknown = null;
    service.acceptQuote('7', '11').subscribe((acceptance) => (result = acceptance));
    const req = httpMock.expectOne(`${API}/jobs/7/quotes/11/accept`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      success: true,
      data: { job: { id: '7', status: 'ACCEPTED', agreedAmount: 1250 }, quote: { id: '11', status: 'ACCEPTED' } },
      message: 'ok',
    });
    expect(result).toEqual({
      job: { id: '7', status: 'ACCEPTED', agreedAmount: 1250 },
      quote: { id: '11', status: 'ACCEPTED' },
    });
  });

  it('lists quotes for a job and fetches a single quote', () => {
    let items: unknown = null;
    service.listJobQuotes('3').subscribe((quotes) => (items = quotes));
    const listReq = httpMock.expectOne(`${API}/jobs/3/quotes`);
    expect(listReq.request.method).toBe('GET');
    listReq.flush({ success: true, data: { items: [{ id: '11' }], total: 1 }, message: 'ok' });
    expect(items).toEqual([{ id: '11' }]);

    service.getQuote('11').subscribe();
    const oneReq = httpMock.expectOne(`${API}/quotes/11`);
    expect(oneReq.request.method).toBe('GET');
    oneReq.flush({ success: true, data: { id: '11' }, message: 'ok' });
  });

  it('schedules an accepted job and resolves the scheduled job', () => {
    let result: unknown = null;
    service.scheduleJob('7', '2026-10-05T10:00:00+02:00').subscribe((job) => (result = job));
    const req = httpMock.expectOne(`${API}/jobs/7/schedule`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ scheduledAt: '2026-10-05T10:00:00+02:00' });
    req.flush({
      success: true,
      data: { job: { id: '7', status: 'SCHEDULED', scheduledAt: '2026-10-05T08:00:00.000Z' } },
      message: 'Job scheduled successfully.',
    });
    expect(result).toEqual({ id: '7', status: 'SCHEDULED', scheduledAt: '2026-10-05T08:00:00.000Z' });
  });

  it('starts a scheduled job and resolves the in-progress job', () => {
    let result: unknown = null;
    service.startJob('7').subscribe((job) => (result = job));
    const req = httpMock.expectOne(`${API}/jobs/7/start`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({});
    req.flush({
      success: true,
      data: { job: { id: '7', status: 'IN_PROGRESS' } },
      message: 'Job started successfully.',
    });
    expect(result).toEqual({ id: '7', status: 'IN_PROGRESS' });
  });

  it('uploads a job photo as multipart with phase and file', () => {
    let result: unknown = null;
    const file = new File(['fake'], 'before.png', { type: 'image/png' });
    service.uploadJobImage('7', 'BEFORE', file).subscribe((image) => (result = image));
    const req = httpMock.expectOne(`${API}/jobs/7/images`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body instanceof FormData).toBe(true);
    expect((req.request.body as FormData).get('phase')).toBe('BEFORE');
    req.flush({ success: true, data: { id: 'img-1', phase: 'BEFORE' }, message: 'ok' });
    expect(result).toEqual({ id: 'img-1', phase: 'BEFORE' });
  });

  it('lists job photos and builds the authorized file URL', () => {
    let items: unknown = null;
    service.listJobImages('7').subscribe((images) => (items = images));
    const listReq = httpMock.expectOne(`${API}/jobs/7/images`);
    expect(listReq.request.method).toBe('GET');
    listReq.flush({ success: true, data: { items: [{ id: 'img-1' }], total: 1 }, message: 'ok' });
    expect(items).toEqual([{ id: 'img-1' }]);
    expect(service.imageFileUrl('7', 'img-1')).toBe(`${API}/jobs/7/images/img-1/file`);
  });

  it('deletes a job photo', () => {
    let done = false;
    service.deleteJobImage('7', 'img-1').subscribe(() => (done = true));
    const req = httpMock.expectOne(`${API}/jobs/7/images/img-1`);
    expect(req.request.method).toBe('DELETE');
    req.flush({ success: true, data: { deleted: true }, message: 'ok' });
    expect(done).toBe(true);
  });

  it('creates and lists job updates with trimmed notes', () => {
    let result: unknown = null;
    service.createJobUpdate('7', 'DURING', '  Removed damaged section.  ').subscribe((update) => (result = update));
    const req = httpMock.expectOne(`${API}/jobs/7/updates`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ phase: 'DURING', note: 'Removed damaged section.' });
    req.flush({ success: true, data: { id: 'u1', phase: 'DURING' }, message: 'ok' });
    expect(result).toEqual({ id: 'u1', phase: 'DURING' });

    let items: unknown = null;
    service.listJobUpdates('7').subscribe((updates) => (items = updates));
    const listReq = httpMock.expectOne(`${API}/jobs/7/updates`);
    expect(listReq.request.method).toBe('GET');
    listReq.flush({ success: true, data: { items: [{ id: 'u1' }], total: 1 }, message: 'ok' });
    expect(items).toEqual([{ id: 'u1' }]);
  });

  it('fetches the job timeline', () => {
    let result: unknown = null;
    service.getJobTimeline('7').subscribe((timeline) => (result = timeline));
    const req = httpMock.expectOne(`${API}/jobs/7/timeline`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { job: { id: '7' }, events: [] }, message: 'ok' });
    expect(result).toEqual({ job: { id: '7' }, events: [] });
  });

  it('completes a job with a trimmed note and confirms a completed job', () => {
    let completed: unknown = null;
    service.completeJob('7', '  Replacement pipe installed.  ').subscribe((result) => (completed = result));
    const completeReq = httpMock.expectOne(`${API}/jobs/7/complete`);
    expect(completeReq.request.method).toBe('POST');
    expect(completeReq.request.body).toEqual({ note: 'Replacement pipe installed.' });
    completeReq.flush({
      success: true,
      data: { job: { id: '7', status: 'COMPLETED' }, update: { id: 'u3', phase: 'AFTER' } },
      message: 'ok',
    });
    expect(completed).toEqual({ job: { id: '7', status: 'COMPLETED' }, update: { id: 'u3', phase: 'AFTER' } });

    let closed: unknown = null;
    service.confirmJob('7').subscribe((job) => (closed = job));
    const confirmReq = httpMock.expectOne(`${API}/jobs/7/confirm`);
    expect(confirmReq.request.method).toBe('POST');
    expect(confirmReq.request.body).toEqual({});
    confirmReq.flush({ success: true, data: { job: { id: '7', status: 'CLOSED' } }, message: 'ok' });
    expect(closed).toEqual({ id: '7', status: 'CLOSED' });
  });
});
