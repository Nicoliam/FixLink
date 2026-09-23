import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

/**
 * Minimal authenticated session page (Stage 5B).
 *
 * Shows the successful authentication state — who is signed in and their
 * roles — plus logout. This is NOT a dashboard; role dashboards arrive in
 * Stage 6+. It exists so login has a protected destination and the
 * authGuard protects a real route.
 */
@Component({
  selector: 'app-account',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './account.html',
})
export class AccountComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentUser = this.auth.currentUser;
  protected readonly isLoggingOut = signal(false);

  logout(): void {
    if (this.isLoggingOut()) return;
    this.isLoggingOut.set(true);
    this.auth.logout().subscribe({
      next: () => void this.router.navigate(['/']),
      error: () => void this.router.navigate(['/']),
    });
  }
}
