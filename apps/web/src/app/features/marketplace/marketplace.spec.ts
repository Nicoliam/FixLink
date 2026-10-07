import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import type { WritableSignal } from '@angular/core';
import { MarketplaceComponent } from './marketplace';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { ProviderCard, ServiceCategory } from '../../core/models/marketplace.model';

const card: ProviderCard = {
  id: 'professional-1',
  providerType: 'professional',
  name: 'Sipho Ndlovu - ProPlumb',
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
  fromPrice: 850,
  fromPriceCurrency: 'ZAR',
};

const plumbing: ServiceCategory = {
  id: '2',
  name: 'Plumbing',
  slug: 'plumbing',
  description: null,
};

describe('MarketplaceComponent', () => {
  let fixture: ComponentFixture<MarketplaceComponent>;
  let api: { searchProviders: ReturnType<typeof vi.fn>; listCategories: ReturnType<typeof vi.fn> };

  function stubApi(items: ProviderCard[] = [card], total = items.length): void {
    api = {
      searchProviders: vi.fn().mockReturnValue(of({ items, total, page: 1, pageSize: 12 })),
      listCategories: vi.fn().mockReturnValue(of([plumbing])),
    };
  }

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MarketplaceComponent],
      providers: [{ provide: MarketplaceService, useValue: api }, provideRouter([])],
    }).compileComponents();
    fixture = TestBed.createComponent(MarketplaceComponent);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  /** Invoke a protected method without widening the component's public API. */
  function call<T>(name: string, ...args: unknown[]): T {
    return (fixture.componentInstance as unknown as Record<string, (...a: unknown[]) => T>)[name](...args);
  }

  /** Read a protected signal off the component instance. */
  function signal<T>(name: string): WritableSignal<T> {
    return (fixture.componentInstance as unknown as Record<string, WritableSignal<T>>)[name];
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('searches the API on init and renders a provider card', async () => {
    stubApi();
    await setup();
    expect(api.searchProviders).toHaveBeenCalledWith(expect.objectContaining({ page: 1, pageSize: 12 }));
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
  });

  it('only sends filters the providers endpoint supports', async () => {
    stubApi();
    await setup();
    const params = api.searchProviders.mock.calls[0]?.[0] as Record<string, unknown>;
    // GET /providers rejects unknown query parameters with 422, so the
    // component must never invent a filter key. Empty values are dropped by
    // MarketplaceService before the request is made.
    const supported = new Set(['q', 'location', 'category', 'verified', 'page', 'pageSize']);
    for (const key of Object.keys(params)) {
      expect(supported.has(key)).toBe(true);
    }
  });

  it('sends free-text search as q and the location filter', async () => {
    stubApi();
    await setup();
    const component = fixture.componentInstance as unknown as {
      serviceQuery: string;
      locationQuery: string;
      onSearch: () => void;
    };
    component.serviceQuery = 'leaking tap';
    component.locationQuery = 'Fourways';
    component.onSearch();
    expect(api.searchProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({ q: 'leaking tap', location: 'Fourways' }),
    );
  });

  it('sends the category slug when a category is selected', async () => {
    stubApi();
    await setup();
    call('selectCategory', 'plumbing');
    expect(api.searchProviders).toHaveBeenLastCalledWith(expect.objectContaining({ category: 'plumbing' }));
    // Selecting the active category clears it again.
    call('selectCategory', 'plumbing');
    expect(api.searchProviders).toHaveBeenLastCalledWith(expect.objectContaining({ category: '' }));
  });

  it('requests verified providers only when the trust filter is checked', async () => {
    stubApi();
    await setup();
    signal<boolean>('verifiedOnly').set(true);
    (fixture.componentInstance as unknown as { applyFilters: () => void }).applyFilters();
    expect(api.searchProviders).toHaveBeenLastCalledWith(expect.objectContaining({ verified: true }));
  });

  it('resets to page one and clears filters', async () => {
    stubApi();
    await setup();
    call('selectCategory', 'plumbing');
    call('resetFilters');
    expect(api.searchProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: '', q: '', location: '', page: 1 }),
    );
  });

  it('offers View profile and Request job routes for each result', async () => {
    stubApi();
    await setup();
    const links = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('app-provider-card a'),
    ).map((link) => link.getAttribute('href'));
    expect(links).toContain('/marketplace/providers/professional-1');
    expect(links).toContain('/request-job?provider=professional-1');
  });

  it('shows the empty state when no providers match', async () => {
    stubApi([], 0);
    await setup();
    expect(text()).toContain('No professionals found');
  });

  it('shows the error state and retries', async () => {
    stubApi();
    await setup();
    api.searchProviders.mockReturnValueOnce(
      throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Search failed.' } } })),
    );
    call('retry');
    fixture.detectChanges();
    expect(text()).toContain('Something went wrong');
    expect(api.searchProviders).toHaveBeenCalledTimes(2);
  });

  it('still renders results when the category list fails to load', async () => {
    stubApi();
    await setup();
    api.listCategories.mockReturnValueOnce(
      throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'No categories.' } } })),
    );
    const next = TestBed.createComponent(MarketplaceComponent);
    next.detectChanges();
    expect((next.nativeElement.textContent as string)).toContain('Sipho Ndlovu - ProPlumb');
  });
});
