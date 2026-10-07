import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, forkJoin, of } from 'rxjs';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { SavedProvidersService } from '../../core/services/saved-providers.service';
import { AuthService } from '../../core/services/auth.service';
import { getApiErrorCode, getApiErrorMessage } from '../../core/models/api.model';
import type {
  PortfolioProject,
  ProviderCertificate,
  ProviderProfile,
  ProviderReview,
} from '../../core/models/marketplace.model';

type ProfileStatus = 'loading' | 'ready' | 'error' | 'not-found';

/**
 * Fixlynk provider profile page — Stage 6A (`/marketplace/providers/:id`).
 *
 * Public trust profile: verification badges (backend-confirmed only),
 * services, service areas, portfolio with Before/After, approved
 * certificates and visible reviews. Request-a-job CTA routes to the
 * request foundation page (submission itself arrives in Stage 6B).
 *
 * The profile is public, so the save control is a progressive enhancement:
 * it renders only for a signed-in CUSTOMER, and its saved/unsaved state is a
 * UX hint. The backend re-checks the role and derives ownership, so a
 * tampered client can neither save for somebody else nor read another
 * customer's list.
 */
@Component({
  selector: 'app-provider-detail',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-detail.html',
})
export class ProviderDetailComponent implements OnInit {
  private readonly api = inject(MarketplaceService);
  private readonly saved = inject(SavedProvidersService);
  private readonly auth = inject(AuthService);
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

  /** Only a signed-in customer may bookmark; the backend refuses other roles. */
  protected readonly canSave = computed(
    () => this.auth.isAuthenticated() && (this.auth.currentUser()?.roles ?? []).includes('CUSTOMER'),
  );
  protected readonly isSaved = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly saveError = signal('');

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
          if (this.canSave()) this.loadSavedState(id);
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

  /** Bookmark or un-bookmark this provider, then reflect the new state. */
  protected toggleSaved(): void {
    const provider = this.profile();
    if (!provider || this.isSaving() || !this.canSave()) return;
    const wasSaved = this.isSaved();
    this.isSaving.set(true);
    this.saveError.set('');
    const settle = {
      next: () => {
        this.isSaved.set(!wasSaved);
        this.isSaving.set(false);
      },
      error: (error: unknown) => {
        this.saveError.set(
          getApiErrorMessage(
            error,
            wasSaved
              ? 'Could not remove this professional from your saved list.'
              : 'Could not save this professional.',
          ),
        );
        this.isSaving.set(false);
      },
    };
    if (wasSaved) {
      this.saved.remove(provider.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(settle);
    } else {
      this.saved.save(provider.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(settle);
    }
  }

  private loadSavedState(id: string): void {
    this.saved
      .state(id)
      .pipe(
        // A failed lookup must not break the public profile: the control
        // simply stays in its unsaved state and the customer can retry.
        catchError(() => of(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((state) => this.isSaved.set(state?.saved ?? false));
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
