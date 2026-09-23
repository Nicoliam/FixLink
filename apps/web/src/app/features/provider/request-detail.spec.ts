import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RequestDetailComponent } from './request-detail';
import { JobService } from '../../core/services/job.service';
import type { Job, JobImage, JobTimeline, JobUpdate, ProviderRequest, Quote, TimelineEvent } from '../../core/models/job.model';

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

  function executionDefaults(request: ProviderRequest): Record<string, ReturnType<typeof vi.fn>> {
    return {
      listJobImages: vi.fn().mockReturnValue(of([])),
      listJobUpdates: vi.fn().mockReturnValue(of([])),
      getJobTimeline: vi.fn().mockReturnValue(of({ job: request, events: [] })),
      uploadJobImage: vi.fn(),
      createJobUpdate: vi.fn(),
      deleteJobImage: vi.fn(),
      completeJob: vi.fn(),
      fetchImageBlob: vi.fn().mockReturnValue(throwError(() => new Error('no blob'))),
    };
  }

  function apiWith(request: ProviderRequest): Record<string, ReturnType<typeof vi.fn>> {
    return {
      getProviderRequest: vi.fn().mockReturnValue(of(request)),
      createQuote: vi.fn().mockReturnValue(of(submittedQuote)),
      ...executionDefaults(request),
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
        ...executionDefaults(request),
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

  describe('Stage 6F — work documentation and completion', () => {
    const accepted: Quote = { ...submittedQuote, status: 'ACCEPTED' };
    const activeDetail: ProviderRequest = {
      ...detail,
      status: 'IN_PROGRESS',
      scheduledAt: '2026-10-05T08:00:00.000Z',
      quotes: [accepted],
    };
    const completedDetail: ProviderRequest = {
      ...activeDetail,
      status: 'COMPLETED',
      completedAt: '2026-10-06T08:00:00.000Z',
    };
    const closedDetail: ProviderRequest = {
      ...completedDetail,
      status: 'CLOSED',
      closedAt: '2026-10-06T09:00:00.000Z',
    };

    const beforeUpdate: JobUpdate = {
      id: 'u1',
      jobId: '3',
      authorId: '9',
      phase: 'BEFORE',
      note: 'Existing pipe is damaged near the kitchen sink.',
      createdAt: '2026-10-05T10:05:00.000Z',
    };
    const afterUpdate: JobUpdate = {
      id: 'u3',
      jobId: '3',
      authorId: '9',
      phase: 'AFTER',
      note: 'Replacement pipe installed and tested for leaks.',
      createdAt: '2026-10-06T08:00:00.000Z',
    };
    const beforeImage: JobImage = {
      id: 'img-1',
      jobId: '3',
      uploadedBy: '9',
      phase: 'BEFORE',
      originalFilename: 'before.png',
      mimeType: 'image/png',
      size: 1234,
      createdAt: '2026-10-05T10:06:00.000Z',
    };

    function executionApi(
      request: ProviderRequest,
      overrides: Record<string, unknown> = {},
    ): Record<string, ReturnType<typeof vi.fn>> {
      const api = apiWith(request);
      (api['listJobImages'] as ReturnType<typeof vi.fn>).mockReturnValue(
        of((overrides['images'] as JobImage[] | undefined) ?? []),
      );
      (api['listJobUpdates'] as ReturnType<typeof vi.fn>).mockReturnValue(
        of((overrides['updates'] as JobUpdate[] | undefined) ?? []),
      );
      (api['getJobTimeline'] as ReturnType<typeof vi.fn>).mockReturnValue(
        of({ job: request, events: (overrides['events'] as TimelineEvent[] | undefined) ?? [] } as unknown as JobTimeline),
      );
      for (const key of ['uploadJobImage', 'createJobUpdate', 'deleteJobImage', 'completeJob'] as const) {
        if (overrides[key] !== undefined) api[key] = overrides[key] as ReturnType<typeof vi.fn>;
      }
      return api;
    }

    function buttonWithText(text: string): HTMLButtonElement | null {
      const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)];
      return buttons.find((button) => button.textContent?.trim() === text) ?? null;
    }

    it('shows the Before/During/After sections for IN_PROGRESS jobs', async () => {
      await setup('3', executionApi(activeDetail, { updates: [beforeUpdate] }));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Job progress');
      expect(text).toContain('Before work');
      expect(text).toContain('During work');
      expect(text).toContain('After work');
      expect(text).toContain('Existing pipe is damaged near the kitchen sink.');
      expect(text).toContain('Add photos');
      expect(text).toContain('Add final photos');
      expect(text).toContain('Add completion note');
      expect(buttonWithText('Complete Job')).not.toBeNull();
    });

    it('uploads a photo for the selected phase', async () => {
      const uploaded: JobImage = { ...beforeImage, id: 'img-9' };
      const upload = vi.fn().mockReturnValue(of(uploaded));
      await setup('3', executionApi(activeDetail, { uploadJobImage: upload }));
      const input = fixture.nativeElement.querySelector('#before-photo') as HTMLInputElement;
      expect(input).not.toBeNull();
      const file = new File(['fake'], 'before.png', { type: 'image/png' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect(upload).toHaveBeenCalledWith('3', 'BEFORE', file);
    });

    it('shows the uploading state and surfaces upload errors', async () => {
      const pending = new Subject<JobImage>();
      const upload = vi.fn().mockReturnValue(pending.asObservable());
      await setup('3', executionApi(activeDetail, { uploadJobImage: upload }));
      const input = fixture.nativeElement.querySelector('#during-photo') as HTMLInputElement;
      const file = new File(['fake'], 'during.jpg', { type: 'image/jpeg' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Uploading photo…');
      pending.error({ error: { error: { code: 'VALIDATION_ERROR', message: 'Only JPEG, PNG or WebP images are allowed.' } } });
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Only JPEG, PNG or WebP images are allowed.');
    });

    it('validates progress notes before saving', async () => {
      const create = vi.fn();
      await setup('3', executionApi(activeDetail, { createJobUpdate: create }));
      const component = fixture.componentInstance as unknown as { saveNote: (phase: 'BEFORE' | 'DURING') => void };
      component.saveNote('DURING');
      fixture.detectChanges();
      expect(create).not.toHaveBeenCalled();
      expect((fixture.nativeElement.textContent as string)).toContain('2000 characters or fewer');
    });

    it('saves a progress update and shows it in the timeline section', async () => {
      const created: JobUpdate = { ...beforeUpdate, id: 'u9', phase: 'DURING', note: 'Removed damaged section.' };
      const create = vi.fn().mockReturnValue(of(created));
      await setup('3', executionApi(activeDetail, { createJobUpdate: create }));
      const component = fixture.componentInstance as unknown as {
        duringForm: { patchValue: (v: unknown) => void };
        saveNote: (phase: 'BEFORE' | 'DURING') => void;
      };
      component.duringForm.patchValue({ note: 'Removed damaged section.' });
      component.saveNote('DURING');
      fixture.detectChanges();
      expect(create).toHaveBeenCalledWith('3', 'DURING', 'Removed damaged section.');
      expect((fixture.nativeElement.textContent as string)).toContain('Removed damaged section.');
    });

    it('keeps Complete Job disabled until the completion note exists', async () => {
      await setup('3', executionApi(activeDetail));
      expect(buttonWithText('Complete Job')?.disabled).toBe(true);
      const component = fixture.componentInstance as unknown as {
        completionForm: { patchValue: (v: unknown) => void };
      };
      component.completionForm.patchValue({ note: 'Replacement pipe installed and tested for leaks.' });
      fixture.detectChanges();
      expect(buttonWithText('Complete Job')?.disabled).toBe(false);
    });

    it('completes the job with the completion note and shows the completed state', async () => {
      const completed: Job = {
        id: '3',
        reference: 'FL-2026-000003',
        source: 'MARKETPLACE',
        status: 'COMPLETED',
        customerId: '1',
        provider: activeDetail.provider,
        service: activeDetail.service,
        description: activeDetail.description,
        location: activeDetail.location,
        city: null,
        province: null,
        preferredDate: '2026-10-05',
        scheduledAt: '2026-10-05T08:00:00.000Z',
        createdAt: '2026-09-23T10:00:00.000Z',
        updatedAt: '2026-10-06T08:00:00.000Z',
        completedAt: '2026-10-06T08:00:00.000Z',
      };
      const complete = vi.fn().mockReturnValue(of({ job: completed, update: afterUpdate }));
      await setup('3', executionApi(activeDetail, { completeJob: complete }));
      const component = fixture.componentInstance as unknown as {
        completionForm: { patchValue: (v: unknown) => void };
      };
      component.completionForm.patchValue({ note: 'Replacement pipe installed and tested for leaks.' });
      fixture.detectChanges();
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Mark this job as complete?');
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      expect(complete).toHaveBeenCalledWith('3', 'Replacement pipe installed and tested for leaks.');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Completed');
      expect(text).toContain('Replacement pipe installed and tested for leaks.');
      expect(buttonWithText('Complete Job')).toBeNull();
    });

    it('shows the completing state while the request is in flight', async () => {
      const pending = new Subject<{ job: Job; update: JobUpdate }>();
      const complete = vi.fn().mockReturnValue(pending.asObservable());
      await setup('3', executionApi(activeDetail, { completeJob: complete }));
      const component = fixture.componentInstance as unknown as {
        completionForm: { patchValue: (v: unknown) => void };
      };
      component.completionForm.patchValue({ note: 'Replacement pipe installed and tested for leaks.' });
      fixture.detectChanges();
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      expect((fixture.nativeElement.textContent as string)).toContain('Completing…');
      expect(buttonWithText('Completing…')?.disabled).toBe(true);
      pending.next({ job: { ...activeDetail, status: 'COMPLETED' } as unknown as Job, update: afterUpdate });
      fixture.detectChanges();
    });

    it('surfaces completion errors without losing the IN_PROGRESS state', async () => {
      const complete = vi
        .fn()
        .mockReturnValue(throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'This job cannot be completed in its current state.' } } })));
      await setup('3', executionApi(activeDetail, { completeJob: complete }));
      const component = fixture.componentInstance as unknown as {
        completionForm: { patchValue: (v: unknown) => void };
      };
      component.completionForm.patchValue({ note: 'Replacement pipe installed.' });
      fixture.detectChanges();
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      buttonWithText('Complete Job')?.click();
      fixture.detectChanges();
      expect(complete).toHaveBeenCalledWith('3', 'Replacement pipe installed.');
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('This job cannot be completed in its current state.');
      expect(text).toContain('In progress');
    });

    it('shows the completed record with after photos and no customer confirm action', async () => {
      await setup('3', executionApi(completedDetail, { updates: [afterUpdate], images: [beforeImage] }));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Completed');
      expect(text).toContain('Replacement pipe installed and tested for leaks.');
      expect(buttonWithText('Complete Job')).toBeNull();
      expect(buttonWithText('Confirm Completion')).toBeNull();
      expect(buttonWithText('Not Yet')).toBeNull();
    });

    it('keeps closed jobs read-only', async () => {
      await setup('3', executionApi(closedDetail, { updates: [afterUpdate] }));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Closed');
      expect(text).toContain('read-only');
      expect(buttonWithText('Complete Job')).toBeNull();
      expect(fixture.nativeElement.querySelector('input[type="file"]')).toBeNull();
    });
  });
});
