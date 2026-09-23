import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Public FixLink landing placeholder (Stage 5B).
 *
 * This is NOT a dashboard — it introduces the product, exposes the auth
 * entry points and reflects the current session state. Marketplace and
 * role dashboards arrive in later stages.
 */
@Component({
  selector: 'app-home',
  imports: [NgOptimizedImage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
})
export class HomeComponent {
  protected readonly auth = inject(AuthService);
}
