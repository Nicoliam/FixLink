import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { HomeComponent } from './home';
import { AuthService } from '../../core/services/auth.service';
import { MarketplaceService } from '../../core/services/marketplace.service';

function authStub() {
  return {
    isRestoring: () => false,
    isAuthenticated: () => false,
    currentUser: () => null,
  };
}

describe('HomeComponent marketplace foundation', () => {
  let fixture: ComponentFixture<HomeComponent>;

  async function setup(featured: unknown): Promise<{ navigate: ReturnType<typeof vi.fn> }> {
    const navigate = vi.fn().mockResolvedValue(true);
    const api = {
      listCategories: vi.fn().mockReturnValue(of([{ id: '1', name: 'Plumbing', slug: 'plumbing' }])),
      searchProviders: vi.fn().mockReturnValue(
        featured instanceof Error ? throwError(() => featured) : of(featured),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [HomeComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub() },
        { provide: MarketplaceService, useValue: api },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockImplementation(navigate);
    fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return { navigate };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders API-backed categories and featured providers', async () => {
    await setup({
      items: [
        {
          id: 'professional-1',
          providerType: 'professional',
          name: 'Sipho Ndlovu - ProPlumb',
          description: null,
          city: 'Johannesburg',
          province: 'Gauteng',
          verificationStatus: 'VERIFIED',
          isVerified: true,
          ratingAvg: 4.8,
          ratingCount: 64,
          experienceYears: 9,
          services: [],
          serviceAreas: [],
          portfolioCount: 1,
          approvedCertificateCount: 1,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Plumbing');
    expect(text).toContain('Sipho Ndlovu - ProPlumb');
  });

  it('navigates to the marketplace with search criteria', async () => {
    const { navigate } = await setup({ items: [], total: 0, page: 1, pageSize: 3 });
    (fixture.componentInstance as unknown as { onSearch: (c: { service: string; location: string }) => void }).onSearch({
      service: 'plumbing',
      location: 'Fourways',
    });
    expect(navigate).toHaveBeenCalledWith(
      ['/marketplace'],
      { queryParams: { service: 'plumbing', location: 'Fourways' } },
    );
  });

  it('shows an error state when featured providers fail to load', async () => {
    await setup(new Error('offline'));
    expect((fixture.nativeElement.textContent as string)).toContain('Could not load providers right now.');
  });

  it('links each featured provider to its profile and to a job request', async () => {
    await setup({
      items: [
        {
          id: 'professional-1',
          providerType: 'professional',
          name: 'Kabelo Mahlangu - Fix-It Handyman',
          description: null,
          city: 'Johannesburg',
          province: 'Gauteng',
          verificationStatus: 'VERIFIED',
          isVerified: true,
          ratingAvg: 4.9,
          ratingCount: 87,
          experienceYears: 7,
          services: [{ id: '9', name: 'Handyman', slug: 'handyman' }],
          serviceAreas: [{ areaName: 'Fourways', city: 'Johannesburg', province: 'Gauteng' }],
          portfolioCount: 2,
          approvedCertificateCount: 1,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.fl-professional-card a'),
    ) as HTMLAnchorElement[];
    const profileLinks = links.filter((a) => a.getAttribute('href')?.includes('/marketplace/providers/'));
    const requestLinks = links.filter((a) => a.getAttribute('href')?.startsWith('/request-job'));

    expect(profileLinks.length).toBeGreaterThan(0);
    expect(profileLinks[0].getAttribute('href')).toContain('/marketplace/providers/professional-1');
    expect(requestLinks.length).toBeGreaterThan(0);
    expect(requestLinks[0].getAttribute('href')).toContain('provider=professional-1');
  });

  it('shows the call-out fee the provider actually stated', async () => {
    await setup({
      items: [
        {
          id: 'professional-1',
          providerType: 'professional',
          name: 'Sipho Ndlovu - ProPlumb',
          description: null,
          city: 'Johannesburg',
          province: 'Gauteng',
          verificationStatus: 'VERIFIED',
          isVerified: true,
          ratingAvg: 4.8,
          ratingCount: 64,
          experienceYears: 9,
          services: [],
          serviceAreas: [],
          portfolioCount: 1,
          approvedCertificateCount: 1,
          fromPrice: 1250,
          fromPriceCurrency: 'ZAR',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    const text = (fixture.nativeElement as HTMLElement).querySelector('.fl-professional-card')?.textContent ?? '';

    expect(text).toContain('Call out from');
    expect(text).toContain('R1,250');
  });

  it('omits the fee entirely when the provider has stated no price', async () => {
    await setup({
      items: [
        {
          id: 'professional-2',
          providerType: 'professional',
          name: 'Pieter Jacobs Painting',
          description: null,
          city: 'Johannesburg',
          province: 'Gauteng',
          verificationStatus: 'VERIFIED',
          isVerified: true,
          ratingAvg: 4.5,
          ratingCount: 10,
          experienceYears: 3,
          services: [],
          serviceAreas: [],
          portfolioCount: 0,
          approvedCertificateCount: 0,
          fromPrice: null,
          fromPriceCurrency: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    const text = (fixture.nativeElement as HTMLElement).querySelector('.fl-professional-card')?.textContent ?? '';

    // A provider who has not set a price must never be shown as "from R0".
    expect(text).not.toContain('Call out from');
    expect(text).not.toMatch(/R\s?0\b/);
    expect(text).toContain('Professional');
  });

  it('renders only backend-confirmed trust signals on a featured card', async () => {
    await setup({
      items: [
        {
          id: 'professional-2',
          providerType: 'professional',
          name: 'Pieter Jacobs Painting',
          description: null,
          city: 'Johannesburg',
          province: 'Gauteng',
          verificationStatus: 'UNVERIFIED',
          isVerified: false,
          ratingAvg: 0,
          ratingCount: 0,
          experienceYears: null,
          services: [],
          serviceAreas: [],
          portfolioCount: 0,
          approvedCertificateCount: 0,
          fromPrice: null,
          fromPriceCurrency: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 3,
    });
    const text = (fixture.nativeElement as HTMLElement).querySelector('.fl-professional-card')?.textContent ?? '';

    expect(text).toContain('Pieter Jacobs Painting');
    expect(text).not.toContain('Verified');
    expect(text).toContain('New on Fixlynk');
    expect(text).not.toContain('years exp.');
  });
});
