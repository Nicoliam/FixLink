import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessJobNewComponent } from './business-job-new';
import { BusinessService } from '../../core/services/business.service';
import { MarketplaceService } from '../../core/services/marketplace.service';
import type { BusinessCustomer, BusinessJob } from '../../core/models/business.model';

const customer: BusinessCustomer = {
  id: '3',
  businessId: '1',
  firstName: 'Naledi',
  lastName: 'Dlamini',
  displayName: 'Naledi Dlamini',
  email: null,
  phone: null,
  preferredContact: null,
  createdAt: '2026-09-20T09:00:00.000Z',
  updatedAt: '2026-09-20T09:00:00.000Z',
};

const created: BusinessJob = {
  id: '5',
  reference: 'FL-2026-000123',
  source: 'INTERNAL',
  status: 'REQUESTED',
  businessId: '1',
  business: { id: '1', businessName: 'Ubuntu Plumbing Co.' },
  customerId: '3',
  customer: {
    id: '3',
    firstName: 'Naledi',
    lastName: 'Dlamini',
    displayName: 'Naledi Dlamini',
    email: null,
    phone: null,
  },
  service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
  title: null,
  description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
  addressLine1: '12 Protea Street, Randburg',
  city: null,
  province: null,
  postalCode: null,
  priority: 'HIGH',
  scheduledAt: null,
  createdAt: '2026-09-21T09:00:00.000Z',
  updatedAt: '2026-09-21T09:00:00.000Z',
};

const serviceListing = {
  id: '1',
  categoryId: '1',
  categoryName: 'Plumbing',
  categorySlug: 'plumbing',
  name: 'Leak Repair & Pipe Fixes',
  slug: 'leak-repair',
  description: null,
};

describe('BusinessJobNewComponent', () => {
  let fixture: ComponentFixture<BusinessJobNewComponent>;

  async function setup(api: {
    listBusinessCustomers: ReturnType<typeof vi.fn>;
    createBusinessJob?: ReturnType<typeof vi.fn>;
    listServices?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessJobNewComponent],
      providers: [
        provideRouter([]),
        { provide: BusinessService, useValue: { createBusinessJob: vi.fn(), ...api } },
        {
          provide: MarketplaceService,
          useValue: { listServices: api.listServices ?? vi.fn().mockReturnValue(of([serviceListing])) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessJobNewComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function fillValidForm(): void {
    const component = fixture.componentInstance as unknown as {
      form: { controls: Record<string, { setValue(value: string): void }> };
    };
    component.form.controls['customerId']?.setValue('3');
    component.form.controls['serviceId']?.setValue('1');
    component.form.controls['description']?.setValue(
      'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
    );
    component.form.controls['address']?.setValue('12 Protea Street, Randburg');
    component.form.controls['priority']?.setValue('HIGH');
    fixture.detectChanges();
  }

  it('offers existing customers, services and job fields', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [customer], total: 1, page: 1, pageSize: 50 })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Description');
    expect(text).toContain('Priority');
  });

  it('prompts to create a customer first when none exist', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 50 })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No customers yet');
    expect(text).toContain('Manage customers');
  });

  it('shows the error state when loading fails', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(throwError(() => new Error('down'))),
    });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('creates the job and shows the reference with REQUESTED status', async () => {
    const createBusinessJob = vi.fn().mockReturnValue(of(created));
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [customer], total: 1, page: 1, pageSize: 50 })),
      createBusinessJob,
    });
    fillValidForm();
    const component = fixture.componentInstance as unknown as { save(): void };
    component.save();
    expect(createBusinessJob).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: '3', serviceId: '1', priority: 'HIGH' }),
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000123');
    expect(text).toContain('Requested');
  });

  it('shows no technician assignment controls', async () => {
    await setup({
      listBusinessCustomers: vi.fn().mockReturnValue(of({ items: [customer], total: 1, page: 1, pageSize: 50 })),
    });
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('assign');
    expect(text).not.toContain('technician');
    expect(text).not.toContain('parts');
  });
});
