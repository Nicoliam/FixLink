import { ComponentFixture, TestBed } from '@angular/core/testing';
import type { FormArray, FormGroup } from '@angular/forms';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MyAreasComponent } from './my-areas';
import { ProviderAreaService } from '../../core/services/provider-area.service';
import type { ProviderArea } from '../../core/models/provider-area.model';

const randburg: ProviderArea = {
  areaName: 'Randburg & surrounds',
  city: 'Johannesburg',
  province: 'Gauteng',
};

/**
 * Step 14 — the service-areas editor.
 *
 * The backend REPLACES the whole list on save, so these tests care about three
 * things above all: the list the provider sees is what was stored, an empty or
 * invalid list is refused rather than half-applied, and the page explains why an
 * empty profile receives no open requests at all.
 */
/**
 * Narrow test view of the component.
 *
 * `save` and `addArea` are protected, and the Angular template is what normally
 * calls them. Tests drive the same methods through this cast rather than
 * widening the component's public API for testing alone.
 */
type Testable = {
  save(): void;
  addArea(): void;
  removeArea(index: number): void;
  form: { get(name: string): unknown };
};

function driver(component: MyAreasComponent): Testable {
  return component as unknown as Testable;
}

/** The FormGroup at one index of the areas array. */
function rowGroup(component: MyAreasComponent, index: number): FormGroup {
  const form = component.form.get('areas') as FormArray<FormGroup>;
  return form.at(index);
}

