import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessJobDetailComponent } from './business-job-detail';
import { BusinessService } from '../../core/services/business.service';
import type { BusinessJobDetail } from '../../core/models/business.model';

function makeDetail(status: 'REQUESTED' | 'CANCELLED'): BusinessJobDetail {
  const base: BusinessJobDetail = {
    job: {
      id: '5',
      reference: 'FL-2026-000123',
      source: 'INTERNAL',
      status,
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
    },
    timeline: [
      {
        previousStatus: null,
        status: 'REQUESTED',
        reason: 'Internal job created by business',
        createdAt: '2026-09-21T09:00:00.000Z',
      },
    ],
  };
  if (status === 'CANCELLED') {
    base.timeline.push({
      previousStatus: 'REQUESTED',
      status: 'CANCELLED',
      reason: 'Internal job cancelled by business',
      createdAt: '2026-09-22T09:00:00.000Z',
    });
  }
  return base;
}

describe('BusinessJobDetailComponent', () => {
  let fixture: ComponentFixture<BusinessJobDetailComponent>;

  async function setup(api: {
    getBusinessJob: ReturnType<typeof vi.fn>;
    getJobAssignment?: ReturnType<typeof vi.fn>;
    listTechnicians?: ReturnType<typeof vi.fn>;
    updateBusinessJob?: ReturnType<typeof vi.fn>;
    cancelBusinessJob?: ReturnType<typeof vi.fn>;
    assignTechnician?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessJobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (): string => '5' } } } },
        {
          provide: BusinessService,
          useValue: {
            updateBusinessJob: vi.fn(),
            cancelBusinessJob: vi.fn(),
            assignTechnician: vi.fn(),
            getJobAssignment: vi.fn().mockReturnValue(of({ jobId: '5', assignment: null, history: [] })),
            listTechnicians: vi.fn().mockReturnValue(of({ items: [], total: 0 })),
            ...api,
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessJobDetailComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows customer, service, description, address, priority, schedule, status and timeline', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000123');
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('naledi.dlamini@example.co.za');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('12 Protea Street, Randburg');
    expect(text).toContain('High');
    expect(text).toContain('Not scheduled yet');
    expect(text).toContain('Requested');
    expect(text).toContain('INTERNAL');
    expect(text).toContain('Ubuntu Plumbing Co.');
    expect(text).toContain('Internal job created by business');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('offers cancellation for REQUESTED jobs and reloads afterwards', async () => {
    const detail = makeDetail('REQUESTED');
    const getBusinessJob = vi.fn().mockReturnValue(of(detail));
    const cancelBusinessJob = vi.fn().mockReturnValue(of({ ...detail.job, status: 'CANCELLED' }));
    await setup({ getBusinessJob, cancelBusinessJob });
    expect((fixture.nativeElement.textContent as string)).toContain('Cancel job');
    const component = fixture.componentInstance as unknown as { cancelJob(): void };
    component.cancelJob();
    expect(cancelBusinessJob).toHaveBeenCalledWith('5');
  });

  it('hides management controls once the job is cancelled', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('CANCELLED'))) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Cancelled');
    expect(text).not.toContain('Cancel job');
    expect(text).not.toContain('Edit job');
  });

  it('shows no parts controls', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))) });
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('parts');
  });

  it('shows the assignment state when no technician is assigned', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No technician assigned yet');
    expect(text).toContain('Assign technician');
  });

  it('shows the current technician and reassignment control', async () => {
    const assigned = {
      jobId: '5',
      assignment: {
        id: '1',
        jobId: '5',
        businessId: '1',
        technician: {
          id: '2',
          displayName: 'Bongani Zulu',
          email: 'bongani.zulu@example.co.za',
          phone: '+27825550333',
          isActive: true,
        },
        assignedBy: '9',
        assignedAt: '2026-09-22T09:00:00.000Z',
      },
      history: [],
    };
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))),
      getJobAssignment: vi.fn().mockReturnValue(of(assigned)),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Bongani Zulu');
    expect(text).toContain('bongani.zulu@example.co.za');
    expect(text).toContain('Reassign technician');
  });

  it('offers a technician selector and assigns on submit', async () => {
    const assignTechnician = vi.fn().mockReturnValue(
      of({
        id: '1',
        jobId: '5',
        businessId: '1',
        technician: { id: '2', displayName: 'Bongani Zulu', email: null, phone: null, isActive: true },
        assignedBy: '9',
        assignedAt: '2026-09-22T09:00:00.000Z',
      }),
    );
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))),
      listTechnicians: vi.fn().mockReturnValue(
        of({
          items: [
            {
              id: '2',
              businessId: '1',
              userId: '7',
              displayName: 'Bongani Zulu',
              email: null,
              phone: null,
              isActive: true,
              createdAt: '2026-09-20T09:00:00.000Z',
              updatedAt: '2026-09-20T09:00:00.000Z',
            },
          ],
          total: 1,
        }),
      ),
      assignTechnician,
    });
    const component = fixture.componentInstance as unknown as {
      assignForm: { controls: { technicianId: { setValue(value: string): void } } };
      assign(): void;
    };
    component.assignForm.controls.technicianId.setValue('2');
    component.assign();
    expect(assignTechnician).toHaveBeenCalledWith('5', { technicianId: '2' });
  });
});
