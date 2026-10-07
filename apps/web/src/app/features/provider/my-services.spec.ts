import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MyServicesComponent } from './my-services';
import { OfferingService } from '../../core/services/offering.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { Offering } from '../../core/models/offering.model';
import type { ServiceCategory } from '../../core/models/marketplace.model';

const category: ServiceCategory = {
  id: 'cat-1',
  name: 'Plumbing',
  slug: 'plumbing',
  description: 'Water and pipe work.',
};

const offering: Offering = {
  id: 'off-1',
  providerType: 'PROFESSIONAL',
  providerId: 'pro-1',
  categoryId: 'cat-1',
  categoryName: 'Plumbing',
  categorySlug: 'plumbing',
  name: 'Leak repair',
  description: 'Tracing and fixing leaks.',
  priceAmount: 850,
  currency: 'ZAR',
  isActive: true,
  createdAt: '2026-10-01T09:00:00.000Z',
  updatedAt: '2026-10-01T09:00:00.000Z',
};

describe('MyServicesComponent', () => {
  let fixture: ComponentFixture<MyServicesComponent>;

  async function setup(
    list$: unknown = of({ items: [offering], total: 1 }),
    create: unknown = vi.fn(),
  ): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MyServicesComponent],
      providers: [
        provideRouter([]),
        {
          provide: OfferingService,
          useValue: { list: vi.fn().mockReturnValue(list$), get: vi.fn(), create, update: vi.fn(), remove: vi.fn() },
        },
        { provide: MarketplaceService, useValue: { listCategories: vi.fn().mockReturnValue(of([category])) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyServicesComponent);
    fixture.detectChanges();
  }

  function text(): string {
    return fixture.nativeElement.textContent as string;
  }

  function instance(): {
    create(): void;
    creating(): boolean;
    createForm: { controls: Record<string, { setValue(value: string | number): void }> };
  } {
    return fixture.componentInstance as unknown as {
      create(): void;
      creating(): boolean;
      createForm: { controls: Record<string, { setValue(value: string | number): void }> };
    };
  }

  function fillCreateForm(): void {
    const component = instance();
    component.createForm.controls['name']?.setValue('  Burst pipe replacement  ');
    component.createForm.controls['categoryId']?.setValue('cat-1');
    component.createForm.controls['description']?.setValue('  Same-day emergency callout.  ');
    // A `type="number"` input yields a NUMBER via NumberValueAccessor.
    component.createForm.controls['priceAmount']?.setValue(1200);
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows a loading state and then renders the offerings', async () => {
    const list$ = new Subject<{ items: Offering[]; total: number }>();
    await setup(list$);
    expect(text()).toContain('Loading your services…');
    list$.next({ items: [offering], total: 1 });
    list$.complete();
    fixture.detectChanges();
    expect(text()).toContain('Leak repair');
    expect(text()).toContain('Plumbing');
    expect(text()).toContain('Tracing and fixing leaks.');
    expect(text()).toContain('from R850');
  });

  it('shows the empty state with guidance to add a first service', async () => {
    await setup(of({ items: [], total: 0 }));
    expect(text()).toContain('No services yet');
    expect(text()).toContain('Add your first service');
  });

  it('shows the error state with a retry when loading fails', async () => {
    await setup(throwError(() => new HttpErrorResponse({ status: 500 })));
    fixture.detectChanges();
    expect(text()).toContain('Something went wrong');
    expect(text()).toContain('Try again');
  });

  it('surfaces a forbidden-role error with its own heading', async () => {
    await setup(
      throwError(
        () =>
          new HttpErrorResponse({
            status: 403,
            error: { success: false, error: { code: 'FORBIDDEN_ROLE', message: 'Customers cannot manage services.' } },
          }),
      ),
    );
    fixture.detectChanges();
    expect(text()).toContain('Not available for your account');
    expect(text()).toContain('Customers cannot manage services.');
  });

  it('creates a service with trimmed values and appends it to the list', async () => {
    const create = vi.fn().mockReturnValue(of({ ...offering, id: 'off-2', name: 'Burst pipe replacement', priceAmount: 1200 }));
    await TestBed.configureTestingModule({
      imports: [MyServicesComponent],
      providers: [
        provideRouter([]),
        { provide: OfferingService, useValue: { list: vi.fn().mockReturnValue(of({ items: [offering], total: 1 })), get: vi.fn(), create, update: vi.fn(), remove: vi.fn() } },
        { provide: MarketplaceService, useValue: { listCategories: vi.fn().mockReturnValue(of([category])) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyServicesComponent);
    fixture.detectChanges();

    fillCreateForm();
    instance().create();

    expect(create).toHaveBeenCalledWith({
      categoryId: 'cat-1',
      name: 'Burst pipe replacement',
      description: 'Same-day emergency callout.',
      priceAmount: 1200,
    });
    fixture.detectChanges();
    expect(text()).toContain('Burst pipe replacement');
  });

  it('asks which provider to use when more than one is managed', async () => {
    await setup(
      of({
        items: [offering],
        total: 1,
        providers: [
          { providerType: 'PROFESSIONAL', providerId: '1' },
          { providerType: 'BUSINESS', providerId: '2' },
        ],
      }),
    );
    expect(text()).toContain('Add this service to');
    expect(text()).toContain('Your business');
    expect(text()).toContain('Your professional profile');
  });

  it('asks which provider to use even when no offerings exist yet', async () => {
    // Regression: the picker must come from the server-reported identities.
    // Deriving it from the listed offerings hid it for a brand-new account
    // managing two providers, which then failed create with an unfixable 422.
    await setup(
      of({
        items: [],
        total: 0,
        providers: [
          { providerType: 'PROFESSIONAL', providerId: '1' },
          { providerType: 'BUSINESS', providerId: '2' },
        ],
      }),
    );
    expect(text()).toContain('Add this service to');
  });

  it('sends providerType on create only when more than one provider is managed', async () => {
    const create = vi.fn().mockReturnValue(of(offering));
    await setup(
      of({
        items: [],
        total: 0,
        providers: [
          { providerType: 'PROFESSIONAL', providerId: '1' },
          { providerType: 'BUSINESS', providerId: '2' },
        ],
      }),
      create,
    );
    const component = instance();
    component.createForm.controls['providerType']?.setValue('BUSINESS');
    fillCreateForm();
    component.create();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ providerType: 'BUSINESS' }));
  });

  it('sends a numeric price when the control holds a number', async () => {
    // Regression: `type="number"` makes Angular's NumberValueAccessor store a
    // NUMBER. toAmount() used to call .trim() on it, which threw before the
    // request was built, leaving the button stuck on "Adding…".
    const create = vi.fn().mockReturnValue(of({ ...offering, id: 'off-9', name: 'Numeric Price' }));
    await setup(of({ items: [], total: 0, providers: [{ providerType: 'PROFESSIONAL', providerId: '1' }] }), create);
    const component = instance();
    component.createForm.controls['name']?.setValue('Numeric Price');
    component.createForm.controls['categoryId']?.setValue('cat-1');
    component.createForm.controls['priceAmount']?.setValue(850.5);
    component.create();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ priceAmount: 850.5 }));
  });

  it('never leaves the submit button stuck on Adding when the request fails', async () => {
    await setup(of({ items: [], total: 0, providers: [] }), vi.fn().mockReturnValue(
      throwError(() => new HttpErrorResponse({ status: 500 })),
    ));
    const component = instance();
    component.createForm.controls['name']?.setValue('Boom');
    component.createForm.controls['categoryId']?.setValue('cat-1');
    component.createForm.controls['priceAmount']?.setValue(100);
    expect(component.creating()).toBe(false);
  });

  it('surfaces the server message when a duplicate service is refused', async () => {
    await TestBed.configureTestingModule({
      imports: [MyServicesComponent],
      providers: [
        provideRouter([]),
        {
          provide: OfferingService,
          useValue: {
            list: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
            get: vi.fn(),
            create: vi.fn().mockReturnValue(
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 409,
                    error: { success: false, error: { code: 'CONFLICT', message: 'You already offer a service called "Leak repair".' } },
                  }),
              ),
            ),
            update: vi.fn(),
            remove: vi.fn(),
          },
        },
        { provide: MarketplaceService, useValue: { listCategories: vi.fn().mockReturnValue(of([category])) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyServicesComponent);
    fixture.detectChanges();

    fillCreateForm();
    instance().create();
    fixture.detectChanges();

    expect(text()).toContain('You already offer a service called "Leak repair".');
  });

  it('keeps the server message when removal is refused because of open work', async () => {
    const component = TestBed;
    await component.configureTestingModule({
      imports: [MyServicesComponent],
      providers: [
        provideRouter([]),
        {
          provide: OfferingService,
          useValue: {
            list: vi.fn().mockReturnValue(of({ items: [offering], total: 1 })),
            get: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
            remove: vi.fn().mockReturnValue(
              throwError(
                () =>
                  new HttpErrorResponse({
                    status: 409,
                    error: { success: false, error: { code: 'CONFLICT', message: 'This service is still attached to 2 open jobs.' } },
                  }),
              ),
            ),
          },
        },
        { provide: MarketplaceService, useValue: { listCategories: vi.fn().mockReturnValue(of([category])) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MyServicesComponent);
    fixture.detectChanges();

    const target = fixture.componentInstance as unknown as {
      askRemove(o: Offering): void;
      remove(o: Offering): void;
    };
    target.askRemove(offering);
    target.remove(offering);
    fixture.detectChanges();

    expect(text()).toContain('This service is still attached to 2 open jobs.');
  });
});