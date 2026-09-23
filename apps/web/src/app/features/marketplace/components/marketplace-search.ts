import { ChangeDetectionStrategy, Component, input, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * FixLink marketplace search bar — Oceanic dual-input pattern
 * (Service + Location/Suburb + Search). Emits the entered criteria;
 * the owning page performs the API-backed search.
 */
@Component({
  selector: 'app-marketplace-search',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="fl-search" (ngSubmit)="onSubmit()" role="search" aria-label="Search FixLink providers">
      <div class="fl-search-field">
        <label class="fl-label" for="fl-search-service">Service</label>
        <input
          id="fl-search-service"
          class="fl-input"
          type="search"
          name="service"
          autocomplete="off"
          placeholder="Plumbing, Electrical, Handyman…"
          [ngModel]="service()"
          (ngModelChange)="service.set($event)"
        />
      </div>
      <div class="fl-search-field">
        <label class="fl-label" for="fl-search-location">Suburb / Location</label>
        <input
          id="fl-search-location"
          class="fl-input"
          type="search"
          name="location"
          autocomplete="off"
          placeholder="Fourways, Sandton, Randburg…"
          [ngModel]="location()"
          (ngModelChange)="location.set($event)"
        />
      </div>
      <button class="fl-btn fl-btn-primary fl-search-button" type="submit">Search</button>
    </form>
  `,
})
export class MarketplaceSearchComponent implements OnInit {
  readonly initialService = input('', { alias: 'service' });
  readonly initialLocation = input('', { alias: 'location' });
  readonly searched = output<{ service: string; location: string }>();

  protected readonly service = signal('');
  protected readonly location = signal('');

  ngOnInit(): void {
    this.service.set(this.initialService());
    this.location.set(this.initialLocation());
  }

  protected onSubmit(): void {
    this.searched.emit({ service: this.service().trim(), location: this.location().trim() });
  }
}
