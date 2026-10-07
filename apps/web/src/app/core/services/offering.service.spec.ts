import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { OfferingService } from './offering.service';
import { API_BASE_URL } from '../config/api-config';
import type { Offering } from '../models/offering.model';

const API = 'http://test.local/api/v1';

const offering: Offering = {
  id: 'off-1',
  providerType: 'PROFESSIONAL',
  providerId: 'pro-1',
  categoryId: 'cat-1',
  categoryName: 'Plumbing',
  categorySlug: 'plumbing',
  name: 'Leak repair',
  description: 'Tracing and fixing leaks.',
  priceAmount: 850,
  currency: 'ZAR',
  isActive: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
};

describe('OfferingService', () => {
  let service: OfferingService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(OfferingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists the caller offerings without sending a provider id', () => {
    let result: unknown = null;
    service.list().subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/provider/offerings`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [offering], total: 1 }, message: 'ok' });
    expect(result).toEqual({ items: [offering], total: 1 });
  });

  it('fetches one offering by opaque id', () => {
    let result: Offering | null = null;
    service.get('off-1').subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/provider/offerings/off-1`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: offering, message: 'ok' });
    expect(result).toEqual(offering);
  });

  it('creates an offering and omits server-owned fields', () => {
    let result: Offering | null = null;
    service
      .create({ categoryId: 'cat-1', name: 'Leak repair', description: 'Tracing leaks.', priceAmount: 850 })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/provider/offerings`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      categoryId: 'cat-1',
      name: 'Leak repair',
      description: 'Tracing leaks.',
      priceAmount: 850,
    });
    expect(req.request.body).not.toHaveProperty('providerId');
    expect(req.request.body).not.toHaveProperty('providerType');
    expect(req.request.body).not.toHaveProperty('isActive');
    expect(req.request.body).not.toHaveProperty('currency');
    req.flush({ success: true, data: offering, message: 'ok' });
    expect(result).toEqual(offering);
  });

  it('creates an offering for a chosen provider when one is disambiguated', () => {
    service
      .create({ categoryId: 'cat-1', name: 'Leak repair', priceAmount: 850, providerType: 'BUSINESS' })
      .subscribe();
    const req = httpMock.expectOne(`${API}/provider/offerings`);
    expect(req.request.body).toEqual({
      categoryId: 'cat-1',
      name: 'Leak repair',
      priceAmount: 850,
      providerType: 'BUSINESS',
    });
    req.flush({ success: true, data: offering, message: 'ok' });
  });

  it('updates an offering without ever sending providerType', () => {
    let result: Offering | null = null;
    service.update('off-1', { name: 'Leak repair & pipe replacement', priceAmount: 950 }).subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/provider/offerings/off-1`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ name: 'Leak repair & pipe replacement', priceAmount: 950 });
    expect(req.request.body).not.toHaveProperty('providerType');
    expect(req.request.body).not.toHaveProperty('providerId');
    expect(req.request.body).not.toHaveProperty('isActive');
    req.flush({ success: true, data: { ...offering, name: 'Leak repair & pipe replacement', priceAmount: 950 }, message: 'ok' });
    expect(result).toEqual({ ...offering, name: 'Leak repair & pipe replacement', priceAmount: 950 });
  });

  it('removes an offering with no body and resolves with it inactive', () => {
    let result: Offering | null = null;
    service.remove('off-1').subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/provider/offerings/off-1`);
    expect(req.request.method).toBe('DELETE');
    expect(req.request.body).toBeNull();
    req.flush({ success: true, data: { ...offering, isActive: false }, message: 'ok' });
    expect(result).toEqual({ ...offering, isActive: false });
  });

  it('propagates server errors untouched so components can translate them', () => {
    let status = 0;
    let code: unknown = null;
    service.remove('off-1').subscribe({
      error: (error: unknown) => {
        status = (error as { status: number }).status;
        code = (error as { error: { error: { code: string } } }).error.error.code;
      },
    });
    httpMock
      .expectOne(`${API}/provider/offerings/off-1`)
      .flush({ success: false, error: { code: 'CONFLICT', message: 'Still attached to open work.' } }, { status: 409, statusText: 'Conflict' });
    expect(status).toBe(409);
    expect(code).toBe('CONFLICT');
  });
});