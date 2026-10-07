import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { catchError, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { ProviderCardComponent } from './components/provider-card';
import type { ProviderCard, ServiceCategory } from '../../core/models/marketplace.model';

type ResultsStatus = 'loading' | 'ready' | 'empty' | 'error';

/** Results per page. The backend caps pageSize at 50. */
const PAGE_SIZE = 12;

/**
 * Fixlynk marketplace search — API-backed.
 *
 * Results come from the public `GET /api/v1/providers` endpoint, so the
 * cards carry only real backend-confirmed data (verification state,
 * ratings, services, portfolio and certificate counts). The frontend
 * never invents a price, response time or online status: those fields are
 * not exposed by the API.
 *
 * Only filters the endpoint actually supports are sent. `GET /providers`
 * rejects unknown query parameters with 422, so the sidebar exposes
 * category, verification and free-text search only. Distance, price,
 * availability and minimum-rating controls are deliberately absent
 * because no backend support exists for them.
 */
@Component({
  selector: 'app-marketplace',
  imports: [FormsModule, ProviderCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.html',
  styleUrls: ['./marketplace.scss'],
})
export class MarketplaceComponent {
  private readonly api = inject(MarketplaceService);
  private readonly destroyRef = inject(DestroyRef);

  /** Free-text "what help do you need?" input, sent as the `q` filter. */
  protected serviceQuery = '';
  /** Suburb or city input, matched against provider service areas. */
  protected locationQuery = '';

  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly selectedCategory = signal('');
  protected readonly verifiedOnly = signal(false);

  protected readonly status = signal<ResultsStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly providers = signal<ProviderCard[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  /** Page numbers to render, e.g. [1, 2, 3]. */
  protected readonly pages = computed(() =>
    Array.from({ length: this.totalPages() }, (_unused, index) => index + 1),
  );
  protected readonly hasPreviousPage = computed(() => this.page() > 1);
  protected readonly hasNextPage = computed(() => this.page() < this.totalPages());
  protected readonly rangeStart = computed(() => (this.total() === 0 ? 0 : (this.page() - 1) * PAGE_SIZE + 1));
  protected readonly rangeEnd = computed(() => Math.min(this.page() * PAGE_SIZE, this.total()));
  protected readonly hasActiveFilters = computed(
    () =>
      this.serviceQuery.trim() !== '' ||
      this.locationQuery.trim() !== '' ||
      this.selectedCategory() !== '' ||
      this.verifiedOnly(),
  );

  constructor() {
    // Categories drive the sidebar. A failure here must not block results.
    this.api
      .listCategories()
      .pipe(
        catchError(() => of<ServiceCategory[]>([])),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((categories) => this.categories.set(categories));

    this.load();
  }

  /** Run the current search from page one. */
  protected onSearch(): void {
    this.page.set(1);
    this.load();
  }

  /** Apply a sidebar filter immediately. */
  protected applyFilters(): void {
    this.page.set(1);
    this.load();
  }

  /** Select a single category; selecting the active one clears it. */
  protected selectCategory(slug: string): void {
    this.selectedCategory.set(this.selectedCategory() === slug ? '' : slug);
    this.applyFilters();
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.page.set(page);
    this.load();
  }

  protected retry(): void {
    this.load();
  }

  protected resetFilters(): void {
    this.serviceQuery = '';
    this.locationQuery = '';
    this.selectedCategory.set('');
    this.verifiedOnly.set(false);
    this.applyFilters();
  }

  private load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .searchProviders({
        q: this.serviceQuery,
        location: this.locationQuery,
        category: this.selectedCategory(),
        verified: this.verifiedOnly() || undefined,
        page: this.page(),
        pageSize: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.providers.set(result.items);
          this.total.set(result.total);
          this.status.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.providers.set([]);
          this.total.set(0);
          this.errorMessage.set(
            getApiErrorMessage(error, 'Could not load professionals right now. Please try again.'),
          );
          this.status.set('error');
        },
      });
  }
}
