import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { catchError, of } from 'rxjs';
import { AuthService } from '../../core/services/auth.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { ProviderCard, ServiceCategory } from '../../core/models/marketplace.model';
import { MarketplaceSearchComponent } from '../marketplace/components/marketplace-search';
import { ProviderCardComponent } from '../marketplace/components/provider-card';

/**
 * FixLink homepage — Stage 6A (Stitch: handylink_homepage).
 *
 * Public entry into the marketplace: service + suburb search, service
 * categories and featured providers — all backed by the real API with
 * loading, empty and error states. Auth entry points are preserved.
 */
@Component({
  selector: 'app-home',
  imports: [MarketplaceSearchComponent, NgOptimizedImage, ProviderCardComponent, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class HomeComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(MarketplaceService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly categories = signal<ServiceCategory[]>([]);
  protected readonly categoriesFailed = signal(false);
  protected readonly featured = signal<ProviderCard[]>([]);
  protected readonly featuredStatus = signal<'loading' | 'ready' | 'empty' | 'error'>('loading');

  ngOnInit(): void {
    this.api
      .listCategories()
      .pipe(
        catchError(() => {
          this.categoriesFailed.set(true);
          return of([]);
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((items) => this.categories.set(items.slice(0, 8)));

    this.api
      .searchProviders({ page: 1, pageSize: 3 })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.featured.set(result.items);
          this.featuredStatus.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: () => this.featuredStatus.set('error'),
      });
  }

  protected onSearch(criteria: { service: string; location: string }): void {
    void this.router.navigate(['/marketplace'], {
      queryParams: {
        service: criteria.service || null,
        location: criteria.location || null,
      },
    });
  }
}
