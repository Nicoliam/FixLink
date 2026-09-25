import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { LowerCasePipe } from '@angular/common';
import { map, Observable } from 'rxjs';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { getApiErrorMessage } from '../../core/models/api.model';
import { AdminApiService } from '../../core/services/admin-api.service';
import type { AdminBusiness, AdminCertificate, AdminCustomer, AdminDispute, AdminJob, AdminList, AdminListFilters, AdminListItem, AdminProfessional, AdminReport, AdminResource, AdminReview, AdminService, AdminTechnician, AdminUser, AdminAuditLog, AdminVerification } from '../../core/models/admin.model';
import type { UserRole } from '../../core/models/auth.model';

type AdminFilterKey =
  | 'search' | 'status' | 'role' | 'source' | 'type' | 'userId' | 'customerId' | 'professionalId' | 'businessId'
  | 'categoryId' | 'isActive' | 'from' | 'to' | 'actorId' | 'action' | 'entityType' | 'entityId' | 'rating' | 'minRating' | 'maxRating' | 'visibility';
type AdminFilterFieldType = 'text' | 'number' | 'date' | 'select';

interface AdminFilterField {
  key: AdminFilterKey;
  label: string;
  type: AdminFilterFieldType;
  options?: readonly { value: string; label: string }[];
}

const statusOptions = (values: readonly string[]): readonly { value: string; label: string }[] => values.map((value) => ({ value, label: value.replaceAll('_', ' ') }));

