import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessJobsListComponent } from './business-jobs-list';
import { BusinessService } from '../../core/services/business.service';
import type { BusinessJob } from '../../core/models/business.model';

function makeJob(overrides: Partial<BusinessJob> = {}): BusinessJob {
  return {
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
    ...overrides,
  };
}

describe('BusinessJobsListComponent', () => {
  let fixture: ComponentFixture<BusinessJobsListComponent>;

  async function setup(listBusinessJobs: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessJobsListComponent],
      providers: [provideRouter([]), { provide: BusinessService, useValue: { listBusinessJobs } }],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessJobsListComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the loading state while jobs load', async () => {
    const { defer } = await import('rxjs');
    let resolve!: (value: { items: BusinessJob[]; total: number; page: number; pageSize: number }) => void;
    const pending = new Promise<{ items: BusinessJob[]; total: number; page: number; pageSize: number }>(
      (accept) => (resolve = accept),
    );
    // A deferred observable keeps the component in its loading state
    // until the promise resolves.
    await setup(vi.fn().mockReturnValue(defer(() => pending)));
    expect((fixture.nativeElement.textContent as string)).toContain('Loading jobs…');
    resolve({ items: [makeJob()], total: 1, page: 1, pageSize: 20 });
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('FL-2026-000123');
  });

  it('lists internal jobs with status, customer, service, date, priority and source', async () => {
    await setup(
      vi.fn().mockReturnValue(of({ items: [makeJob()], total: 1, page: 1, pageSize: 20 })),
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000123');
    expect(text).toContain('Requested');
    expect(text).toContain('INTERNAL');
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('High');
  });

  it('shows the empty state when there are no jobs', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 })));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No internal jobs yet');
    expect(text).toContain('Create internal job');
  });

  it('shows the error state when loading fails', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('shows no technician assignment controls', async () => {
    await setup(
      vi.fn().mockReturnValue(of({ items: [makeJob()], total: 1, page: 1, pageSize: 20 })),
    );
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('assign');
    expect(text).not.toContain('technician');
    expect(text).not.toContain('parts');
  });
});
