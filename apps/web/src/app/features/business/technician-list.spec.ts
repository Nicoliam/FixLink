import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechnicianListComponent } from './technician-list';
import { BusinessService } from '../../core/services/business.service';
import { AuthService } from '../../core/services/auth.service';
import type { AuthUser } from '../../core/models/auth.model';
import type { Technician } from '../../core/models/business.model';

const technicians: Technician[] = [
  {
    id: '1',
    businessId: '1',
    userId: '10',
    displayName: 'Bongani Zulu',
    email: 'bongani.zulu@example.co.za',
    phone: '+27825550109',
    isActive: true,
    createdAt: '2026-08-22T09:00:00.000Z',
    updatedAt: '2026-08-22T09:00:00.000Z',
  },
  {
    id: '2',
    businessId: '1',
    userId: '11',
    displayName: 'Karin Meyer',
    email: 'karin.meyer@example.co.za',
    phone: null,
    isActive: false,
    createdAt: '2026-08-23T09:00:00.000Z',
    updatedAt: '2026-08-23T09:00:00.000Z',
  },
];

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

describe('TechnicianListComponent', () => {
  let fixture: ComponentFixture<TechnicianListComponent>;

  async function setup(options: {
    roles?: AuthUser['roles'];
    list?: ReturnType<typeof vi.fn>;
    create?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    const currentUser = signal<AuthUser | null>(userWithRoles(options.roles ?? ['BUSINESS_OWNER']));
    await TestBed.configureTestingModule({
      imports: [TechnicianListComponent],
      providers: [
        provideRouter([]),
        {
          provide: BusinessService,
          useValue: {
            listTechnicians: options.list ?? vi.fn().mockReturnValue(of({ items: technicians, total: 2 })),
            createTechnician: options.create ?? vi.fn(),
          },
        },
        { provide: AuthService, useValue: { currentUser } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TechnicianListComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lists technicians with status and contact information', async () => {
    await setup({});
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bongani Zulu');
    expect(text).toContain('Karin Meyer');
    expect(text).toContain('Active');
    expect(text).toContain('Inactive');
    expect(text).toContain('bongani.zulu@example.co.za');
  });

  it('shows the empty state when the roster is empty', async () => {
    await setup({ list: vi.fn().mockReturnValue(of({ items: [], total: 0 })) });
    expect((fixture.nativeElement.textContent as string)).toContain('No technicians yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ list: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('offers the invite form to business managers', async () => {
    await setup({ roles: ['BUSINESS_MANAGER'] });
    expect((fixture.nativeElement.textContent as string)).toContain('Invite a technician');
  });

  it('hides the invite form from customers', async () => {
    await setup({ roles: ['CUSTOMER'] });
    expect((fixture.nativeElement.textContent as string)).not.toContain('Invite a technician');
  });

  it('invites a technician and appends them to the roster', async () => {
    const created: Technician = { ...technicians[0], id: '3', displayName: 'Sipho Dlamini' } as Technician;
    const create = vi.fn().mockReturnValue(of(created));
    await setup({ create });
    const component = fixture.componentInstance as unknown as {
      invite(): void;
      inviteForm: { controls: Record<string, { setValue(value: string): void }> };
    };
    component.inviteForm.controls['displayName']?.setValue('Sipho Dlamini');
    component.inviteForm.controls['email']?.setValue('sipho.dlamini@example.co.za');
    component.inviteForm.controls['password']?.setValue('TechPass123!');
    component.invite();
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Sipho Dlamini', email: 'sipho.dlamini@example.co.za' }),
    );
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Sipho Dlamini');
  });
});
