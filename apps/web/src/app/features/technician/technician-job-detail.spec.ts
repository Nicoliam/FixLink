import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechnicianJobDetailComponent } from './technician-job-detail';
import { TechnicianService } from '../../core/services/technician.service';
import type { BusinessJobDetail } from '../../core/models/business.model';

function makeDetail(): BusinessJobDetail {
  return {
    job: {
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
}

describe('TechnicianJobDetailComponent', () => {
  let fixture: ComponentFixture<TechnicianJobDetailComponent>;

  async function setup(getMyJob: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TechnicianJobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (): string => '5' } } } },
        { provide: TechnicianService, useValue: { getMyJob } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TechnicianJobDetailComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows service, customer, contact, address, priority, schedule, status and timeline', async () => {
    await setup(vi.fn().mockReturnValue(of(makeDetail())));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000123');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('naledi.dlamini@example.co.za');
    expect(text).toContain('+27825550111');
    expect(text).toContain('12 Protea Street, Randburg');
    expect(text).toContain('High');
    expect(text).toContain('Not scheduled yet');
    expect(text).toContain('Requested');
    expect(text).toContain('Ubuntu Plumbing Co.');
    expect(text).toContain('Internal job created by business');
  });

  it('shows the error state for unauthorized or missing jobs', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('forbidden'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('exposes no assignment, parts or management controls', async () => {
    await setup(vi.fn().mockReturnValue(of(makeDetail())));
    const text = (fixture.nativeElement.textContent as string).toLowerCase();
    expect(text).not.toContain('assign technician');
    expect(text).not.toContain('reassign');
    expect(text).not.toContain('parts');
    expect(text).not.toContain('cancel job');
  });
});
