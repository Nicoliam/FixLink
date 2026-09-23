import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProviderCard } from '../../../core/models/marketplace.model';

/**
 * FixLink provider card — Oceanic Modern Marketplace (Stage 6A).
 *
 * Data-driven card for marketplace results and the homepage. The verified
 * badge renders only when the backend confirms `isVerified`; the frontend
 * never invents verification state.
 */
@Component({
  selector: 'app-provider-card',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './provider-card.html',
})
export class ProviderCardComponent {
  readonly provider = input.required<ProviderCard>();

  protected providerTypeLabel(provider: ProviderCard): string {
    return provider.providerType === 'business' ? 'Service business' : 'Professional';
  }

  protected areaLabel(provider: ProviderCard): string {
    const first = provider.serviceAreas[0];
    if (first) return [first.areaName, first.city].filter(Boolean).join(' · ');
    return [provider.city, provider.province].filter(Boolean).join(', ') || 'Service area on request';
  }

  protected monogram(provider: ProviderCard): string {
    const initial = provider.name.trim().charAt(0).toUpperCase();
    return initial || 'F';
  }
}
