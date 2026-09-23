import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type {
  ProviderCard,
  ProviderSearchParams,
  ServiceCategory,
} from '../../core/models/marketplace.model';
import { MarketplaceSearchComponent } from './components/marketplace-search';
import { ProviderCardComponent } from './components/provider-card';

type MarketplaceStatus = 'loading' | 'ready' | 'empty' | 'error';

/**
 * FixLink marketplace search page — Stage 6A (`/marketplace`).
 *
 * API-backed discovery: service/location search, provider-type and
 * verification filters, category filter, and pagination. All filtering is
 * performed server-side; the page only forwards the criteria.
 */
@Component({
  selector: 'app-marketplace',
  imports: [MarketplaceSearchComponent, ProviderCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.html',
})
export class MarketplaceComponent {
  private readonly api = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly service = signal('');
  protected readonly location = signal('');
  protected readonly providerType = signal<'' | 'professional' | 'business'>('');
  protected readonly verifiedOnly = signal(false);
  protected readonly category = signal('');
  protected readonly providers = signal<ProviderCard[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = 12;
  protected readonly status = signal<MarketplaceStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly categories = signal<ServiceCategory[]>([]);

  protected readonly hasActiveFilters = computed(
    () =>
      this.service() !== '' ||
      this.location() !== '' ||
      this.providerType() !== '' ||
      this.verifiedOnly() ||
      this.category() !== '',
  );

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize)));

  constructor() {
    this.api
      .listCategories()
      .pipe(
        catchError(() => of([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.categories.set(items));

    this.route.queryParamMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      this.service.set(params.get('service') ?? '');
      this.location.set(params.get('location') ?? '');
      const type = params.get('providerType') ?? '';
      this.providerType.set(type === 'professional' || type === 'business' ? type : '');
      this.verifiedOnly.set((params.get('verified') ?? '').toLowerCase() === 'true');
      this.category.set(params.get('category') ?? '');
      this.page.set(Number(params.get('page') ?? '1') || 1);
      this.load();
    });
  }

  protected onSearch(criteria: { service: string; location: string }): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { service: criteria.service || null, location: criteria.location || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onProviderTypeChange(value: '' | 'professional' | 'business'): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { providerType: value || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onVerifiedChange(checked: boolean): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { verified: checked ? 'true' : null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected onCategoryChange(value: string): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { category: value || null, page: null },
      queryParamsHandling: 'merge',
    });
  }

  protected clearFilters(): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { service: null, location: null, providerType: null, verified: null, category: null, page: null },
    });
  }

  protected goToPage(next: number): void {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { page: next > 1 ? String(next) : null },
      queryParamsHandling: 'merge',
    });
  }

  protected retry(): void {
    this.load();
  }

  private load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    const params: ProviderSearchParams = {
      service: this.service() || undefined,
      location: this.location() || undefined,
      providerType: this.providerType() || undefined,
      verified: this.verifiedOnly() || undefined,
      category: this.category() || undefined,
      page: this.page(),
      pageSize: this.pageSize,
    };
    this.api
      .searchProviders(params)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.providers.set(result.items);
          this.total.set(result.total);
          this.page.set(result.page);
          this.status.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.providers.set([]);
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load providers. Please try again.'));
          this.status.set('error');
        },
      });
  }
}
