import { ChangeDetectionStrategy, Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { getApiErrorMessage } from '../../core/models/api.model';
import { AdminApiService } from '../../core/services/admin-api.service';
import type { AdminService, AdminServiceCategory, ServiceMutation } from '../../core/models/admin.model';

@Component({
  selector: 'app-admin-service-editor',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="admin-page admin-page-narrow"><a class="admin-back" routerLink="/admin/services">← Back to services</a><header class="admin-page-header"><div><p class="admin-eyebrow">Services</p><h1>{{ editing() ? 'Edit service' : 'Add service' }}</h1><p>Keep marketplace service catalogue details accurate.</p></div></header>@if (error()) { <div class="admin-alert admin-alert-error" role="alert">{{ error() }}</div> }<section class="admin-card"><form [formGroup]="form" (ngSubmit)="submit()" class="admin-form"><label>Category<select formControlName="categoryId"><option value="">Select a category</option>@for (category of categories(); track category.id) { <option [value]="category.id">{{ category.name }}</option> }</select></label><label>Name<input formControlName="name" required maxlength="128"></label><label>Slug<input formControlName="slug" required maxlength="128"></label><label>Description<textarea formControlName="description" rows="4" maxlength="128"></textarea></label><label>Sort order<input formControlName="sortOrder" type="number" min="0" max="100000"></label><label class="admin-check"><input formControlName="isActive" type="checkbox"> Active</label>@if (form.invalid && form.touched) { <p class="admin-field-error">Complete the required fields and use a valid slug.</p> }<div class="admin-action-buttons"><button class="admin-btn admin-btn-primary" type="submit" [disabled]="saving()">{{ saving() ? 'Saving…' : 'Save service' }}</button><a class="admin-btn admin-btn-quiet" routerLink="/admin/services">Cancel</a></div></form></section></section>
  `,
})
export class AdminServiceEditor implements OnInit {
  private readonly api = inject(AdminApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly categories = signal<AdminServiceCategory[]>([]);
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly form = this.fb.nonNullable.group({ categoryId: ['', [Validators.required, Validators.pattern(/^[1-9][0-9]*$/)]], name: ['', [Validators.required, Validators.maxLength(128)]], slug: ['', [Validators.required, Validators.maxLength(128)]], description: ['', [Validators.maxLength(128)]], sortOrder: [0, [Validators.required, Validators.min(0), Validators.max(100000), Validators.pattern(/^\d+$/)]], isActive: [true] });

  ngOnInit(): void {
    this.editing.set(Boolean(this.route.snapshot.paramMap.get('id')));
    this.api.listServiceCategories().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (value) => this.categories.set(value), error: (value: unknown) => this.error.set(getApiErrorMessage(value, 'Could not load service categories.')) });
    if (this.editing()) this.load();
  }

  protected load(): void { const id = this.route.snapshot.paramMap.get('id') ?? ''; this.api.getService(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: (value) => this.form.reset({ categoryId: value.categoryId, name: value.name, slug: value.slug, description: value.description ?? '', sortOrder: value.sortOrder, isActive: value.isActive }), error: (value: unknown) => this.error.set(getApiErrorMessage(value, 'Could not load the service.')) }); }
  protected submit(): void { this.form.markAllAsTouched(); if (this.form.invalid || this.saving()) return; this.saving.set(true); this.error.set(''); const value = this.form.getRawValue(); const payload: ServiceMutation = { categoryId: value.categoryId, name: value.name.trim(), slug: value.slug.trim(), description: value.description.trim() || null, sortOrder: value.sortOrder, isActive: value.isActive }; const id = this.route.snapshot.paramMap.get('id'); const request = id ? this.api.updateService(id, payload) : this.api.createService(payload); request.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({ next: () => { this.saving.set(false); void this.router.navigate(['/admin/services']); }, error: (value: unknown) => { this.saving.set(false); this.error.set(getApiErrorMessage(value, 'Could not save the service.')); } }); }
}
