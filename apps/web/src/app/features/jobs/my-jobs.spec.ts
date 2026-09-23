import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { MyJobsComponent } from './my-jobs';
import { JobService } from '../../core/services/job.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';
import type { Job } from '../../core/models/job.model';

const job: Job = {
  id: '7',
  reference: 'FL-2026-000007',
  source: 'MARKETPLACE',
  status: 'REQUESTED',
  customerId: '1',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
  service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
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

  async function setup(listJobs: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [MyJobsComponent],
      providers: [provideRouter([]), { provide: JobService, useValue: { listMyJobs: listJobs } }],
    }).compileComponents();
    fixture = TestBed.createComponent(MyJobsComponent);
    fixture.detectChanges();
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
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Requested');
  });

  it('shows the empty state when no jobs exist', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 })));
    expect((fixture.nativeElement.textContent as string)).toContain('No job requests yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });
});
