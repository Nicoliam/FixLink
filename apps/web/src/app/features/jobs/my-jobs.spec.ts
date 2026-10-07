import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MyJobsComponent } from './my-jobs';
import { JobService } from '../../core/services/job.service';
import { AuthService } from '../../core/services/auth.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';
import type { Job } from '../../core/models/job.model';
import type { UserRole } from '../../core/models/auth.model';

const job: Job = {
  id: '7',
  reference: 'FL-2026-000007',
  source: 'MARKETPLACE',
  status: 'REQUESTED',
  customerId: '1',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu - ProPlumb' },
  service: {
    id: '1',
    name: 'Leak Repair & Pipe Fixes',
    slug: 'leak-repair',
    categoryId: '1',
    categoryName: 'Plumbing',
  },
  description: 'Kitchen mixer tap leaking.',
  location: 'Fourways, Johannesburg',
  city: null,
  province: null,
  preferredDate: '2026-10-05',
  scheduledAt: '2026-10-05T09:00:00',
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

describe('MyJobsComponent', () => {
  let fixture: ComponentFixture<MyJobsComponent>;

  async function setup(
    listJobs: ReturnType<typeof vi.fn>,
    options: { roles?: UserRole[] | null } = {},
  ): Promise<void> {
    const roles = options.roles === undefined ? ['CUSTOMER' as UserRole] : options.roles;
    await TestBed.configureTestingModule({
      imports: [MyJobsComponent],
      providers: [provideRouter([]), { provide: JobService, useValue: { listMyJobs: listJobs } }],
    }).compileComponents();
    if (roles) {
      TestBed.overrideProvider(AuthService, {
        useValue: { isAuthenticated: signal(true), currentUser: signal({ roles }) },
      });
    }
    fixture = TestBed.createComponent(MyJobsComponent);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return root().textContent as string;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('is protected by the auth guard', () => {
    const route = routes.find((r) => r.path === 'my-jobs');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
  });

  it('lists the customer jobs with provider and status', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [job], total: 1, page: 1, pageSize: 20 })));
    expect(text()).toContain('Leak Repair & Pipe Fixes');
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
    expect(text()).toContain('Requested');
  });

  it('shows scheduled and in-progress badges with the SAST slot', async () => {
    const scheduled: Job = { ...job, status: 'SCHEDULED', scheduledAt: '2026-10-05T08:00:00.000Z' };
    const active: Job = { ...job, id: '8', status: 'IN_PROGRESS', scheduledAt: '2026-10-05T08:00:00.000Z' };
    await setup(vi.fn().mockReturnValue(of({ items: [scheduled, active], total: 2, page: 1, pageSize: 20 })));
    expect(text()).toContain('Scheduled');
    expect(text()).toContain('In progress');
    expect(text()).toContain('Scheduled: 5 October 2026 at 10:00');
  });

  it('shows the empty state when no jobs exist', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 })));
    expect(text()).toContain('No job requests yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect(text()).toContain('Something went wrong');
  });

  it('launches the four-step request flow to a customer', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [job], total: 1, page: 1, pageSize: 20 })));
    expect(text()).toContain('Request a new job');
    expect(text()).toContain('Four transparent steps');
    const hrefs = Array.from(root().querySelectorAll<HTMLAnchorElement>('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs).toContain('/request-job');
    expect(hrefs).toContain('/marketplace');
  });

  // Step 14 — saved professionals are surfaced in the wizard's step 02 only.

  it('does not list saved professionals on this page', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [job], total: 1, page: 1, pageSize: 20 })));
    // This page tracks work. Choosing a professional — saved or not — happens
    // inside the wizard, so no bookmark copy belongs here.
    expect(text()).not.toContain('Or start with a professional you have saved');
    expect(root().querySelector('.fl-my-jobs-saved')).toBeNull();
    // The wizard launcher is still the single way in.
    expect(text()).toContain('Start a request');
  });

  it('does not offer the request flow to a non-customer', async () => {
    // POST /api/v1/jobs is CUSTOMER-only server-side, so another role must not
    // be offered a wizard that would 403 one tap later.
    await setup(vi.fn().mockReturnValue(of({ items: [job], total: 1, page: 1, pageSize: 20 })), {
      roles: ['PROFESSIONAL'],
    });
    expect(text()).not.toContain('Request a new job');
    expect(text()).not.toContain('Start a request');
  });

  it('does not offer the request flow when anonymous', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [job], total: 1, page: 1, pageSize: 20 })), {
      roles: null,
    });
    expect(text()).not.toContain('Request a new job');
  });
});
