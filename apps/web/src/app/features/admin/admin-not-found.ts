import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-admin-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="admin-page admin-page-narrow"><p class="admin-eyebrow">Admin</p><h1>Page not found</h1><div class="admin-state"><h2>This admin page does not exist</h2><p>Return to the operations dashboard and choose a supported resource.</p><a class="admin-btn admin-btn-primary" routerLink="/admin">Back to dashboard</a></div></section>`,
})
export class AdminNotFoundComponent {}
