import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessCustomersComponent } from './business-customers';
import { BusinessService } from '../../core/services/business.service';
import type { BusinessCustomer } from '../../core/models/business.model';

const customer: BusinessCustomer = {
  id: '3',
  businessId: '1',
  firstName: 'Naledi',
  lastName: 'Dlamini',
  displayName: 'Naledi Dlamini',
  email: 'naledi.dlamini@example.co.za',
  phone: '+27825550111',
  preferredContact: null,
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

describe('BusinessCustomersComponent', () => {
  let fixture: ComponentFixture<BusinessCustomersComponent>;

  async function setup(api: {
    listBusinessCustomers: ReturnType<typeof vi.fn>;
    createBusinessCustomer?: ReturnType<typeof vi.fn>;
    updateBusinessCustomer?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessCustomersComponent],
      providers: [
        provideRouter([]),
        {
          provide: BusinessService,
          useValue: { createBusinessCustomer: vi.fn(), updateBusinessCustomer: vi.fn(), ...api },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessCustomersComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lists business customers with contact info', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [customer], total: 1, page: 1, pageSize: 50 })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('naledi.dlamini@example.co.za');
  });

  it('shows the empty state when there are no customers', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 50 })),
    });
    expect((fixture.nativeElement.textContent as string)).toContain('No customers yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(throwError(() => new Error('down'))),
    });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('creates a customer and appends it to the list', async () => {
    const createBusinessCustomer = vi.fn().mockReturnValue(of(customer));
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 50 })),
      createBusinessCustomer,
    });
    const component = fixture.componentInstance as unknown as {
      create(): void;
      createForm: { controls: Record<string, { setValue(value: string): void }> };
    };
    component.createForm.controls['firstName']?.setValue('Naledi');
    component.createForm.controls['lastName']?.setValue('Dlamini');
    component.create();
    expect(createBusinessCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ firstName: 'Naledi', lastName: 'Dlamini' }),
    );
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Naledi Dlamini');
  });
});
