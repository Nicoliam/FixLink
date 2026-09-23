import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { MarketplaceService } from './marketplace.service';
import { API_BASE_URL } from '../config/api-config';

const API = 'http://test.local/api/v1';

describe('MarketplaceService', () => {
  let service: MarketplaceService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(MarketplaceService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('lists services from the catalogue endpoint', () => {
    let result: unknown = null;
    service.listServices().subscribe((items) => (result = items));
    const req = httpMock.expectOne(`${API}/services`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [{ id: '1', slug: 'leak-repair' }] }, message: 'ok' });
    expect(result).toEqual([{ id: '1', slug: 'leak-repair' }]);
  });

  it('lists categories from the documented endpoint', () => {
    let result: unknown = null;
    service.listCategories().subscribe((items) => (result = items));
    const req = httpMock.expectOne(`${API}/categories`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [{ id: '1', slug: 'plumbing' }] }, message: 'ok' });
    expect(result).toEqual([{ id: '1', slug: 'plumbing' }]);
  });

  it('sends only defined search filters as query params', () => {
    let result: unknown = null;
    service
      .searchProviders({ service: 'leak-repair', location: 'Fourways', providerType: 'business', verified: true, page: 2, pageSize: 12 })
      .subscribe((data) => (result = data));
    const req = httpMock.expectOne((r) => r.url === `${API}/providers`);
    expect(req.request.params.get('service')).toBe('leak-repair');
    expect(req.request.params.get('location')).toBe('Fourways');
    expect(req.request.params.get('providerType')).toBe('business');
    expect(req.request.params.get('verified')).toBe('true');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('12');
    expect(req.request.params.has('category')).toBe(false);
    expect(req.request.params.has('q')).toBe(false);
    req.flush({ success: true, data: { items: [], total: 0, page: 2, pageSize: 12 }, message: 'ok' });
    expect(result).toEqual({ items: [], total: 0, page: 2, pageSize: 12 });
  });

  it('fetches a provider profile and sub-resources by opaque id', () => {
    service.getProvider('professional-1').subscribe();
    httpMock.expectOne(`${API}/providers/professional-1`).flush({
      success: true, data: { id: 'professional-1' }, message: 'ok',
    });
    service.getPortfolio('professional-1').subscribe();
    httpMock.expectOne(`${API}/providers/professional-1/portfolio`).flush({
      success: true, data: { items: [] }, message: 'ok',
    });
    service.getCertificates('professional-1').subscribe();
    httpMock.expectOne(`${API}/providers/professional-1/certificates`).flush({
      success: true, data: { items: [] }, message: 'ok',
    });
    service.getReviews('business-1').subscribe();
    httpMock.expectOne(`${API}/providers/business-1/reviews`).flush({
      success: true, data: { items: [], total: 0, page: 1, pageSize: 20 }, message: 'ok',
    });
  });
});
