import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MarketplaceComponent } from './marketplace';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { ProviderCard } from '../../core/models/marketplace.model';

const card: ProviderCard = {
  id: 'professional-1',
  providerType: 'professional',
  name: 'Sipho Ndlovu — ProPlumb',
  description: 'PIRB-registered plumber.',

  city: 'Johannesburg',
  province: 'Gauteng',
  verificationStatus: 'VERIFIED',
  isVerified: true,
  ratingAvg: 4.8,
  ratingCount: 64,
  experienceYears: 9,
  services: [{ id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' }],
  serviceAreas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
  portfolioCount: 1,
  approvedCertificateCount: 1,
};

describe('MarketplaceComponent', () => {
  let fixture: ComponentFixture<MarketplaceComponent>;
  let api: { searchProviders: ReturnType<typeof vi.fn>; listCategories: ReturnType<typeof vi.fn> };
  let router: { navigate: ReturnType<typeof vi.fn> };

  async function setup(queryParams: Record<string, string> = {}): Promise<void> {
    api = {
      searchProviders: vi.fn().mockReturnValue(of({ items: [card], total: 1, page: 1, pageSize: 12 })),
      listCategories: vi.fn().mockReturnValue(of([])),
    };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [MarketplaceComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap(queryParams)),
            snapshot: { queryParamMap: convertToParamMap(queryParams) },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketplaceComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads providers on init and renders a provider card', async () => {
    await setup();
    expect(api.searchProviders).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, pageSize: 12 }),
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('1 provider found');
  });

  it('forwards service and location query params to the API', async () => {
    await setup({ service: 'plumbing', location: 'Fourways' });
    expect(api.searchProviders).toHaveBeenCalledWith(
      expect.objectContaining({ service: 'plumbing', location: 'Fourways' }),
    );
  });

  it('updates the route when filters change', async () => {
    await setup();
    const component = fixture.componentInstance as unknown as {
      onProviderTypeChange: (v: 'business') => void;
      onVerifiedChange: (v: boolean) => void;
    };
    component.onProviderTypeChange('business');
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ providerType: 'business' }) }),
    );
    component.onVerifiedChange(true);
    expect(router.navigate).toHaveBeenCalledWith(
      [],
      expect.objectContaining({ queryParams: expect.objectContaining({ verified: 'true' }) }),
    );
  });

  it('shows the empty state when no providers match', async () => {
    api = {
      searchProviders: vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 12 })),
      listCategories: vi.fn().mockReturnValue(of([])),
    };
    router = { navigate: vi.fn().mockResolvedValue(true) };
    await TestBed.configureTestingModule({
      imports: [MarketplaceComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
        { provide: Router, useValue: router },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: of(convertToParamMap({ location: 'Nowhereville' })) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketplaceComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('No providers found');
  });

  it('shows the error state with retry when the API fails', async () => {
    await setup();
    api.searchProviders.mockReturnValueOnce(
      throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Search failed.' } } })),
    );
    (fixture.componentInstance as unknown as { retry: () => void }).retry();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });
});
