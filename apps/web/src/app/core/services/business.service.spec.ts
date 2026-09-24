import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessService } from './business.service';
import { API_BASE_URL } from '../config/api-config';
import type { Business, Technician } from '../models/business.model';

const API = 'http://test.local/api/v1';

const business: Business = {
  id: '1',
  businessName: 'Ubuntu Plumbing Co.',
  slug: 'ubuntu-plumbing-co',
  description: 'Family-run plumbing team.',
  logoReference: null,
  email: 'hello@ubuntuplumbing.example.co.za',
  phone: '+27115550101',
  addressLine1: null,
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: null,
  verificationStatus: 'VERIFIED',
  ratingAvg: 4.6,
  ratingCount: 48,
  isActive: true,
  role: 'OWNER',
  technicianCount: 2,
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

const technician: Technician = {
  id: '7',
  businessId: '1',
  userId: '10',
  displayName: 'Bongani Zulu',
  email: 'bongani.zulu@example.co.za',
  phone: '+27825550109',
  isActive: true,
  createdAt: '2026-08-22T09:00:00.000Z',
  updatedAt: '2026-08-22T09:00:00.000Z',
};

describe('BusinessService', () => {
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

  it('fetches the authenticated business without sending a business id', () => {
    let result: Business | null = null;
    service.getMyBusiness().subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/me`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: business, message: 'Business retrieved.' });
    expect(result).toEqual(business);
  });

  it('patches the business with trimmed fields and omits empty ones', () => {
    let result: unknown = null;
    service
      .updateBusiness({ businessName: '  Ubuntu Plumbing Co. (Pty) Ltd  ', description: '', city: 'Johannesburg' })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/me`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ businessName: 'Ubuntu Plumbing Co. (Pty) Ltd', city: 'Johannesburg' });
    req.flush({ success: true, data: { ...business, businessName: 'Ubuntu Plumbing Co. (Pty) Ltd' }, message: 'ok' });
    expect(result).toEqual({ ...business, businessName: 'Ubuntu Plumbing Co. (Pty) Ltd' });
  });

  it('lists technicians for the authenticated business', () => {
    let result: unknown = null;
    service.listTechnicians().subscribe((list) => (result = list));
    const req = httpMock.expectOne(`${API}/business/technicians`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { items: [technician], total: 1 }, message: 'ok' });
    expect(result).toEqual({ items: [technician], total: 1 });
  });

  it('fetches a single technician by id with URL encoding', () => {
    service.getTechnician('7').subscribe();
    const req = httpMock.expectOne(`${API}/business/technicians/7`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: technician, message: 'ok' });
  });

  it('invites a technician with trimmed contact fields', () => {
    let result: Technician | null = null;
    service
      .createTechnician({
        displayName: '  Bongani Zulu ',
        email: 'BONGANI.ZULU@example.co.za ',
        phone: '+27825550109',
        password: 'TechPass123!',
      })
      .subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/technicians`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      displayName: 'Bongani Zulu',
      email: 'BONGANI.ZULU@example.co.za',
      phone: '+27825550109',
      password: 'TechPass123!',
    });
    req.flush({ success: true, data: technician, message: 'ok' });
    expect(result).toEqual(technician);
  });

  it('omits an empty phone from the invite body', () => {
    service.createTechnician({ displayName: 'Karin Meyer', email: 'karin.meyer@example.co.za', password: 'x'.repeat(8) }).subscribe();
    const req = httpMock.expectOne(`${API}/business/technicians`);
    expect(req.request.body).toEqual({
      displayName: 'Karin Meyer',
      email: 'karin.meyer@example.co.za',
      password: 'xxxxxxxx',
    });
    req.flush({ success: true, data: technician, message: 'ok' });
  });

  it('updates a technician with the active flag', () => {
    let result: unknown = null;
    service.updateTechnician('7', { isActive: false }).subscribe((value) => (result = value));
    const req = httpMock.expectOne(`${API}/business/technicians/7`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ isActive: false });
    req.flush({ success: true, data: { ...technician, isActive: false }, message: 'ok' });
    expect(result).toEqual({ ...technician, isActive: false });
  });
});
