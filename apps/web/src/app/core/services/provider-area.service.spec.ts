import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ProviderAreaService } from './provider-area.service';
import { API_BASE_URL } from '../config/api-config';

const API = 'http://test.local/api/v1';
const URL = `${API}/provider/me/service-areas`;

/**
 * Step 14 — the service-areas client.
 *
 * The load-bearing detail is the replace payload: this is the only place that
 * decides how a typed area becomes a stored one, and a blank city sent as `''`
 * would round-trip as a real (empty) area value.
 */
describe('ProviderAreaService', () => {
  let service: ProviderAreaService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(ProviderAreaService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('reads the caller areas with no provider id anywhere', () => {
    let result: unknown = null;
    service.list().subscribe((list) => (result = list));
    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('GET');
    req.flush({
      success: true,
      data: { items: [{ areaName: 'Randburg', city: 'Johannesburg', province: 'Gauteng' }] },
      message: 'ok',
    });
    expect(result).toEqual({ items: [{ areaName: 'Randburg', city: 'Johannesburg', province: 'Gauteng' }] });
  });

  it('trims names and cities, and turns blanks into null', () => {
    service
      .replace([
        { areaName: '  Randburg & surrounds  ', city: '  Johannesburg ', province: '   ' },
        { areaName: 'Fourways', city: '', province: '' },
      ])
      .subscribe();
    const req = httpMock.expectOne(URL);
    expect(req.request.method).toBe('PATCH');
    // `''` would be stored as a blank city and would match nothing; `null` is
    // the honest representation of "not supplied".
    expect(req.request.body).toEqual({
      areas: [
        { areaName: 'Randburg & surrounds', city: 'Johannesburg', province: null },
        { areaName: 'Fourways', city: null, province: null },
      ],
    });
    req.flush({ success: true, data: { items: [] }, message: 'ok' });
  });

  it('sends the whole list every time, never a partial patch', () => {
    service.replace([{ areaName: 'Sandton', city: 'Johannesburg', province: 'Gauteng' }]).subscribe();
    const req = httpMock.expectOne(URL);
    // One key, the whole list. There is no add/remove verb to fall back on.
    expect(Object.keys(req.request.body)).toEqual(['areas']);
    req.flush({ success: true, data: { items: [] }, message: 'ok' });
  });

  it('turns stored areas into editable drafts', () => {
    expect(
      ProviderAreaService.toDrafts([
        { areaName: 'Randburg', city: 'Johannesburg', province: null },
      ]),
    ).toEqual([{ areaName: 'Randburg', city: 'Johannesburg', province: '' }]);
  });
});