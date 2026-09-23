import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  Paginated,
  PortfolioProject,
  ProviderCard,
  ProviderCertificate,
  ProviderProfile,
  ProviderReview,
  ProviderSearchParams,
  ServiceCategory,
  ServiceListing,
} from '../models/marketplace.model';

/**
 * FixLink marketplace API client — Stage 6A.
 *
 * Single owner of marketplace discovery calls. All endpoints are public
 * (no authentication required); requesting a job is gated by the route
 * guard and implemented in Stage 6B.
 */
@Injectable({ providedIn: 'root' })
export class MarketplaceService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Public service catalogue (active services with category context). */
  listServices(): Observable<ServiceListing[]> {
    return this.http
      .get<ApiSuccess<{ items: ServiceListing[] }>>(`${this.baseUrl}/services`)
      .pipe(map((res) => res.data.items));
  }

  /** Public service categories. */
  listCategories(): Observable<ServiceCategory[]> {
    return this.http
      .get<ApiSuccess<{ items: ServiceCategory[] }>>(`${this.baseUrl}/categories`)
      .pipe(map((res) => res.data.items));
  }

  /** Search marketplace providers. Only defined filters are sent. */
  searchProviders(params: ProviderSearchParams): Observable<Paginated<ProviderCard>> {
    let httpParams = new HttpParams();
    if (params.service?.trim()) httpParams = httpParams.set('service', params.service.trim());
    if (params.category?.trim()) httpParams = httpParams.set('category', params.category.trim());
    if (params.location?.trim()) httpParams = httpParams.set('location', params.location.trim());
    if (params.providerType) httpParams = httpParams.set('providerType', params.providerType);
    if (params.verified) httpParams = httpParams.set('verified', 'true');
    if (params.q?.trim()) httpParams = httpParams.set('q', params.q.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<Paginated<ProviderCard>>>(`${this.baseUrl}/providers`, { params: httpParams })
      .pipe(map((res) => res.data));
  }

  /** Public provider profile (trust info, services, areas). */
  getProvider(id: string): Observable<ProviderProfile> {
    return this.http
      .get<ApiSuccess<ProviderProfile>>(`${this.baseUrl}/providers/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Published portfolio projects (Before/After where available). */
  getPortfolio(id: string): Observable<PortfolioProject[]> {
    return this.http
      .get<ApiSuccess<{ items: PortfolioProject[] }>>(`${this.baseUrl}/providers/${encodeURIComponent(id)}/portfolio`)
      .pipe(map((res) => res.data.items));
  }

  /** Approved certificates only — document files are never exposed. */
  getCertificates(id: string): Observable<ProviderCertificate[]> {
    return this.http
      .get<ApiSuccess<{ items: ProviderCertificate[] }>>(
        `${this.baseUrl}/providers/${encodeURIComponent(id)}/certificates`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Visible customer reviews (reviewer display names only). */
  getReviews(id: string): Observable<Paginated<ProviderReview>> {
    return this.http
      .get<ApiSuccess<Paginated<ProviderReview>>>(`${this.baseUrl}/providers/${encodeURIComponent(id)}/reviews`)
      .pipe(map((res) => res.data));
  }
}
