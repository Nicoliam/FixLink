import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from './core/services/auth.service';

/**
 * FixLink application shell — Stage 5B.
 *
 * Oceanic header with the FixLink logo and session-aware navigation,
 * plus the routed content. Dashboards arrive in later stages.
 */
@Component({
  selector: 'app-root',
  imports: [NgOptimizedImage, RouterLink, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly auth = inject(AuthService);
}
