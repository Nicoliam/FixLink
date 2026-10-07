import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { fromPriceLabel } from '../../core/models/marketplace.model';
import type { ProviderCard } from '../../core/models/marketplace.model';

interface ServiceItem {
  name: string;
  description: string;
  icon: string;
  iconClass: string;
}

interface StepItem {
  number: string;
  title: string;
  text: string;
  footer: string;
  icon: string;
  iconClass: string;
}

type FeaturedStatus = 'loading' | 'ready' | 'empty' | 'error';

/** Featured professionals shown on the landing page. */
const FEATURED_LIMIT = 3;

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {
  protected searchNeed = '';
  protected searchLocation = '';

  protected readonly services = signal<ServiceItem[]>([
    { name: 'General Handyman', description: 'Fixes, mounting & repairs', icon: 'handyman', iconClass: 'primary-fixed' },
    { name: 'Plumbing', description: 'Leaks, geysers, pipes', icon: 'plumbing', iconClass: 'secondary-container' },
    { name: 'Electrical', description: 'Wiring, DB boards, solar', icon: 'bolt', iconClass: 'primary-fixed' },
    { name: 'Painting', description: 'Interior & exterior coating', icon: 'format_paint', iconClass: 'secondary-container' },
    { name: 'Carpentry', description: 'Cabinets, doors & decking', icon: 'carpenter', iconClass: 'primary-fixed' },
    { name: 'Tiling', description: 'Floor, wall & patio paving', icon: 'grid_view', iconClass: 'secondary-container' },
    { name: 'Building', description: 'Plastering, brickwork, walls', icon: 'home_repair_service', iconClass: 'primary-fixed' },
    { name: 'Home Maintenance', description: 'Gutters, waterproofing, roofs', icon: 'roofing', iconClass: 'secondary-container' },
    { name: 'Gardening', description: 'Landscaping, cleanups, trees', icon: 'yard', iconClass: 'primary-fixed' },
    { name: 'Appliance Repairs', description: 'Fridges, washers, ovens', icon: 'kitchen', iconClass: 'secondary-container' },
  ]);

  protected readonly steps = signal<StepItem[]>([
    { number: '01', title: 'Tell us what you need', text: 'Describe your job and upload photos so artisans can assess the scope accurately.', footer: 'Instant request', icon: 'edit_note', iconClass: 'primary-fixed' },
    { number: '02', title: 'Find the right professional', text: 'Compare experience, previous work, certificates and reviews from local clients.', footer: 'Verified portfolios', icon: 'badge', iconClass: 'secondary-container' },
    { number: '03', title: 'Get a quote', text: 'Review the quote in South African Rand (ZAR) and choose your preferred professional.', footer: 'No hidden fees', icon: 'receipt_long', iconClass: 'primary-fixed' },
    { number: '04', title: 'Get the job done', text: 'Communicate, complete the job safely and release payment after leaving a verified review.', footer: 'Satisfaction guarantee', icon: 'task_alt', iconClass: 'secondary-container' },
  ]);

  /**
   * Featured professionals.
   *
   * These come from the public `GET /api/v1/providers` endpoint rather than
   * hard-coded copy, because every card below is a real entry point: "View
   * Profile" and "Request Job" navigate using the backend provider id. Mock
   * cards have no id, so their buttons could not navigate anywhere.
   *
   * Nothing on the card is invented. The API exposes no avatar image and no
   * portfolio photo URLs, so those slots render a monogram and the published
   * counts instead. The call-out fee is the provider's own lowest stated
   * offering price, and is omitted entirely when they have not stated one.
   */
  protected readonly featuredStatus = signal<FeaturedStatus>('loading');
  protected readonly featuredError = signal('');
  protected readonly professionals = signal<ProviderCard[]>([]);

  private readonly api = inject(MarketplaceService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  constructor() {
    this.loadFeatured();
  }

  protected onSearch(criteria: { service: string; location: string }): void {
    void this.router.navigate(['/marketplace'], {
      queryParams: {
        service: criteria.service || null,
        location: criteria.location || null,
      },
    });
  }

  protected retryFeatured(): void {
    this.loadFeatured();
  }

  /** Initial letter used as the avatar, since the API exposes no photo. */
  protected monogram(pro: ProviderCard): string {
    return pro.name.trim().charAt(0).toUpperCase() || 'F';
  }

  /** Primary service area, falling back to city and province. */
  protected areaLabel(pro: ProviderCard): string {
    const first = pro.serviceAreas[0];
    if (first) return [first.areaName, first.city].filter(Boolean).join(' · ');
    return [pro.city, pro.province].filter(Boolean).join(', ') || 'Service area on request';
  }

  protected experienceLabel(pro: ProviderCard): string | null {
    return pro.experienceYears === null ? null : `${pro.experienceYears}+ years exp.`;
  }

  /**
   * The provider's lowest stated call-out fee, or null when they have not
   * stated a price. Never a placeholder: no price means no figure at all.
   */
  protected fromPrice(pro: ProviderCard): string | null {
    return fromPriceLabel(pro);
  }

  private loadFeatured(): void {
    this.featuredStatus.set('loading');
    this.featuredError.set('');
    this.api
      .searchProviders({ verified: true, page: 1, pageSize: FEATURED_LIMIT })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.professionals.set(result.items.slice(0, FEATURED_LIMIT));
          this.featuredStatus.set(result.items.length === 0 ? 'empty' : 'ready');
        },
        error: (error: unknown) => {
          this.professionals.set([]);
          this.featuredError.set(
            getApiErrorMessage(error, 'Could not load providers right now.'),
          );
          this.featuredStatus.set('error');
        },
      });
  }
}
