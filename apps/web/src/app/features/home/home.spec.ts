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
          name: 'Sipho Ndlovu — ProPlumb',
          description: null,
          photoReference: null,
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
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
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
});
