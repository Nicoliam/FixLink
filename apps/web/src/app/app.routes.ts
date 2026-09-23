import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Stage 5B routes — authentication foundation only.
 * Marketplace and role dashboards arrive in later stages.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home/home').then((m) => m.HomeComponent),
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
