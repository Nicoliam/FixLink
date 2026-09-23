import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { JobDetailComponent } from './job-detail';
import { JobService } from '../../core/services/job.service';
import type { Job } from '../../core/models/job.model';

const job: Job = {
  id: '7',
  reference: 'FL-2026-000007',
  source: 'MARKETPLACE',
  status: 'REQUESTED',
  customerId: '1',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
  service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
  description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
  location: 'Fourways, Johannesburg',
  city: null,
  province: null,
  preferredDate: '2026-10-05',
  scheduledAt: '2026-10-05T09:00:00',
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

describe('JobDetailComponent', () => {
  let fixture: ComponentFixture<JobDetailComponent>;

  async function setup(id: string, getJob: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [JobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: { getJob } },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(JobDetailComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the request detail with provider, service and status', async () => {
    await setup('7', vi.fn().mockReturnValue(of(job)));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000007');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Requested');
    expect(text).toContain('Fourways, Johannesburg');
  });

  it('shows a received quote without an accept action', async () => {
    await setup(
      '7',
      vi.fn().mockReturnValue(
        of({
          ...job,
          status: 'QUOTED',
          quotes: [
            {
              id: '11',
              jobId: '7',
              provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
              total: 1250,
              currency: 'ZAR',
              message: 'Supply and install replacement kitchen mixer tap.',
              status: 'SUBMITTED',
              items: [
                { id: '1', description: 'Labour', quantity: 1, unitPrice: 950, total: 950, sortOrder: 0 },
              ],
              submittedAt: '2026-09-23T11:00:00.000Z',
              createdAt: '2026-09-23T11:00:00.000Z',
            },
          ],
        }),
      ),
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote received');
    expect(text).toContain('R1,250');
    expect(text).toContain('Supply and install replacement kitchen mixer tap.');
    expect(text).toContain('Labour');
    expect(text).not.toContain('Accept');
  });

  it('shows the not-found state for unknown jobs', async () => {
    await setup(
      '9999',
      vi.fn().mockReturnValue(throwError(() => ({ error: { error: { code: 'NOT_FOUND', message: 'x' } } }))),
    );
    expect((fixture.nativeElement.textContent as string)).toContain('Job not found');
  });

  it('shows the error state when loading fails', async () => {
    await setup('7', vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });
});
