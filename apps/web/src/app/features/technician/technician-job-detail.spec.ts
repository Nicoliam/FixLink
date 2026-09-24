import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { TechnicianJobDetailComponent } from './technician-job-detail';
import { TechnicianService } from '../../core/services/technician.service';
import type { BusinessJobDetail } from '../../core/models/business.model';

function makeDetail(): BusinessJobDetail {
  return makeDetailWithStatus('REQUESTED');
}

function makeDetailWithStatus(
  status: 'REQUESTED' | 'SCHEDULED' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'COMPLETED',
): BusinessJobDetail {
  return {
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
}

describe('TechnicianJobDetailComponent', () => {
  let fixture: ComponentFixture<TechnicianJobDetailComponent>;

  /** Full Stage 7D + 7E mock: every TechnicianService method the workspace touches. */
  function makeApi(overrides: Record<string, ReturnType<typeof vi.fn>> = {}): Record<string, ReturnType<typeof vi.fn>> {
    return {
      getMyJob: vi.fn().mockReturnValue(of(makeDetail())),
      startMyJob: vi.fn(),
      uploadMyJobImage: vi.fn(),
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      fetchMyJobImageBlob: vi.fn().mockReturnValue(of(new Blob())),
      deleteMyJobImage: vi.fn(),
      createMyJobUpdate: vi.fn(),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      uploadMyJobVoiceNote: vi.fn(),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      fetchMyJobVoiceNoteBlob: vi.fn().mockReturnValue(of(new Blob())),
      getMyJobExecutionTimeline: vi.fn(),
      completeMyJob: vi.fn(),
      createMyJobPartsRequest: vi.fn(),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([])),
      getMyJobPartsRequest: vi.fn(),
      fetchMyJobPartsPhotoBlob: vi.fn().mockReturnValue(of(new Blob())),
      respondToMyJobPartsRequest: vi.fn(),
      resumeMyJob: vi.fn(),
      ...overrides,
    };
  }

  async function setup(getMyJob: ReturnType<typeof vi.fn>, extra: Record<string, ReturnType<typeof vi.fn>> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TechnicianJobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: (): string => '5' } } } },
        { provide: TechnicianService, useValue: makeApi({ getMyJob, ...extra }) },
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

  it('offers Start Work for REQUESTED jobs and starts on confirm', async () => {
    const detail = makeDetailWithStatus('REQUESTED');
    const started = { ...detail.job, status: 'IN_PROGRESS' as const };
    const startMyJob = vi.fn().mockReturnValue(of(started));
    await setup(vi.fn().mockReturnValue(of(detail)), {
      startMyJob,
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: started, events: [] })),
    });
    const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>)].map(
      (button) => button.textContent?.trim(),
    );
    expect(buttons).toContain('Start Work');
    const component = fixture.componentInstance as unknown as {
      startStart: () => void;
      confirmStart: () => void;
    };
    component.startStart();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Start work on this job now?');
    component.confirmStart();
    expect(startMyJob).toHaveBeenCalledWith('5');
  });

  it('shows the BEFORE/DURING/AFTER workspace for IN_PROGRESS jobs', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(
        of([{ id: '9', jobId: '5', uploadedBy: '2', phase: 'BEFORE', originalFilename: 'b.png', mimeType: 'image/png', size: 12, createdAt: '2026-09-21T10:00:00.000Z' }]),
      ),
      listMyJobUpdates: vi.fn().mockReturnValue(
        of([{ id: '3', jobId: '5', authorId: '2', phase: 'DURING', note: 'Valve removed.', createdAt: '2026-09-21T11:00:00.000Z' }]),
      ),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(
        of([{ id: '4', jobId: '5', authorId: '2', originalFilename: 'n.webm', mimeType: 'audio/webm', size: 44, durationSeconds: 12, createdAt: '2026-09-21T11:30:00.000Z' }]),
      ),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(
        of({
          job: detail.job,
          events: [
            { kind: 'status', createdAt: '2026-09-21T09:00:00.000Z', actor: 'business', status: 'REQUESTED', previousStatus: null, reason: 'Internal job created by business' },
            { kind: 'voice', createdAt: '2026-09-21T11:30:00.000Z', actor: 'technician', voiceNoteId: '4', mimeType: 'audio/webm', durationSeconds: 12 },
          ],
        }),
      ),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Execution workspace');
    expect(text).toContain('Before work');
    expect(text).toContain('During work');
    expect(text).toContain('After work');
    expect(text).toContain('Valve removed.');
    expect(text).toContain('Voice note');
    expect(text).toContain('Complete Job');
    expect(text).toContain('Execution timeline');
  });

  it('saves a DURING note through the service', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    const createMyJobUpdate = vi.fn().mockReturnValue(
      of({ id: '7', jobId: '5', authorId: '2', phase: 'DURING', note: 'Fitting the replacement.', createdAt: '2026-09-21T12:00:00.000Z' }),
    );
    await setup(vi.fn().mockReturnValue(of(detail)), {
      createMyJobUpdate,
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const component = fixture.componentInstance as unknown as {
      duringForm: { get: (name: string) => { setValue: (value: string) => void } };
      saveNote: (phase: 'BEFORE' | 'DURING') => void;
    };
    component.duringForm.get('note').setValue('Fitting the replacement.');
    component.saveNote('DURING');
    expect(createMyJobUpdate).toHaveBeenCalledWith('5', 'DURING', 'Fitting the replacement.');
  });

  it('explains when voice recording is unavailable without breaking the workflow', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    // Photos and notes stay usable; the audio file picker is the fallback.
    expect(text).toContain('Add progress photo');
    expect(text).toContain('Add Progress Update');
    expect(text).toContain('Or choose an audio file');
  });

  it('keeps Complete Job disabled until a completion note is entered', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const complete = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)].find(
      (button) => button.textContent?.trim() === 'Complete Job',
    );
    expect(complete).toBeDefined();
    expect(complete?.disabled).toBe(true);
  });

  it('shows the read-only work record for COMPLETED jobs', async () => {
    const detail = makeDetailWithStatus('COMPLETED');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(
        of([{ id: '8', jobId: '5', authorId: '2', phase: 'AFTER', note: 'Valve replaced and tested.', createdAt: '2026-09-21T13:00:00.000Z' }]),
      ),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('The work record is read-only');
    expect(text).toContain('Valve replaced and tested.');
  });

  function makePartsRequest(
    overrides: {
      id?: string;
      status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_INFO' | 'PARTS_AVAILABLE';
      reviewNotes?: string | null;
    } = {},
  ): Record<string, unknown> {
    const status = overrides.status ?? 'PENDING';
    const reviewed = status !== 'PENDING';
    return {
      id: overrides.id ?? '11',
      jobId: '5',
      businessId: '1',
      requestedBy: { technicianId: '2', displayName: 'Tech Parts' },
      status,
      reason: 'Required to complete the repair',
      createdAt: '2026-09-21T12:30:00.000Z',
      updatedAt: '2026-09-21T12:30:00.000Z',
      items: [
        {
          id: '21',
          partName: 'Brake fluid',
          quantity: 2,
          notes: null,
          hasPhoto: false,
          photoMime: null,
          createdAt: '2026-09-21T12:30:00.000Z',
        },
      ],
      reviewedBy: reviewed ? '9' : null,
      reviewedAt: reviewed ? '2026-09-21T13:00:00.000Z' : null,
      reviewNotes: reviewed ? (overrides.reviewNotes ?? 'Manager decision note.') : null,
      approvals: [],
    };
  }

  it('offers Request Parts for IN_PROGRESS jobs', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Parts Required');
    const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLElement>)].map(
      (button) => button.textContent?.trim(),
    );
    expect(buttons).toContain('Request Parts');
  });

  it('validates the Request Parts form before submitting', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    const createMyJobPartsRequest = vi.fn();
    await setup(vi.fn().mockReturnValue(of(detail)), {
      createMyJobPartsRequest,
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const component = fixture.componentInstance as unknown as {
      submitPartsRequest: () => void;
    };
    component.submitPartsRequest();
    expect(createMyJobPartsRequest).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Please complete the part name');
  });

  it('submits a parts request and shows it with its status', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    const created = makePartsRequest();
    const createMyJobPartsRequest = vi.fn().mockReturnValue(of(created));
    await setup(vi.fn().mockReturnValue(of(detail)), {
      createMyJobPartsRequest,
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const component = fixture.componentInstance as unknown as {
      partsForm: {
        controls: {
          partName: { setValue(value: string): void };
          quantity: { setValue(value: number): void };
          reason: { setValue(value: string): void };
        };
      };
      submitPartsRequest: () => void;
    };
    component.partsForm.controls.partName.setValue('Brake fluid');
    component.partsForm.controls.quantity.setValue(2);
    component.partsForm.controls.reason.setValue('Required to complete the repair');
    component.submitPartsRequest();
    expect(createMyJobPartsRequest).toHaveBeenCalledWith(
      '5',
      { partName: 'Brake fluid', quantity: 2, reason: 'Required to complete the repair' },
      undefined,
    );
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Brake fluid');
    expect(text).toContain('Quantity: 2');
    expect(text).toContain('Required to complete the repair');
    expect(text).toContain('Status: Pending');
  });

  it('lists submitted requests with their status badges and no approval controls', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest()])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Brake fluid');
    expect(text).toContain('Pending');
    // Stage 7F: the technician sees decisions but never decision controls.
    expect(text).not.toContain('Approve');
    expect(text).not.toContain('Reject');
    expect(text).not.toContain('Request More Info');
    expect(text).not.toContain('Mark Parts Available');
  });

  it('shows the manager approval decision with comment', async () => {
    const detail = makeDetailWithStatus('AWAITING_PARTS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(
        of([makePartsRequest({ status: 'APPROVED', reviewNotes: 'Genuine part required.' })]),
      ),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Decision: Approved by Manager');
    expect(text).toContain('Genuine part required.');
    expect(text).toContain('Job Status: Awaiting Parts');
  });

  it('offers a response form for NEEDS_INFO requests and submits it', async () => {
    const detail = makeDetailWithStatus('IN_PROGRESS');
    const updated = makePartsRequest({ status: 'PENDING' });
    const respondToMyJobPartsRequest = vi.fn().mockReturnValue(of(updated));
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(
        of([makePartsRequest({ status: 'NEEDS_INFO', reviewNotes: 'Which brand?' })]),
      ),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
      respondToMyJobPartsRequest,
    });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('More information requested by Manager');
    expect(fixture.nativeElement.textContent as string).toContain('Which brand?');
    expect(fixture.nativeElement.textContent as string).toContain('Respond with More Info');
    const component = fixture.componentInstance as unknown as {
      startRespond(requestId: string): void;
      confirmRespond(requestId: string): void;
      respondForm: { controls: { note: { setValue(value: string): void } } };
    };
    component.startRespond('11');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent as string).toContain('Submit Response');
    component.respondForm.controls.note.setValue('Castrol DOT4.');
    component.confirmRespond('11');
    expect(respondToMyJobPartsRequest).toHaveBeenCalledWith('5', '11', 'Castrol DOT4.');
  });

  it('shows parts-available and resumes the job when ready', async () => {
    const detail = makeDetailWithStatus('AWAITING_PARTS');
    const resumeMyJob = vi.fn().mockReturnValue(of({ ...detail.job, status: 'IN_PROGRESS' }));
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'PARTS_AVAILABLE' })])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
      resumeMyJob,
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Parts Available');
    expect(text).toContain('Job ready to continue');
    expect(text).toContain('Continue Job');
    const component = fixture.componentInstance as unknown as { resumeJob(): void };
    component.resumeJob();
    expect(resumeMyJob).toHaveBeenCalledWith('5');
  });

  it('waits for outstanding parts without a resume action', async () => {
    const detail = makeDetailWithStatus('AWAITING_PARTS');
    await setup(vi.fn().mockReturnValue(of(detail)), {
      listMyJobImages: vi.fn().mockReturnValue(of([])),
      listMyJobUpdates: vi.fn().mockReturnValue(of([])),
      listMyJobVoiceNotes: vi.fn().mockReturnValue(of([])),
      listMyJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'APPROVED' })])),
      getMyJobExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Waiting for the business');
    expect(text).not.toContain('Continue Job');
  });
});
