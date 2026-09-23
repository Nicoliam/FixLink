import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Stage 6A routes — authentication foundation + marketplace discovery.
 * Stage 6B adds the customer job request (`/request-job` submission)
 * and My Jobs (`/my-jobs`) retrieval.
 * Role dashboards and the quote lifecycle arrive in later stages.
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
    path: 'my-jobs',
    loadComponent: () => import('./features/jobs/my-jobs').then((m) => m.MyJobsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'my-jobs/:id',
    loadComponent: () => import('./features/jobs/job-detail').then((m) => m.JobDetailComponent),
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
