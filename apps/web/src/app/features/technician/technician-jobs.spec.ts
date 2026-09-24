import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechnicianJobsComponent } from './technician-jobs';
import { TechnicianService } from '../../core/services/technician.service';
import type { BusinessJob } from '../../core/models/business.model';

function makeJob(id: string): BusinessJob {
  return {
    id,
    reference: `FL-2026-000${id}00`,
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
      email: 'naledi.dlamini@example.co.za',
      phone: '+27825550111',
    },
    service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
    title: null,
    description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
    addressLine1: '12 Protea Street, Randburg',
    city: 'Johannesburg',
    province: 'Gauteng',
    postalCode: null,
    priority: 'HIGH',
    scheduledAt: null,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
  };
}

describe('TechnicianJobsComponent', () => {
  let fixture: ComponentFixture<TechnicianJobsComponent>;

  async function setup(listMyJobs: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TechnicianJobsComponent],
      providers: [provideRouter([]), { provide: TechnicianService, useValue: { listMyJobs } }],
    }).compileComponents();
    fixture = TestBed.createComponent(TechnicianJobsComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows assigned jobs with service, customer, address and status', async () => {
    await setup(
      vi.fn().mockReturnValue(of({ items: [makeJob('5')], total: 1, page: 1, pageSize: 20 })),
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('My jobs');
    expect(text).toContain('FL-2026-000500');
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('12 Protea Street, Randburg');
    expect(text).toContain('Requested');
  });

  it('shows the empty state when no jobs are assigned', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 })));
    expect((fixture.nativeElement.textContent as string)).toContain('No jobs assigned yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('filters by status without marketplace or business controls', async () => {
    const listMyJobs = vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 }));
    await setup(listMyJobs);
    const component = fixture.componentInstance as unknown as {
      statusFilter: { set(value: string): void };
      applyFilters(): void;
    };
    component.statusFilter.set('IN_PROGRESS');
    component.applyFilters();
    expect(listMyJobs).toHaveBeenCalledWith({ status: 'IN_PROGRESS', page: 1, pageSize: 20 });
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('marketplace');
    expect(text).not.toContain('request parts');
    expect(text).not.toContain('approv');
  });
});
