import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Stage 6A routes — authentication foundation + marketplace discovery.
 * Role dashboards and the job lifecycle arrive in later stages.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
  },
  {
    path: 'marketplace',
    loadComponent: () => import('./features/marketplace/marketplace').then((m) => m.MarketplaceComponent),
  },
  {
    path: 'marketplace/providers/:id',
    loadComponent: () =>
      import('./features/marketplace/provider-detail').then((m) => m.ProviderDetailComponent),
  },
  // Stage-brief alias: /providers/:id resolves to the canonical profile.
  {
    path: 'providers/:id',
    redirectTo: (route) => `/marketplace/providers/${route.params['id']}`,
  },
  {
    path: 'request-job',
    loadComponent: () => import('./features/marketplace/request-job').then((m) => m.RequestJobComponent),
    canActivate: [authGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.LoginComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'register',
    loadComponent: () => import('./features/auth/register/register').then((m) => m.RegisterComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'account',
    loadComponent: () => import('./features/account/account').then((m) => m.AccountComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
