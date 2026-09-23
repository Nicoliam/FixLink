import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProviderDetailComponent } from './provider-detail';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { ProviderProfile } from '../../core/models/marketplace.model';

const profile: ProviderProfile = {
  id: 'professional-1',
  providerType: 'professional',
  name: 'Sipho Ndlovu — ProPlumb',
  description: 'PIRB-registered plumber.',
  bio: 'PIRB-registered plumber doing leaks across Joburg North.',
  photoReference: null,
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

describe('ProviderDetailComponent', () => {
  let fixture: ComponentFixture<ProviderDetailComponent>;
  let api: {
    getProvider: ReturnType<typeof vi.fn>;
    getPortfolio: ReturnType<typeof vi.fn>;
    getCertificates: ReturnType<typeof vi.fn>;
    getReviews: ReturnType<typeof vi.fn>;
  };

  async function setup(providerId: string | null, overrides: Record<string, unknown> = {}): Promise<void> {
    api = {
      getProvider: vi.fn().mockReturnValue(of(profile)),
      getPortfolio: vi.fn().mockReturnValue(
        of([
          {
            id: '1',
            title: 'Northcliff kitchen leak repair',
            description: 'Same-day fix.',
            service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
            images: [
              { id: '1', fileReference: 'portfolio/1/before-sink.jpg', mimeType: 'image/jpeg', kind: 'BEFORE', sortOrder: 1 },
              { id: '2', fileReference: 'portfolio/1/after-sink.jpg', mimeType: 'image/jpeg', kind: 'AFTER', sortOrder: 2 },
            ],
            createdAt: '2026-09-20T10:00:00.000Z',
          },
        ]),
      ),
      getCertificates: vi.fn().mockReturnValue(
        of([
          { id: '1', title: 'PIRB Registered Plumber', issuingOrganisation: 'PIRB', issueDate: '2023-03-14', expiryDate: '2027-03-13', verificationStatus: 'APPROVED' },
        ]),
      ),
      getReviews: vi.fn().mockReturnValue(
        of({
          items: [{ id: '1', rating: 5, comment: 'Great work.', reviewerName: 'Aisha P.', createdAt: '2026-09-19T10:00:00.000Z' }],
          total: 1,
          page: 1,
          pageSize: 20,
        }),
      ),
      ...overrides,
    } as typeof api;
    await TestBed.configureTestingModule({
      imports: [ProviderDetailComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(providerId ? { id: providerId } : {}) },
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ProviderDetailComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the profile with trust, services, portfolio, certificates and reviews', async () => {
    await setup('professional-1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Identity verified');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Randburg & surrounds');
    expect(text).toContain('Northcliff kitchen leak repair');
    expect(text).toContain('PIRB Registered Plumber');
    expect(text).toContain('Aisha P.');
    expect(text).toContain('Request a job');
  });

  it('requests the profile by route id and loads all sections', async () => {
    await setup('professional-1');
    expect(api.getProvider).toHaveBeenCalledWith('professional-1');
    expect(api.getPortfolio).toHaveBeenCalledWith('professional-1');
    expect(api.getCertificates).toHaveBeenCalledWith('professional-1');
    expect(api.getReviews).toHaveBeenCalledWith('professional-1');
  });

  it('shows the not-found state for an unknown provider', async () => {
    await setup('professional-9999', {
      getProvider: vi.fn().mockReturnValue(
        throwError(() => ({ error: { error: { code: 'NOT_FOUND', message: 'Provider not found.' } } })),
      ),
    });
    expect((fixture.nativeElement.textContent as string)).toContain('Provider not found');
  });

  it('shows the error state with retry on API failure', async () => {
    await setup('professional-1', {
      getProvider: vi.fn().mockReturnValue(
        throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Profile failed.' } } })),
      ),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Something went wrong');
    expect(text).toContain('Profile failed.');
  });
});
