import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RequestDetailComponent } from './request-detail';
import { JobService } from '../../core/services/job.service';
import type { Job, ProviderRequest, Quote } from '../../core/models/job.model';

const detail: ProviderRequest = {
  id: '3',
  reference: 'FL-2026-000003',
  source: 'MARKETPLACE',
  status: 'REQUESTED',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
  service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
  description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
  location: 'Fourways, Johannesburg',
  city: null,
  province: null,
  preferredDate: '2026-10-05',
  scheduledAt: '2026-10-05T09:00:00',
  createdAt: '2026-09-23T10:00:00.000Z',
  customer: { displayName: 'Thandi K.' },
  quotes: [],
};

const submittedQuote: Quote = {
  id: '11',
  jobId: '3',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
  total: 1250,
  currency: 'ZAR',
  message: 'Supply and install replacement kitchen mixer tap.',
  status: 'SUBMITTED',
  items: [],
  submittedAt: '2026-09-23T11:00:00.000Z',
  createdAt: '2026-09-23T11:00:00.000Z',
};

describe('RequestDetailComponent', () => {
  let fixture: ComponentFixture<RequestDetailComponent>;

  async function setup(id: string, api: Record<string, ReturnType<typeof vi.fn>>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [RequestDetailComponent],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RequestDetailComponent);
    fixture.detectChanges();
  }

  function apiWith(request: ProviderRequest): Record<string, ReturnType<typeof vi.fn>> {
    return {
      getProviderRequest: vi.fn().mockReturnValue(of(request)),
      createQuote: vi.fn().mockReturnValue(of(submittedQuote)),
    };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the request detail with customer context and quote form', async () => {
    await setup('3', apiWith(detail));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000003');
    expect(text).toContain('Thandi K.');
    expect(text).toContain('Fourways, Johannesburg');
    expect(text).toContain('Submit a quote');
  });

  it('blocks quote submission when the amount is missing', async () => {
    const api = apiWith(detail);
    await setup('3', api);
    const component = fixture.componentInstance as unknown as {
      onSubmit: () => void;
      submitError: () => string | null;
    };
    component.onSubmit();
    fixture.detectChanges();
    expect(api['createQuote']).not.toHaveBeenCalled();
    expect(component.submitError()).toContain('Please check the quote form');
  });

  it('submits the quote and shows the submitted state without duplicate risk', async () => {
    const api = apiWith(detail);
    await setup('3', api);
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (v: unknown) => void; getRawValue: () => unknown };
      onSubmit: () => void;
    };
    component.form.patchValue({ total: 1250, message: 'Supply and install replacement kitchen mixer tap.' });
    component.onSubmit();
    fixture.detectChanges();
    expect(api['createQuote']).toHaveBeenCalledWith(
      '3',
      expect.objectContaining({ total: 1250, currency: 'ZAR' }),
    );
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote submitted');
    expect(text).toContain('R1,250');
    expect(text).not.toContain('Submit quote');
  });

  it('shows the existing quote instead of the form for QUOTED jobs', async () => {
    await setup('3', apiWith({ ...detail, status: 'QUOTED', quotes: [submittedQuote] }));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote submitted');
    expect(text).toContain('Supply and install replacement kitchen mixer tap.');
    expect(text).not.toContain('Submit a quote');
  });

  it('shows the accepted state when the customer accepts the quote', async () => {
    const accepted: Quote = { ...submittedQuote, status: 'ACCEPTED' };
    await setup('3', apiWith({ ...detail, status: 'ACCEPTED', quotes: [accepted] }));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Accepted');
    expect(text).toContain('R1,250');
    expect(text).toContain('has accepted your quote');
    expect(text).toContain('Agreed amount: R1,250');
    expect(text).toContain('payment is arranged directly with the customer');
    expect(text).not.toContain('Submit a quote');
    expect(text).not.toContain('payment successful');
  });

  it('shows the not-found state for unknown requests', async () => {
    await setup(
      '9999',
      {
        getProviderRequest: vi
          .fn()
          .mockReturnValue(throwError(() => ({ error: { error: { code: 'NOT_FOUND', message: 'x' } } }))),
        createQuote: vi.fn(),
      },
    );
    expect((fixture.nativeElement.textContent as string)).toContain('Request not found');
  });

  it('surfaces server errors on quote submission', async () => {
    const api = apiWith(detail);
    api['createQuote'].mockReturnValue(
      throwError(() => ({ error: { error: { code: 'CONFLICT', message: 'A quote has already been submitted.' } } })),
    );
    await setup('3', api);
    const component = fixture.componentInstance as unknown as {
      form: { patchValue: (v: unknown) => void };
      onSubmit: () => void;
      submitError: () => string | null;
    };
    component.form.patchValue({ total: 900 });
    component.onSubmit();
    fixture.detectChanges();
    expect(component.submitError()).toContain('A quote has already been submitted.');
  });

  describe('Stage 6E — scheduling and start', () => {
    const accepted: Quote = { ...submittedQuote, status: 'ACCEPTED' };
    const acceptedDetail: ProviderRequest = { ...detail, status: 'ACCEPTED', quotes: [accepted] };
    const scheduledDetail: ProviderRequest = {
      ...acceptedDetail,
      status: 'SCHEDULED',
      scheduledAt: '2026-10-05T08:00:00.000Z',
    };
    const activeDetail: ProviderRequest = { ...scheduledDetail, status: 'IN_PROGRESS' };

    const scheduledJob: Job = {
      id: '3',
      reference: 'FL-2026-000003',
      source: 'MARKETPLACE',
      status: 'SCHEDULED',
      customerId: '1',
      provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
      service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      city: null,
      province: null,
      preferredDate: '2026-10-05',
      scheduledAt: '2026-10-05T08:00:00.000Z',
      createdAt: '2026-09-23T10:00:00.000Z',
      updatedAt: '2026-09-23T12:00:00.000Z',
      agreedAmount: 1250,
      currency: 'ZAR',
      quotes: [accepted],
    };

    function scheduleApi(request: ProviderRequest, schedule: ReturnType<typeof vi.fn>, start: ReturnType<typeof vi.fn>): Record<string, ReturnType<typeof vi.fn>> {
      return {
        getProviderRequest: vi.fn().mockReturnValue(of(request)),
        createQuote: vi.fn(),
        scheduleJob: schedule,
        startJob: start,
      };
    }

    function buttonWithText(text: string): HTMLButtonElement | null {
      const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)];
      return buttons.find((button) => button.textContent?.trim() === text) ?? null;
    }

    it('shows the schedule form only for ACCEPTED jobs with an accepted quote', async () => {
      await setup('3', scheduleApi(acceptedDetail, vi.fn(), vi.fn()));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Schedule job');
      expect(fixture.nativeElement.querySelector('#schedule-date')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('#schedule-time')).not.toBeNull();
      expect(buttonWithText('Schedule Job')).not.toBeNull();
      // No Start action before scheduling.
      expect(buttonWithText('Start Job')).toBeNull();
    });

    it('hides the schedule form for REQUESTED, QUOTED, SCHEDULED and IN_PROGRESS jobs', async () => {
      await setup('3', scheduleApi(detail, vi.fn(), vi.fn()));
      expect(buttonWithText('Schedule Job')).toBeNull();
      TestBed.resetTestingModule();
      await setup('3', scheduleApi({ ...detail, status: 'QUOTED', quotes: [submittedQuote] }, vi.fn(), vi.fn()));
      expect(buttonWithText('Schedule Job')).toBeNull();
      TestBed.resetTestingModule();
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), vi.fn()));
      expect(buttonWithText('Schedule Job')).toBeNull();
      TestBed.resetTestingModule();
      await setup('3', scheduleApi(activeDetail, vi.fn(), vi.fn()));
      expect(buttonWithText('Schedule Job')).toBeNull();
    });

    it('blocks scheduling when the date or time is missing', async () => {
      const schedule = vi.fn();
      await setup('3', scheduleApi(acceptedDetail, schedule, vi.fn()));
      const component = fixture.componentInstance as unknown as {
        onSchedule: () => void;
        scheduleError: () => string | null;
      };
      component.onSchedule();
      fixture.detectChanges();
      expect(schedule).not.toHaveBeenCalled();
      expect(component.scheduleError()).toContain('valid date and time');
    });

    it('schedules the job and shows the SAST slot with a Start action', async () => {
      const schedule = vi.fn().mockReturnValue(of(scheduledJob));
      await setup('3', scheduleApi(acceptedDetail, schedule, vi.fn()));
      const component = fixture.componentInstance as unknown as {
        scheduleForm: { patchValue: (v: unknown) => void };
        onSchedule: () => void;
      };
      component.scheduleForm.patchValue({ date: '2026-10-05', time: '10:00' });
      component.onSchedule();
      fixture.detectChanges();
      // The SAST wall time travels with its offset so the instant is exact.
      expect(schedule).toHaveBeenCalledWith('3', '2026-10-05T10:00:00+02:00');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Scheduled: 5 October 2026 at 10:00');
      expect(buttonWithText('Start Job')).not.toBeNull();
      expect(buttonWithText('Schedule Job')).toBeNull();
    });

    it('shows the scheduling state while the request is in flight', async () => {
      const pending = new Subject<Job>();
      const schedule = vi.fn().mockReturnValue(pending.asObservable());
      await setup('3', scheduleApi(acceptedDetail, schedule, vi.fn()));
      const component = fixture.componentInstance as unknown as {
        scheduleForm: { patchValue: (v: unknown) => void };
        onSchedule: () => void;
      };
      component.scheduleForm.patchValue({ date: '2026-10-05', time: '10:00' });
      component.onSchedule();
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Scheduling…');
      expect(buttonWithText('Scheduling…')?.disabled).toBe(true);
      pending.next(scheduledJob);
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Scheduled: 5 October 2026 at 10:00');
    });

    it('surfaces scheduling errors without losing the ACCEPTED state', async () => {
      const schedule = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'Scheduled time must be in the future.' } } })));
      await setup('3', scheduleApi(acceptedDetail, schedule, vi.fn()));
      const component = fixture.componentInstance as unknown as {
        scheduleForm: { patchValue: (v: unknown) => void };
        onSchedule: () => void;
      };
      component.scheduleForm.patchValue({ date: '2020-01-01', time: '10:00' });
      component.onSchedule();
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Scheduled time must be in the future.');
      // The job is still ACCEPTED with the schedule form intact.
      expect(text).toContain('Accepted');
      expect(buttonWithText('Schedule Job')).not.toBeNull();
    });

    it('shows the Start action only for SCHEDULED jobs', async () => {
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), vi.fn()));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Scheduled: 5 October 2026 at 10:00');
      expect(buttonWithText('Start Job')).not.toBeNull();
      TestBed.resetTestingModule();
      await setup('3', scheduleApi(acceptedDetail, vi.fn(), vi.fn()));
      expect(buttonWithText('Start Job')).toBeNull();
      TestBed.resetTestingModule();
      await setup('3', scheduleApi(activeDetail, vi.fn(), vi.fn()));
      expect(buttonWithText('Start Job')).toBeNull();
    });

    it('asks for confirmation before starting', async () => {
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), vi.fn()));
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Start this job?');
      expect(text).toContain('Starting the job will mark it as In Progress.');
      expect(buttonWithText('Cancel')).not.toBeNull();
    });

    it('starts the job and shows the active state', async () => {
      const started: Job = { ...scheduledJob, status: 'IN_PROGRESS' };
      const start = vi.fn().mockReturnValue(of(started));
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), start));
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      // Confirm step: the second Start Job button confirms.
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      expect(start).toHaveBeenCalledWith('3');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('In progress');
      expect(text).toContain('The job is active.');
      expect(buttonWithText('Start Job')).toBeNull();
    });

    it('shows the starting state while the request is in flight', async () => {
      const pending = new Subject<Job>();
      const start = vi.fn().mockReturnValue(pending.asObservable());
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), start));
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Starting…');
      expect(buttonWithText('Starting…')?.disabled).toBe(true);
      pending.next({ ...scheduledJob, status: 'IN_PROGRESS' });
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('The job is active.');
    });

    it('surfaces start errors without losing the SCHEDULED state', async () => {
      const start = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'This job cannot be started in its current state.' } } })));
      await setup('3', scheduleApi(scheduledDetail, vi.fn(), start));
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      buttonWithText('Start Job')?.click();
      fixture.detectChanges();
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('This job cannot be started in its current state.');
      expect(text).toContain('Scheduled: 5 October 2026 at 10:00');
    });
  });
});