describe('MyAreasComponent', () => {
  let fixture: ComponentFixture<MyAreasComponent>;
  let component: MyAreasComponent;
  let api: { list: ReturnType<typeof vi.fn>; replace: ReturnType<typeof vi.fn> };

  async function setup(options: { items?: ProviderArea[]; listError?: boolean; replaceError?: boolean } = {}): Promise<void> {
    api = {
      list: options.listError
        ? vi.fn().mockReturnValue(
            throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Areas down.' } } })),
          )
        : vi.fn().mockReturnValue(of({ items: options.items ?? [randburg] })),
      replace: options.replaceError
        ? vi.fn().mockReturnValue(
            throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'Bad areas.' } } })),
          )
        : vi.fn().mockReturnValue(of({ items: options.items ?? [randburg] })),
    };
    await TestBed.configureTestingModule({
      imports: [MyAreasComponent],
      providers: [provideRouter([]), { provide: ProviderAreaService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(MyAreasComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent as string;
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function rows(): HTMLElement[] {
    return Array.from(root().querySelectorAll('fieldset')) as HTMLElement[];
  }

  it('loads the saved areas into one row each', async () => {
    await setup({ items: [randburg, { areaName: 'Fourways', city: 'Johannesburg', province: null }] });
    expect(rows().length).toBe(2);
    expect(text()).toContain('Randburg & surrounds');
    expect(text()).toContain('Fourways');
  });

  it('renders a null city and province as empty inputs, not as "null"', async () => {
    await setup({ items: [{ areaName: 'Fourways', city: null, province: null }] });
    const inputs = root().querySelectorAll('input') as NodeListOf<HTMLInputElement>;
    expect(inputs.length).toBe(3);
    expect(inputs[1]?.value).toBe('');
    expect(inputs[2]?.value).toBe('');
  });

  it('explains that no areas means no new requests reach the professional', async () => {
    await setup();
    expect(text()).toContain('an empty list here means no new requests reach you');
  });

  it('shows a dedicated empty state rather than a bare form when there are none', async () => {
    await setup({ items: [] });
    expect(text()).toContain('No areas yet');
    expect(text()).toContain('you will not be alerted about open requests');
    expect(rows().length).toBe(0);
  });

  it('surfaces a load failure with a retry', async () => {
    await setup({ listError: true });
    expect(text()).toContain('Areas down.');
    expect(root().querySelector('button')?.textContent).toContain('Try again');
  });

  it('sends the whole list as one replace, never a per-row save', async () => {
    await setup({ items: [randburg] });
    rowGroup(component, 0).get('areaName')?.setValue('Fourways');
    driver(component).save();
    fixture.detectChanges();
    expect(api.replace).toHaveBeenCalledTimes(1);
    expect(api.replace).toHaveBeenCalledWith([
      { areaName: 'Fourways', city: 'Johannesburg', province: 'Gauteng' },
    ]);
  });

  it('hands the service what was typed, blank city included, and leaves trimming to it', async () => {
    await setup({ items: [{ areaName: 'Fourways', city: null, province: null }] });
    rowGroup(component, 0).get('areaName')?.setValue('  Randburg  ');
    driver(component).save();
    fixture.detectChanges();
    // The component does not second-guess the payload; ProviderAreaService
    // trims and converts blanks to null (see its own tests). Duplicating that
    // here is how the two would drift.
    expect(api.replace).toHaveBeenCalledWith([
      { areaName: '  Randburg  ', city: '', province: '' },
    ]);
  });

  it('adds and removes rows before saving', async () => {
    await setup({ items: [randburg] });
    driver(component).addArea();
    fixture.detectChanges();
    expect(rows().length).toBe(2);
    rowGroup(component, 1).get('areaName')?.setValue('Sandton');
    driver(component).removeArea(0);
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    driver(component).save();
    fixture.detectChanges();
    expect(api.replace).toHaveBeenCalledWith([
      { areaName: 'Sandton', city: '', province: '' },
    ]);
  });

  it('refuses to save an empty list, so a stray click cannot wipe coverage', async () => {
    await setup({ items: [randburg] });
    driver(component).removeArea(0);
    driver(component).save();
    fixture.detectChanges();
    expect(api.replace).not.toHaveBeenCalled();
    expect(text()).toContain('Add at least one area you service.');
  });

  it('refuses a whitespace-only area name, which `required` alone would accept', async () => {
    await setup({ items: [randburg] });
    rowGroup(component, 0).get('areaName')?.setValue('   ');
    driver(component).save();
    fixture.detectChanges();
    expect(api.replace).not.toHaveBeenCalled();
    expect(text()).toContain('Name the area you service');
  });

  it('refuses duplicate names, case-insensitively', async () => {
    await setup({ items: [randburg] });
    driver(component).addArea();
    rowGroup(component, 1).get('areaName')?.setValue('randburg & SURROUNDS');
    driver(component).save();
    fixture.detectChanges();
    expect(api.replace).not.toHaveBeenCalled();
    expect(text()).toContain('listed more than once');
  });

  it('stops adding rows at the cap and says so', async () => {
    await setup({ items: [] });
    for (let i = 0; i < 10; i += 1) driver(component).addArea();
    fixture.detectChanges();
    expect(rows().length).toBe(10);
    driver(component).addArea();
    fixture.detectChanges();
    expect(rows().length).toBe(10);
    expect(text()).toContain('maximum of 10 areas');
    const addButton = Array.from(root().querySelectorAll('button')).find((b) =>
      (b.textContent ?? '').includes('Add an area'),
    );
    expect(addButton?.disabled).toBe(true);
  });

  it('confirms a save and re-seeds the form from the stored response', async () => {
    await setup({ items: [randburg] });
    api.replace.mockReturnValue(of({ items: [{ ...randburg, areaName: '  Randburg  ' }] }));
    driver(component).save();
    fixture.detectChanges();
    expect(text()).toContain('Service areas saved');
    // What is on screen is what the backend stored, not what was typed.
    expect(rowGroup(component, 0).get('areaName')?.value).toBe('  Randburg  ');
  });

  it('surfaces a save failure without losing what was typed', async () => {
    await setup({ items: [randburg], replaceError: true });
    rowGroup(component, 0).get('areaName')?.setValue('Fourways');
    driver(component).save();
    fixture.detectChanges();
    expect(text()).toContain('Bad areas.');
    expect(rowGroup(component, 0).get('areaName')?.value).toBe('Fourways');
  });
});