import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechnicianDetailComponent } from './technician-detail';
import { BusinessService } from '../../core/services/business.service';
import { AuthService } from '../../core/services/auth.service';
import type { AuthUser } from '../../core/models/auth.model';
import type { Technician } from '../../core/models/business.model';

const technician: Technician = {
  id: '1',
  businessId: '1',
  userId: '10',
  displayName: 'Bongani Zulu',
  email: 'bongani.zulu@example.co.za',
  phone: '+27825550109',
  isActive: true,
  createdAt: '2026-08-22T09:00:00.000Z',
  updatedAt: '2026-08-22T09:00:00.000Z',
};

function userWithRoles(roles: AuthUser['roles']): AuthUser {
  return {
    id: 'user-8',
    email: 'thabo.maseko@example.co.za',
    phone: null,
    status: 'ACTIVE',
    roles,
    createdAt: '2026-08-20T09:00:00.000Z',
    updatedAt: '2026-08-20T09:00:00.000Z',
  };
}

describe('TechnicianDetailComponent', () => {
  let fixture: ComponentFixture<TechnicianDetailComponent>;

  async function setup(options: {
    roles?: AuthUser['roles'];
    get?: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    const currentUser = signal<AuthUser | null>(userWithRoles(options.roles ?? ['BUSINESS_OWNER']));
    await TestBed.configureTestingModule({
      imports: [TechnicianDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '1' } } } },
        {
          provide: BusinessService,
          useValue: {
            getTechnician: options.get ?? vi.fn().mockReturnValue(of(technician)),
            updateTechnician: options.update ?? vi.fn(),
          },
        },
        { provide: AuthService, useValue: { currentUser } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TechnicianDetailComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the technician detail with contact information', async () => {
    await setup({});
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bongani Zulu');
    expect(text).toContain('Active technician');
    expect(text).toContain('bongani.zulu@example.co.za');
    expect(text).toContain('+27825550109');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ get: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('offers management actions to owners and deactivates on toggle', async () => {
    const update = vi.fn().mockReturnValue(of({ ...technician, isActive: false }));
    await setup({ update });
    expect((fixture.nativeElement.textContent as string)).toContain('Deactivate');
    const component = fixture.componentInstance as unknown as { toggleActive(): void };
    component.toggleActive();
    expect(update).toHaveBeenCalledWith('1', { isActive: false });
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Inactive technician');
  });

  it('hides management actions from technicians', async () => {
    await setup({ roles: ['TECHNICIAN'] });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bongani Zulu');
    expect(text).not.toContain('Deactivate');
    expect(text).not.toContain('Rename');
  });
});
