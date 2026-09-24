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
    updateBusinessJob?: ReturnType<typeof vi.fn>;
    cancelBusinessJob?: ReturnType<typeof vi.fn>;
  }): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [BusinessJobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (): string => '5' } } } },
        {
          provide: BusinessService,
          useValue: { updateBusinessJob: vi.fn(), cancelBusinessJob: vi.fn(), ...api },
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

  it('shows no technician assignment or parts controls', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))) });
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('assign');
    expect(text).not.toContain('technician');
    expect(text).not.toContain('parts');
  });
});
