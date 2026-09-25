import { Routes } from '@angular/router';
import { adminGuard } from './core/guards/admin.guard';
import { authGuard, guestGuard } from './core/guards/auth.guard';

/**
 * Stage 6A routes — authentication foundation + marketplace discovery.
 * Stage 6B adds the customer job request (`/request-job` submission)
 * and My Jobs (`/my-jobs`) retrieval.
 * Stage 6C adds provider requests (`/requests`) and request detail with
 * quote submission (`/requests/:id`).
 * Stage 7A adds the business dashboard (`/business`) and the technician
 * roster (`/business/technicians`, `/business/technicians/:id`).
 * Stage 7B adds business-managed customers (`/business/customers`),
 * internal jobs (`/business/jobs`, `/business/jobs/new`,
 * `/business/jobs/:id`) and the business profile (`/business/profile`).
 * Stage 7C adds technician assignment (within `/business/jobs/:id`)
 * and technician My Jobs (`/technician/jobs`, `/technician/jobs/:id`).
 * Stage 8 adds the in-app notification inbox (`/notifications`).
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
    path: 'requests',
    loadComponent: () => import('./features/provider/requests').then((m) => m.ProviderRequestsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'requests/:id',
    loadComponent: () => import('./features/provider/request-detail').then((m) => m.RequestDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business',
    loadComponent: () =>
      import('./features/business/business-dashboard').then((m) => m.BusinessDashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/technicians',
    loadComponent: () =>
      import('./features/business/technician-list').then((m) => m.TechnicianListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/technicians/:id',
    loadComponent: () =>
      import('./features/business/technician-detail').then((m) => m.TechnicianDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/customers',
    loadComponent: () =>
      import('./features/business/business-customers').then((m) => m.BusinessCustomersComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/jobs',
    loadComponent: () =>
      import('./features/business/business-jobs-list').then((m) => m.BusinessJobsListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/jobs/new',
    loadComponent: () => import('./features/business/business-job-new').then((m) => m.BusinessJobNewComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/jobs/:id',
    loadComponent: () =>
      import('./features/business/business-job-detail').then((m) => m.BusinessJobDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'business/profile',
    loadComponent: () =>
      import('./features/business/business-profile').then((m) => m.BusinessProfileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'technician/jobs',
    loadComponent: () =>
      import('./features/technician/technician-jobs').then((m) => m.TechnicianJobsComponent),
    canActivate: [authGuard],
  },
  {
    path: 'technician/jobs/:id',
    loadComponent: () =>
      import('./features/technician/technician-job-detail').then((m) => m.TechnicianJobDetailComponent),
    canActivate: [authGuard],
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    canActivateChild: [adminGuard],
    loadComponent: () => import('./features/admin/admin-shell').then((m) => m.AdminShellComponent),
    children: [
      { path: '', loadComponent: () => import('./features/admin/admin-dashboard').then((m) => m.AdminDashboardComponent) },
      { path: 'users', data: { resource: 'users' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'users/:id', data: { resource: 'users' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'customers', data: { resource: 'customers' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'customers/:id', data: { resource: 'customers' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'professionals', data: { resource: 'professionals' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'professionals/:id', data: { resource: 'professionals' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'businesses', data: { resource: 'businesses' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'businesses/:id', data: { resource: 'businesses' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'technicians', data: { resource: 'technicians' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'technicians/:id', data: { resource: 'technicians' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'services', data: { resource: 'services' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'services/new', loadComponent: () => import('./features/admin/admin-service-editor').then((m) => m.AdminServiceEditor) },
      { path: 'services/:id/edit', loadComponent: () => import('./features/admin/admin-service-editor').then((m) => m.AdminServiceEditor) },
      { path: 'services/:id', data: { resource: 'services' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'jobs', data: { resource: 'jobs' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'jobs/:id', data: { resource: 'jobs' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'verification', data: { resource: 'verifications' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'verification/:id', data: { resource: 'verifications' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'certificates', data: { resource: 'certificates' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'certificates/:id', data: { resource: 'certificates' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'reviews', data: { resource: 'reviews' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'reviews/:id', data: { resource: 'reviews' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'reports', data: { resource: 'reports' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'reports/:id', data: { resource: 'reports' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'disputes', data: { resource: 'disputes' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'disputes/:id', data: { resource: 'disputes' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'audit-logs', data: { resource: 'audit-logs' }, loadComponent: () => import('./features/admin/admin-resource-page').then((m) => m.AdminResourcePage) },
      { path: 'audit-logs/:id', data: { resource: 'audit-logs' }, loadComponent: () => import('./features/admin/admin-detail-page').then((m) => m.AdminDetailPage) },
      { path: 'settings', loadComponent: () => import('./features/admin/admin-settings').then((m) => m.AdminSettingsComponent) },
      { path: '**', loadComponent: () => import('./features/admin/admin-not-found').then((m) => m.AdminNotFoundComponent) },
    ],
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
  {
    path: 'notifications',
    loadComponent: () =>
      import('./features/notifications/notifications').then((m) => m.NotificationsComponent),
    canActivate: [authGuard],
  },
  { path: '**', redirectTo: '' },
];