@Component({
  selector: 'app-admin-resource-page',
  imports: [LowerCasePipe, ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="admin-page">
      <header class="admin-page-header"><div><p class="admin-eyebrow">{{ eyebrow() }}</p><h1>{{ title() }}</h1><p>{{ subtitle() }}</p></div>@if (resource() === 'services') { <a class="admin-btn admin-btn-primary" routerLink="/admin/services/new">Add service</a> }</header>
      <section class="admin-card admin-filter-card" aria-label="Filters"><form [formGroup]="filters" (ngSubmit)="applyFilters()" class="admin-filters">@for (field of filterFields(); track field.key) { <label>{{ field.label }}@if (field.options) { <select [formControlName]="field.key"><option value="">All</option>@for (option of field.options; track option.value) { <option [value]="option.value">{{ option.label }}</option> }</select> } @else { <input [formControlName]="field.key" [type]="field.type" [placeholder]="field.type === 'number' ? 'Any' : 'Enter value'"> }</label> }<button class="admin-btn" type="submit">Apply</button><button class="admin-btn admin-btn-quiet" type="button" (click)="clearFilters()">Reset</button></form></section>
      @if (loading()) { <div class="admin-state" role="status">Loading {{ title() | lowercase }}…</div> }
      @else if (error()) { <div class="admin-state admin-state-error" role="alert"><h2>Could not load {{ title() | lowercase }}</h2><p>{{ error() }}</p><button class="admin-btn" type="button" (click)="load(1)">Try again</button></div> }
      @else if (displayItems().length === 0) { <div class="admin-state"><h2>No {{ title() | lowercase }} found</h2><p>Try changing the search or filters.</p></div> }
      @else { <div class="admin-table-wrap"><table class="admin-table"><caption class="fl-visually-hidden">{{ title() }}</caption><thead><tr><th scope="col">Record</th><th scope="col">Status</th><th scope="col">Context</th><th scope="col">Updated</th><th scope="col"><span class="fl-visually-hidden">Open</span></th></tr></thead><tbody>@for (item of displayItems(); track item.id) { <tr><th scope="row"><a [routerLink]="detailPath(item)">{{ primary(item) }}</a><small>{{ secondary(item) }}</small></th><td><span class="admin-badge" [class]="badgeClass(status(item))">{{ status(item) }}</span></td><td>{{ context(item) }}</td><td>{{ date(updatedAt(item)) }}</td><td><a class="admin-row-link" [routerLink]="detailPath(item)" [attr.aria-label]="'Open ' + primary(item)">Open</a></td></tr> }</tbody></table></div><div class="admin-pagination"><span>Showing {{ displayItems().length }} of {{ total() }} · Page {{ page() }}</span><button class="admin-btn" type="button" [disabled]="page() <= 1" (click)="load(page() - 1)">Previous</button><button class="admin-btn" type="button" [disabled]="!hasNext()" (click)="load(page() + 1)">Next</button></div> }
    </section>
  `,
})
export class AdminResourcePage implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  private requestSequence = 0;
  protected readonly resource = signal<AdminResource>('users');
  protected readonly items = signal<AdminListItem[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly pageSize = signal(20);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly filters = this.fb.nonNullable.group({
    search: [''], status: [''], role: [''], source: [''], type: [''], userId: [''], customerId: [''], professionalId: [''], businessId: [''], categoryId: [''], isActive: [''], from: [''], to: [''], actorId: [''], action: [''], entityType: [''], entityId: [''], rating: [''], minRating: [''], maxRating: [''], visibility: [''],
  });
  protected readonly displayItems = computed(() => {
    const visibility = this.filters.controls.visibility.value;
    if (this.resource() !== 'reviews' || !visibility) return this.items();
    const visible = visibility === 'VISIBLE';
    return this.items().filter((item): item is AdminReview => this.resource() === 'reviews' && 'isVisible' in item && item.isVisible === visible);
  });

  ngOnInit(): void { this.resource.set(this.route.snapshot.data['resource'] as AdminResource); const status = this.route.snapshot.queryParamMap.get('status'); if (status) this.filters.controls.status.setValue(status); this.load(1); }

  protected load(targetPage: number): void {
    const requestId = ++this.requestSequence;
    this.loading.set(true); this.error.set('');
    this.fetch(this.toFilters(targetPage)).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (list) => { if (requestId !== this.requestSequence) return; this.items.set(list.items); this.total.set(list.total); this.page.set(list.page); this.pageSize.set(list.pageSize); this.loading.set(false); }, error: (value: unknown) => { if (requestId !== this.requestSequence) return; this.error.set(getApiErrorMessage(value, `Could not load ${this.title().toLowerCase()}.`)); this.loading.set(false); } });
  }
  protected applyFilters(): void { this.load(1); }
  protected clearFilters(): void { this.filters.reset(); this.load(1); }
  protected hasNext(): boolean { return this.page() * this.pageSize() < this.total(); }
  protected title(): string { return ({ users: 'Users', customers: 'Customers', professionals: 'Professionals', businesses: 'Businesses', technicians: 'Technicians', services: 'Services', jobs: 'Jobs', verifications: 'Verification', certificates: 'Certificates', reviews: 'Reviews', reports: 'Reports', disputes: 'Disputes', 'audit-logs': 'Audit logs' } satisfies Record<AdminResource, string>)[this.resource()]; }
  protected eyebrow(): string { return 'Operations / ' + this.title(); }
  protected subtitle(): string { return `Review and manage FixLink ${this.title().toLowerCase()}.`; }
  protected filterFields(): readonly AdminFilterField[] {
    const search: AdminFilterField = { key: 'search', label: 'Search', type: 'text' };
    const text = (key: Exclude<AdminFilterKey, 'search' | 'status' | 'role' | 'source' | 'type' | 'isActive' | 'rating' | 'minRating' | 'maxRating' | 'visibility'>, label: string): AdminFilterField => ({ key, label, type: 'text' });
    const status = (label: string, values: readonly string[]): AdminFilterField => ({ key: 'status', label, type: 'select', options: statusOptions(values) });
    const numberField = (key: 'rating' | 'minRating' | 'maxRating', label: string): AdminFilterField => ({ key, label, type: 'number' });
    switch (this.resource()) {
      case 'users': return [search, status('Status', ['PENDING', 'ACTIVE', 'SUSPENDED', 'DELETED']), { key: 'role', label: 'Role', type: 'select', options: statusOptions(['CUSTOMER', 'PROFESSIONAL', 'BUSINESS_OWNER', 'BUSINESS_MANAGER', 'TECHNICIAN', 'ADMIN']) }];
      case 'professionals': return [search, status('Verification status', ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'])];
      case 'businesses': return [search, status('Verification status', ['UNVERIFIED', 'PENDING', 'VERIFIED', 'REJECTED'])];
      case 'technicians': return [search, { key: 'isActive', label: 'Active', type: 'select', options: [{ value: 'true', label: 'Active' }, { value: 'false', label: 'Inactive' }] }];
      case 'services': return [search, status('Service status', ['ACTIVE', 'INACTIVE']), text('categoryId', 'Category ID')];
      case 'jobs': return [search, status('Job status', ['REQUESTED', 'QUOTED', 'ACCEPTED', 'SCHEDULED', 'IN_PROGRESS', 'AWAITING_PARTS', 'COMPLETED', 'CONFIRMED', 'CLOSED', 'CANCELLED', 'DISPUTED']), { key: 'source', label: 'Source', type: 'select', options: [{ value: 'MARKETPLACE', label: 'Marketplace' }, { value: 'INTERNAL', label: 'Internal' }] }, text('customerId', 'Customer ID'), text('professionalId', 'Professional ID'), text('businessId', 'Business ID'), { key: 'from', label: 'Created from', type: 'date' }, { key: 'to', label: 'Created to', type: 'date' }];
      case 'verifications': return [search, { key: 'type', label: 'Type', type: 'select', options: statusOptions(['IDENTITY', 'CERTIFICATE', 'BUSINESS']) }, status('Status', ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']), text('userId', 'User ID')];
      case 'certificates': return [search, status('Status', ['PENDING', 'APPROVED', 'REJECTED', 'NEEDS_INFO']), text('professionalId', 'Professional ID'), text('businessId', 'Business ID')];
      case 'reviews': return [search, numberField('rating', 'Exact rating'), numberField('minRating', 'Minimum rating'), numberField('maxRating', 'Maximum rating'), { key: 'visibility', label: 'Visibility (page only)', type: 'select', options: [{ value: 'VISIBLE', label: 'Visible' }, { value: 'HIDDEN', label: 'Hidden' }] }];
      case 'reports': return [search, { key: 'type', label: 'Report type', type: 'select', options: statusOptions(['PROVIDER', 'REVIEW', 'JOB', 'USER', 'CONTENT']) }, status('Status', ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'])];
      case 'disputes': return [search, status('Status', ['OPEN', 'IN_REVIEW', 'RESOLVED', 'CLOSED'])];
      case 'audit-logs': return [search, text('actorId', 'Actor ID'), text('action', 'Action'), text('entityType', 'Entity type'), text('entityId', 'Entity ID'), { key: 'from', label: 'From', type: 'date' }, { key: 'to', label: 'To', type: 'date' }];
      case 'customers': return [search];
    }
  }
  protected primary(item: AdminListItem): string {
    switch (this.resource()) {
      case 'users': return this.isUser(item) ? item.email : '';
      case 'customers': return this.isCustomer(item) ? item.displayName : '';
      case 'professionals': return this.isProfessional(item) ? item.name : '';
      case 'businesses': return this.isBusiness(item) ? item.name : '';
      case 'technicians': return this.isTechnician(item) ? item.displayName : '';
      case 'services': return this.isService(item) ? item.name : '';
      case 'jobs': return this.isJob(item) ? item.reference : '';
      case 'verifications': return this.isVerification(item) ? item.userEmail : '';
      case 'certificates': return this.isCertificate(item) ? item.title : '';
      case 'reviews': return this.isReview(item) ? item.customerName : '';
      case 'reports': return this.isReport(item) ? item.reason : '';
      case 'disputes': return this.isDispute(item) ? item.reason : '';
      case 'audit-logs': return this.isAuditLog(item) ? item.action : '';
    }
  }
  protected secondary(item: AdminListItem): string {
    switch (this.resource()) {
      case 'users': return this.isUser(item) ? item.roles.join(', ') : '';
      case 'customers': return this.isCustomer(item) ? item.email ?? item.phone ?? '' : '';
      case 'professionals': return this.isProfessional(item) ? item.city ?? item.province ?? '' : '';
      case 'businesses': return this.isBusiness(item) ? item.city ?? item.province ?? '' : '';
      case 'technicians': return this.isTechnician(item) ? item.email ?? item.phone ?? '' : '';
      case 'services': return this.isService(item) ? item.categoryName : '';
      case 'jobs': return this.isJob(item) ? item.source : '';
      case 'verifications': return this.isVerification(item) ? item.type : '';
      case 'certificates': return this.isCertificate(item) ? item.issuingOrganisation ?? item.ownerType : '';
      case 'reviews': return this.isReview(item) ? `${item.rating}/5 · ${item.providerName ?? 'No provider'}` : '';
      case 'reports': return this.isReport(item) ? item.reportType : '';
      case 'disputes': return this.isDispute(item) ? `Job ${item.jobId}` : '';
      case 'audit-logs': return this.isAuditLog(item) ? item.entityType ?? 'Platform action' : '';
    }
  }
  protected context(item: AdminListItem): string {
    switch (this.resource()) {
      case 'users': return this.isUser(item) ? (item.emailVerifiedAt ? 'Email verified' : 'Email not verified') : '';
      case 'customers': return this.isCustomer(item) ? (item.businessId ? 'Business-managed customer' : 'Account customer') : '';
      case 'professionals': return this.isProfessional(item) ? `${item.ratingCount} reviews · ${item.certificateCount} certificates` : '';
      case 'businesses': return this.isBusiness(item) ? `${item.technicianCount} technicians · ${item.serviceCount} services` : '';
      case 'technicians': return this.isTechnician(item) ? `Business ${item.businessId}` : '';
      case 'services': return this.isService(item) ? item.description ?? 'No description' : '';
      case 'jobs': return this.isJob(item) ? item.description : '';
      case 'verifications': return this.isVerification(item) ? item.reviewNotes ?? `Request from user ${item.userId}` : '';
      case 'certificates': return this.isCertificate(item) ? item.reviewNotes ?? 'No review notes' : '';
      case 'reviews': return this.isReview(item) ? item.comment ?? 'No written comment' : '';
      case 'reports': return this.isReport(item) ? item.description ?? `Reason: ${item.reason}` : '';
      case 'disputes': return this.isDispute(item) ? item.description ?? `Reason: ${item.reason}` : '';
      case 'audit-logs': return this.isAuditLog(item) ? item.actorEmail ?? 'System action' : '';
    }
  }
  protected status(item: AdminListItem): string {
    switch (this.resource()) {
      case 'users': return this.isUser(item) ? item.status : '';
      case 'professionals': return this.isProfessional(item) ? (item.isActive ? 'ACTIVE' : 'INACTIVE') : '';
      case 'businesses': return this.isBusiness(item) ? (item.isActive ? 'ACTIVE' : 'INACTIVE') : '';
      case 'technicians': return this.isTechnician(item) ? (item.isActive ? 'ACTIVE' : 'INACTIVE') : '';
      case 'services': return this.isService(item) ? (item.isActive ? 'ACTIVE' : 'INACTIVE') : '';
      case 'jobs': return this.isJob(item) ? item.status : '';
      case 'verifications': return this.isVerification(item) ? item.status : '';
      case 'certificates': return this.isCertificate(item) ? item.verificationStatus : '';
      case 'reviews': return this.isReview(item) ? (item.isVisible ? 'VISIBLE' : 'HIDDEN') : '';
      case 'reports': return this.isReport(item) ? item.status : '';
      case 'disputes': return this.isDispute(item) ? item.status : '';
      case 'customers': return 'CUSTOMER';
      case 'audit-logs': return 'LOGGED';
    }
  }
  protected date(value: string | null | undefined): string { return value ? new Date(value).toLocaleDateString('en-ZA') : '—'; }
  protected updatedAt(item: AdminListItem): string { return 'updatedAt' in item ? item.updatedAt : item.createdAt; }
  protected detailPath(item: AdminListItem): string[] { return ['/admin', this.resource() === 'verifications' ? 'verification' : this.resource(), item.id]; }
  protected badgeClass(value: string): string { return value === 'ACTIVE' || value === 'VERIFIED' || value === 'APPROVED' || value === 'RESOLVED' || value === 'VISIBLE' ? 'admin-badge-success' : value === 'PENDING' || value === 'OPEN' || value === 'IN_REVIEW' || value === 'NEEDS_INFO' ? 'admin-badge-warning' : value === 'SUSPENDED' || value === 'REJECTED' || value === 'DISMISSED' || value === 'HIDDEN' ? 'admin-badge-danger' : 'admin-badge-neutral'; }

  private isUser(item: AdminListItem): item is AdminUser { return 'roles' in item; }
  private isCustomer(item: AdminListItem): item is AdminCustomer { return 'displayName' in item; }
  private isProfessional(item: AdminListItem): item is AdminProfessional { return 'experienceYears' in item; }
  private isBusiness(item: AdminListItem): item is AdminBusiness { return 'technicianCount' in item; }
  private isTechnician(item: AdminListItem): item is AdminTechnician { return 'businessId' in item && 'displayName' in item; }
  private isService(item: AdminListItem): item is AdminService { return 'categoryName' in item; }
  private isJob(item: AdminListItem): item is AdminJob { return 'reference' in item; }
  private isVerification(item: AdminListItem): item is AdminVerification { return 'userEmail' in item; }
  private isCertificate(item: AdminListItem): item is AdminCertificate { return 'ownerType' in item; }
  private isReview(item: AdminListItem): item is AdminReview { return 'isVisible' in item; }
  private isReport(item: AdminListItem): item is AdminReport { return 'reportType' in item; }
  private isDispute(item: AdminListItem): item is AdminDispute { return 'jobId' in item; }
  private isAuditLog(item: AdminListItem): item is AdminAuditLog { return 'action' in item && 'metadata' in item; }

  private toFilters(page: number): AdminListFilters {
    const value = this.filters.getRawValue();
    const filters: AdminListFilters = { search: value.search.trim() || undefined, page, pageSize: this.pageSize(), status: value.status || undefined, role: (value.role || undefined) as UserRole | undefined, source: (value.source || undefined) as AdminListFilters['source'], type: value.type || undefined, userId: value.userId.trim() || undefined, customerId: value.customerId.trim() || undefined, professionalId: value.professionalId.trim() || undefined, businessId: value.businessId.trim() || undefined, categoryId: value.categoryId.trim() || undefined, isActive: value.isActive === '' ? undefined : value.isActive === 'true', from: value.from || undefined, to: value.to || undefined, actorId: value.actorId.trim() || undefined, action: value.action.trim() || undefined, entityType: value.entityType.trim() || undefined, entityId: value.entityId.trim() || undefined, rating: value.rating ? Number(value.rating) : undefined, minRating: value.minRating ? Number(value.minRating) : undefined, maxRating: value.maxRating ? Number(value.maxRating) : undefined };
    return filters;
  }
  private fetch(filters: AdminListFilters): Observable<AdminList<AdminListItem>> {
    switch (this.resource()) { case 'users': return this.api.listUsers(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'customers': return this.api.listCustomers(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'professionals': return this.api.listProfessionals(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'businesses': return this.api.listBusinesses(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'technicians': return this.api.listTechnicians(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'services': return this.api.listServices(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'jobs': return this.api.listJobs(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'verifications': return this.api.listVerifications(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'certificates': return this.api.listCertificates(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'reviews': return this.api.listReviews(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'reports': return this.api.listReports(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'disputes': return this.api.listDisputes(filters).pipe(map((list) => list as AdminList<AdminListItem>)); case 'audit-logs': return this.api.listAuditLogs(filters).pipe(map((list) => list as AdminList<AdminListItem>)); }
  }
}
