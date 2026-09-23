import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import type {
  PortfolioProject,
  ProviderCertificate,
  ProviderProfile,
  ProviderReview,
} from '../../core/models/marketplace.model';

type ProfileStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * FixLink provider profile page — Stage 6A (`/marketplace/providers/:id`).
 *
 * Public trust profile: verification badges (backend-confirmed only),
 * services, service areas, portfolio with Before/After, approved
 * certificates and visible reviews. Request-a-job CTA routes to the
 * request foundation page (submission itself arrives in Stage 6B).
 */
@Component({
  selector: 'app-provider-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-detail.html',
})
export class ProviderDetailComponent implements OnInit {
  private readonly api = inject(MarketplaceService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<ProfileStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly profile = signal<ProviderProfile | null>(null);
  protected readonly portfolio = signal<PortfolioProject[]>([]);
  protected readonly certificates = signal<ProviderCertificate[]>([]);
  protected readonly reviews = signal<ProviderReview[]>([]);
  protected readonly reviewTotal = signal(0);

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id.trim()) {
      this.status.set('not-found');
      return;
    }
    this.api
      .getProvider(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (profile) => {
          this.profile.set(profile);
          this.status.set('ready');
          this.loadSections(id);
        },
        error: (error: unknown) => {
          const code = getApiErrorCode(error);
          if (code === 'NOT_FOUND') {
            this.status.set('not-found');
          } else {
            this.errorMessage.set(getApiErrorMessage(error, 'Could not load this profile. Please try again.'));
            this.status.set('error');
          }
        },
      });
  }

  protected retry(): void {
    const id = this.route.snapshot.paramMap.get('id') ?? '';
    if (!id.trim()) {
      this.status.set('not-found');
      return;
    }
    this.status.set('loading');
    this.errorMessage.set('');
    this.ngOnInit();
  }

  protected goToMarketplace(): void {
    void this.router.navigate(['/marketplace']);
  }

  protected areaLabel(profile: ProviderProfile): string {
    const areas = profile.serviceAreas.map((area) => area.areaName).filter(Boolean);
    if (areas.length > 0) return areas.join(' · ');
    return [profile.city, profile.province].filter(Boolean).join(', ') || 'Service area on request';
  }

  private loadSections(id: string): void {
    forkJoin({
      portfolio: this.api.getPortfolio(id).pipe(catchError(() => of([]))),
      certificates: this.api.getCertificates(id).pipe(catchError(() => of([]))),
      reviews: this.api.getReviews(id).pipe(
        catchError(() => of({ items: [], total: 0, page: 1, pageSize: 20 })),
      ),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((sections) => {
        this.portfolio.set(sections.portfolio);
        this.certificates.set(sections.certificates);
        this.reviews.set(sections.reviews.items);
        this.reviewTotal.set(sections.reviews.total);
      });
  }
}
