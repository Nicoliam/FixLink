import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ProviderAreaService } from '../../core/services/provider-area.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import {
  AREA_CITY_MAX,
  AREA_NAME_MAX,
  AREA_PROVINCE_MAX,
  MAX_PROVIDER_AREAS,
} from '../../core/models/provider-area.model';
import type { ProviderAreaDraft } from '../../core/models/provider-area.model';

type AreasStatus = 'loading' | 'ready' | 'error';

/**
 * Fixlynk "My service areas" — Step 14 (`/my-areas`, authenticated
 * PROFESSIONAL / BUSINESS_OWNER / BUSINESS_MANAGER).
 *
 * The areas a provider works in, and the second half of open-request matching.
 * The backend requires BOTH a matching service category and a matching area,
 * so a provider with no areas here is offered no open requests — which makes
 * this page a prerequisite for that feature rather than a profile extra. The
 * copy says so, because "why am I seeing no work?" has no visible cause
 * otherwise.
 *
 * ONE FORM, ONE SAVE. The endpoint replaces the caller's whole list in a single
 * request, so this page deliberately has no per-row save: there is no state in
 * which some of the provider's areas are new and some are old. That is the
 * point of replace semantics, and a per-row save would quietly reintroduce the
 * half-applied state the design removes.
 */
@Component({
  selector: 'app-my-areas',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-areas.html',
  styleUrl: './my-areas.scss',
})
export class MyAreasComponent implements OnInit {
  private readonly api = inject(ProviderAreaService);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<AreasStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly saveError = signal<string | null>(null);
  protected readonly saved = signal(false);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);

  protected readonly maxAreas = MAX_PROVIDER_AREAS;
  protected readonly nameMax = AREA_NAME_MAX;
  protected readonly cityMax = AREA_CITY_MAX;
  protected readonly provinceMax = AREA_PROVINCE_MAX;

  readonly form = this.fb.group({ areas: this.fb.array<FormGroup>([]) });

  protected get areas(): FormArray<FormGroup> {
    return this.form.get('areas') as FormArray<FormGroup>;
  }

  /** A provider with no areas sees the reason, not a bare empty form. */
  protected readonly isEmpty = computed(() => this.status() === 'ready' && this.areas.length === 0);

  /**
   * NOT computeds, and that is deliberate.
   *
   * FormArray contents are not signals, so a `computed` reading `areas.length`
   * or a control's `.value` would be evaluated once and never again — the button
   * would stop updating the moment a row was added. These are plain methods
   * read from the template, which re-evaluates on every change detection.
   */
  protected canAdd(): boolean {
    return this.areas.length < MAX_PROVIDER_AREAS;
  }

  protected atCap(): boolean {
    return this.areas.length >= MAX_PROVIDER_AREAS;
  }

  /**
   * Duplicate names would widen nothing and make the profile look padded, so
   * they are refused here too — the backend answers 422 for the same reason and
   * this keeps the answer instant.
   */
  /**
   * The normalised name of one row, for the duplicate check and the remove
   * button's accessible label. A method rather than template-side `String(...)`
   * because templates cannot assume globals (AGENTS.md: templates assume no
   * globals like `String` or `Date`).
   */
  protected nameOf(group: FormGroup): string {
    return String(group.get('areaName')?.value ?? '').trim();
  }

  protected duplicateNames(): ReadonlySet<string> {
    const seen = new Set<string>();
    const duplicates = new Set<string>();
    for (const control of this.areas.controls) {
      const name = String(control.get('areaName')?.value ?? '').trim().toLowerCase();
      if (name === '') continue;
      if (seen.has(name)) duplicates.add(name);
      seen.add(name);
    }
    return duplicates;
  }

  private areaGroup(value: Partial<ProviderAreaDraft> = {}): FormGroup {
    return this.fb.group({
      // `required` alone accepts "   ", because Angular only checks the length.
      // `pattern` is what actually rejects a whitespace-only name, so a stray
      // space cannot become an area that matches nothing.
      areaName: [
        value.areaName ?? '',
        [Validators.required, Validators.pattern(/\S/), Validators.maxLength(AREA_NAME_MAX)],
      ],
      city: [value.city ?? '', Validators.maxLength(AREA_CITY_MAX)],
      province: [value.province ?? '', Validators.maxLength(AREA_PROVINCE_MAX)],
    });
  }

  ngOnInit(): void {
    this.api
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          for (const draft of ProviderAreaService.toDrafts(list.items)) {
            this.areas.push(this.areaGroup(draft));
          }
          this.status.set('ready');
        },
        error: (error: unknown) => {
          this.errorMessage.set(
            getApiErrorMessage(error, 'Could not load your service areas. Please try again.'),
          );
          this.status.set('error');
        },
      });
  }

  protected addArea(): void {
    if (!this.canAdd()) return;
    this.saved.set(false);
    this.areas.push(this.areaGroup());
  }

  protected removeArea(index: number): void {
    this.saved.set(false);
    this.areas.removeAt(index);
  }

  protected reload(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.ngOnInit();
  }

  protected areaInvalid(group: FormGroup, control: 'areaName' | 'city' | 'province'): boolean {
    const field = group.get(control);
    return !!field && field.invalid && (field.touched || this.submitted());
  }

  protected save(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    this.saveError.set(null);
    this.saved.set(false);
    if (this.areas.length === 0) {
      this.saveError.set('Add at least one area you service.');
      return;
    }
    if (this.areas.invalid || this.duplicateNames().size > 0) {
      this.saveError.set('Please fix the highlighted areas.');
      return;
    }
    const value = this.form.getRawValue();
    const areas = (value['areas'] ?? []) as ProviderAreaDraft[];
    this.saving.set(true);
    this.api
      .replace(areas)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (list) => {
          this.saving.set(false);
          this.submitted.set(false);
          // Re-seed from the server response so the form shows exactly what was
          // stored — including a trimmed name the backend accepted.
          this.areas.clear();
          for (const draft of ProviderAreaService.toDrafts(list.items)) {
            this.areas.push(this.areaGroup(draft));
          }
          this.saved.set(true);
        },
        error: (error: unknown) => {
          this.saving.set(false);
          this.saveError.set(getApiErrorMessage(error, 'Could not save your service areas. Please try again.'));
        },
      });
  }
}