import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-business-shell',
  imports: [NgOptimizedImage, RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="business-shell">
      <aside
        class="business-sidebar"
        [class.business-sidebar-open]="mobileMenuOpen()"
        aria-label="Business navigation"
      >
        <div class="business-mobile-bar">
          <a class="business-brand" routerLink="/business" (click)="closeMobileMenu()">
            <img
              class="business-brand-logo"
              ngSrc="brand/fixlynk-home-repair-logo.png"
              width="132"
              height="66"
              alt="Fixlynk"
            >
          </a>
          <button
            type="button"
            class="business-menu-toggle"
            (click)="toggleMobileMenu()"
            [attr.aria-expanded]="mobileMenuOpen()"
            aria-controls="business-navigation"
          >
            {{ mobileMenuOpen() ? 'Close menu' : 'Menu' }}
          </button>
        </div>

        <a class="business-brand business-brand-desktop" routerLink="/business">
          <img
            class="business-brand-logo"
            ngSrc="brand/fixlynk-home-repair-logo.png"
            width="132"
            height="66"
            alt="Fixlynk"
          >
        </a>

        <div class="business-workspace-label">BUSINESS WORKSPACE</div>

        <nav id="business-navigation" class="business-nav">
          @for (item of navigation; track item.path) {
            <a
              [routerLink]="item.path"
              routerLinkActive="business-nav-active"
              [routerLinkActiveOptions]="{ exact: item.path === '/business' }"
              ariaCurrentWhenActive="page"
              (click)="closeMobileMenu()"
            >
              <span class="business-nav-icon" aria-hidden="true">{{ item.icon }}</span>
              <span>{{ item.label }}</span>
            </a>
          }
        </nav>

        <div class="business-sidebar-bottom">
          <div class="business-user">
            <span class="business-status-dot"></span>
            <span class="business-user-email">{{ auth.currentUser()?.email }}</span>
          </div>

          <button
            type="button"
            class="business-logout"
            (click)="logout()"
            [disabled]="isLoggingOut()"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M10 17l5-5-5-5M15 12H3M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>
            </svg>
            <span>{{ isLoggingOut() ? 'Logging out…' : 'Log out' }}</span>
          </button>
        </div>
      </aside>

      <main class="business-content">
        <router-outlet />
      </main>
    </div>
  `,
})
export class BusinessShellComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly mobileMenuOpen = signal(false);
  protected readonly isLoggingOut = signal(false);

  protected readonly navigation = [
    { path: '/business', label: 'Overview', icon: '⌂' },
    { path: '/business/jobs', label: 'Jobs', icon: '▤' },
    { path: '/business/technicians', label: 'Team & Technicians', icon: '♙' },
    { path: '/business/customers', label: 'Customers', icon: '♧' },
    { path: '/business/services', label: 'Services', icon: '⚒' },
    { path: '/business/areas', label: 'Service Areas', icon: '⌖' },
    { path: '/business/profile', label: 'Company Settings', icon: '⚙' },
  ] as const;

  protected toggleMobileMenu(): void {
    this.mobileMenuOpen.update((open) => !open);
  }

  protected closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  protected logout(): void {
    if (this.isLoggingOut()) return;

    this.isLoggingOut.set(true);
    this.auth.logout().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => void this.router.navigate(['/']),
      error: () => void this.router.navigate(['/']),
      complete: () => this.isLoggingOut.set(false),
    });
  }
}
