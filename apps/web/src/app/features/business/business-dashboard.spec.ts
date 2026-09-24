import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessDashboardComponent } from './business-dashboard';
import { BusinessService } from '../../core/services/business.service';
import type { Business } from '../../core/models/business.model';

const business: Business = {
  id: '1',
  businessName: 'Ubuntu Plumbing Co.',
  slug: 'ubuntu-plumbing-co',
  description: 'Family-run plumbing team serving Joburg North.',
  logoReference: null,
  email: 'hello@ubuntuplumbing.example.co.za',
  phone: '+27115550101',
  addressLine1: null,
  city: 'Johannesburg',
  province: 'Gauteng',
  postalCode: null,
  verificationStatus: 'VERIFIED',
  ratingAvg: 4.6,
  ratingCount: 48,
  isActive: true,
  role: 'OWNER',
  technicianCount: 2,
  createdAt: '2026-08-20T09:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

describe('BusinessDashboardComponent', () => {
  let fixture: ComponentFixture<BusinessDashboardComponent>;

  async function setup(api: {
    getMyBusiness: ReturnType<typeof vi.fn>;
    updateBusiness?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessDashboardComponent],
      providers: [
        provideRouter([]),
        {
          provide: BusinessService,
          useValue: { updateBusiness: vi.fn(), ...api },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessDashboardComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the business name, role, verification and technician count', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of(business)) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ubuntu Plumbing Co.');
    expect(text).toContain('Owner');
    expect(text).toContain('Verified');
    expect(text).toContain('2 technicians');
    expect(text).toContain('Manage technicians');
  });

  it('shows the jobs placeholder without fake counts', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of(business)) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Coming soon');
    expect(text).toContain('arrive in a later stage');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('offers profile editing to owners and saves changes', async () => {
    const updateBusiness = vi.fn().mockReturnValue(of({ ...business, city: 'Pretoria' }));
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of(business)), updateBusiness });
    const component = fixture.componentInstance as unknown as {
      startEditing(): void;
      save(): void;
      form: { controls: Record<string, { setValue(value: string): void }> };
    };

    expect((fixture.nativeElement.textContent as string)).toContain('Edit profile');
    component.startEditing();
    fixture.detectChanges();
    component.form.controls['city']?.setValue('Pretoria');
    component.save();
    expect(updateBusiness).toHaveBeenCalledWith(
      expect.objectContaining({ businessName: 'Ubuntu Plumbing Co.', city: 'Pretoria' }),
    );
  });

  it('hides profile editing from managers', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of({ ...business, role: 'MANAGER' as const })) });
    expect((fixture.nativeElement.textContent as string)).not.toContain('Edit profile');
  });
});
