import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessProfileComponent } from './business-profile';
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

describe('BusinessProfileComponent', () => {
  let fixture: ComponentFixture<BusinessProfileComponent>;

  async function setup(api: {
    getMyBusiness: ReturnType<typeof vi.fn>;
    updateBusiness?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessProfileComponent],
      providers: [
        provideRouter([]),
        { provide: BusinessService, useValue: { updateBusiness: vi.fn(), ...api } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessProfileComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the business profile with role and verification', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of(business)) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Ubuntu Plumbing Co.');
    expect(text).toContain('Owner');
    expect(text).toContain('Verified');
    expect(text).toContain('Johannesburg');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('offers profile editing to owners and hides it from managers', async () => {
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of(business)) });
    expect((fixture.nativeElement.textContent as string)).toContain('Edit profile');
    TestBed.resetTestingModule();
    await setup({ getMyBusiness: vi.fn().mockReturnValue(of({ ...business, role: 'MANAGER' as const })) });
    expect((fixture.nativeElement.textContent as string)).not.toContain('Edit profile');
  });
});
