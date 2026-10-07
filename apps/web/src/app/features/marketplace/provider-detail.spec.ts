import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProviderDetailComponent } from './provider-detail';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { SavedProvidersService } from '../../core/services/saved-providers.service';
import { AuthService } from '../../core/services/auth.service';
import type { ProviderProfile } from '../../core/models/marketplace.model';
import type { UserRole } from '../../core/models/auth.model';

const profile: ProviderProfile = {
  id: 'professional-1',
  providerType: 'professional',
  name: 'Sipho Ndlovu - ProPlumb',
  description: 'PIRB-registered plumber.',
  bio: 'PIRB-registered plumber doing leaks across Joburg North.',

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
  fromPrice: 850,
  fromPriceCurrency: 'ZAR',
  offerings: [
    {
      id: 'offering-1',
      name: 'Emergency Burst Pipe Repair',
      description: 'Same-day call-out.',
      categoryName: 'Plumbing',
      categorySlug: 'plumbing',
      priceAmount: 850,
      currency: 'ZAR',
    },
  ],
};

describe('ProviderDetailComponent', () => {
  let fixture: ComponentFixture<ProviderDetailComponent>;
  let api: {
    getProvider: ReturnType<typeof vi.fn>;
    getPortfolio: ReturnType<typeof vi.fn>;
    getCertificates: ReturnType<typeof vi.fn>;
    getReviews: ReturnType<typeof vi.fn>;
  };

  let saved: {
    state: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
  };

  async function setup(
    providerId: string | null,
    overrides: Record<string, unknown> = {},
    roles: UserRole[] | null = null,
    savedOverrides: Record<string, unknown> = {},
  ): Promise<void> {
    api = {
      getProvider: vi.fn().mockReturnValue(of(profile)),
      getPortfolio: vi.fn().mockReturnValue(
        of([
          {
            id: '1',
            title: 'Northcliff kitchen leak repair',
            description: 'Same-day fix.',
            service: {
              id: '1',
              name: 'Leak Repair & Pipe Fixes',
              slug: 'leak-repair',
              categoryId: '1',
              categoryName: 'Plumbing',
            },
            images: [
              { id: '1', mimeType: 'image/jpeg', kind: 'BEFORE', sortOrder: 1 },
              { id: '2', mimeType: 'image/jpeg', kind: 'AFTER', sortOrder: 2 },
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
    saved = {
      state: vi.fn().mockReturnValue(of({ providerId: providerId ?? '', saved: false })),
      save: vi.fn().mockReturnValue(of({ ...profile, savedAt: '2026-10-01T00:00:00.000Z' })),
      remove: vi.fn().mockReturnValue(of(undefined)),
      ...savedOverrides,
    } as typeof saved;
    await TestBed.configureTestingModule({
      imports: [ProviderDetailComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
        { provide: SavedProvidersService, useValue: saved },
        { provide: Router, useValue: { navigate: vi.fn() } },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: convertToParamMap(providerId ? { id: providerId } : {}) },
          },
        },
      ],
    }).compileComponents();
    if (roles) {
      TestBed.overrideProvider(AuthService, {
        useValue: { isAuthenticated: signal(true), currentUser: signal({ roles }) },
      });
    }
    fixture = TestBed.createComponent(ProviderDetailComponent);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  function saveButton(): HTMLButtonElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-pressed]');
  }

  /** The save control's visible label, ignoring the Material Symbols ligature. */
  function saveLabel(): string {
    return saveButton()?.textContent?.replace(/bookmark_add|bookmark/g, '').trim() ?? '';
  }

  function savePressed(): string | null {
    return saveButton()?.getAttribute('aria-pressed') ?? null;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders the profile with trust, services, portfolio, certificates and reviews', async () => {
    await setup('professional-1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Sipho Ndlovu - ProPlumb');
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

  it('hides the save control from anonymous visitors', async () => {
    await setup('professional-1');
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Save');
    expect(saved.state).not.toHaveBeenCalled();
  });

  it('hides the save control from a signed-in professional', async () => {
    await setup('professional-1', {}, ['PROFESSIONAL']);
    const text = fixture.nativeElement.textContent as string;
    expect(text).not.toContain('Save');
    expect(saved.state).not.toHaveBeenCalled();
  });

  it('loads and shows the saved state for a customer', async () => {
    await setup(
      'professional-1',
      {},
      ['CUSTOMER'],
      { state: vi.fn().mockReturnValue(of({ providerId: 'professional-1', saved: true })) },
    );
    expect(saved.state).toHaveBeenCalledWith('professional-1');
    expect(saveLabel()).toBe('Saved');
    expect(savePressed()).toBe('true');
  });

  it('saves the provider when a customer taps save', async () => {
    await setup('professional-1', {}, ['CUSTOMER']);
    expect(saveLabel()).toBe('Save');
    expect(savePressed()).toBe('false');
    saveButton()?.click();
    fixture.detectChanges();
    expect(saved.save).toHaveBeenCalledWith('professional-1');
    expect(saveLabel()).toBe('Saved');
    expect(savePressed()).toBe('true');
  });

  it('removes the provider when a customer taps an already-saved control', async () => {
    await setup(
      'professional-1',
      {},
      ['CUSTOMER'],
      { state: vi.fn().mockReturnValue(of({ providerId: 'professional-1', saved: true })) },
    );
    expect(saveLabel()).toBe('Saved');
    saveButton()?.click();
    fixture.detectChanges();
    expect(saved.remove).toHaveBeenCalledWith('professional-1');
    expect(saved.save).not.toHaveBeenCalled();
    expect(saveLabel()).toBe('Save');
  });

  it('surfaces a save failure and rolls the control back', async () => {
    await setup('professional-1', {}, ['CUSTOMER'], {
      save: vi.fn().mockReturnValue(
        throwError(() => ({ error: { error: { code: 'CONFLICT', message: 'Already saved.' } } })),
      ),
    });
    saveButton()?.click();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Already saved.');
    expect(saveLabel()).toBe('Save');
  });

  it('keeps the profile usable when the saved-state lookup fails', async () => {
    await setup(
      'professional-1',
      {},
      ['CUSTOMER'],
      {
        state: vi.fn().mockReturnValue(
          throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'nope' } } })),
        ),
      },
    );
    expect((fixture.nativeElement.textContent as string)).toContain('Sipho Ndlovu - ProPlumb');
    expect(saveLabel()).toBe('Save');
  });
});
