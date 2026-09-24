import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessJobDetailComponent } from './business-job-detail';
import { BusinessService } from '../../core/services/business.service';
import type { BusinessJobDetail } from '../../core/models/business.model';

function makeDetail(status: 'REQUESTED' | 'CANCELLED' | 'IN_PROGRESS' | 'AWAITING_PARTS' | 'COMPLETED'): BusinessJobDetail {
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
    listBusinessJobImages?: ReturnType<typeof vi.fn>;
    fetchBusinessJobImageBlob?: ReturnType<typeof vi.fn>;
    listBusinessJobUpdates?: ReturnType<typeof vi.fn>;
    listBusinessVoiceNotes?: ReturnType<typeof vi.fn>;
    fetchBusinessJobVoiceNoteBlob?: ReturnType<typeof vi.fn>;
    getBusinessExecutionTimeline?: ReturnType<typeof vi.fn>;
    listBusinessJobPartsRequests?: ReturnType<typeof vi.fn>;
    fetchBusinessJobPartsPhotoBlob?: ReturnType<typeof vi.fn>;
    approveJobPartsRequest?: ReturnType<typeof vi.fn>;
    rejectJobPartsRequest?: ReturnType<typeof vi.fn>;
    requestJobPartsInfo?: ReturnType<typeof vi.fn>;
    markJobPartsAvailable?: ReturnType<typeof vi.fn>;
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
            listBusinessJobImages: vi.fn().mockReturnValue(of([])),
            fetchBusinessJobImageBlob: vi.fn().mockReturnValue(of(new Blob())),
            listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
            listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
            fetchBusinessJobVoiceNoteBlob: vi.fn().mockReturnValue(of(new Blob())),
            getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: null, events: [] })),
            listBusinessJobPartsRequests: vi.fn().mockReturnValue(of([])),
            fetchBusinessJobPartsPhotoBlob: vi.fn().mockReturnValue(of(new Blob())),
            approveJobPartsRequest: vi.fn(),
            rejectJobPartsRequest: vi.fn(),
            requestJobPartsInfo: vi.fn(),
            markJobPartsAvailable: vi.fn(),
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

  it('offers a technician selector and assigns on submit', async () => {    const assignTechnician = vi.fn().mockReturnValue(
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

  it('shows the read-only execution record for IN_PROGRESS jobs', async () => {
    const detail = makeDetail('IN_PROGRESS');
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi
        .fn()
        .mockReturnValue(
          of([{ id: '9', jobId: '5', uploadedBy: '7', phase: 'BEFORE', originalFilename: 'b.png', mimeType: 'image/png', size: 12, createdAt: '2026-09-21T10:00:00.000Z' }]),
        ),
      listBusinessJobUpdates: vi
        .fn()
        .mockReturnValue(
          of([{ id: '3', jobId: '5', authorId: '7', phase: 'DURING', note: 'Valve removed.', createdAt: '2026-09-21T11:00:00.000Z' }]),
        ),
      listBusinessVoiceNotes: vi
        .fn()
        .mockReturnValue(
          of([{ id: '4', jobId: '5', authorId: '7', originalFilename: 'n.webm', mimeType: 'audio/webm', size: 44, durationSeconds: 12, createdAt: '2026-09-21T11:30:00.000Z' }]),
        ),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(
        of({
          job: detail.job,
          events: [
            { kind: 'status', createdAt: '2026-09-21T09:00:00.000Z', actor: 'business', status: 'IN_PROGRESS', previousStatus: 'REQUESTED', reason: 'Technician started job' },
            { kind: 'voice', createdAt: '2026-09-21T11:30:00.000Z', actor: 'technician', voiceNoteId: '4', mimeType: 'audio/webm', durationSeconds: 12 },
          ],
        }),
      ),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Work documentation');
    expect(text).toContain('Valve removed.');
    expect(text).toContain('Voice note');
    expect(text).toContain('Execution timeline');
    // Read-only: no technician capabilities leak into the business view.
    expect(text).not.toContain('Complete Job');
    expect(text).not.toContain('Record Voice Note');
  });

  it('hides the execution record for REQUESTED jobs', async () => {
    await setup({ getBusinessJob: vi.fn().mockReturnValue(of(makeDetail('REQUESTED'))) });
    expect((fixture.nativeElement.textContent as string)).not.toContain('Work documentation');
  });

  it('shows submitted parts requests with approval controls for IN_PROGRESS jobs', async () => {
    const detail = makeDetail('IN_PROGRESS');
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'PENDING' })])),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Parts Required');
    expect(text).toContain('Brake fluid');
    expect(text).toContain('Quantity: 2');
    expect(text).toContain('Required to complete the repair');
    expect(text).toContain('Bongani Zulu');
    expect(text).toContain('Pending');
    // Stage 7F: PENDING requests offer the manager decision controls.
    expect(text).toContain('Approve');
    expect(text).toContain('Reject');
    expect(text).toContain('Request More Info');
    expect(text).not.toContain('Mark Parts Available');
  });

  it('shows the manager decision, comment and timestamp for reviewed requests', async () => {
    const detail = makeDetail('AWAITING_PARTS');
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(
        of([makePartsRequest({ status: 'APPROVED' })]),
      ),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Approved');
    expect(text).toContain('Decision: Approved by Manager');
    expect(text).toContain('Genuine part required');
    expect(text).toContain('Mark Parts Available');
    expect(text).not.toContain('Request More Info');
  });

  it('offers no actions for terminal requests', async () => {
    const detail = makeDetail('IN_PROGRESS');
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(
        of([
          makePartsRequest({ id: '11', status: 'REJECTED' }),
          makePartsRequest({ id: '12', status: 'PARTS_AVAILABLE' }),
        ]),
      ),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Rejected');
    expect(text).toContain('Parts available');
    expect(text).not.toContain('Approve');
    expect(text).not.toContain('Request More Info');
    expect(text).not.toContain('Mark Parts Available');
  });

  it('approves a PENDING request through the service', async () => {
    const detail = makeDetail('IN_PROGRESS');
    const approved = makePartsRequest({ status: 'APPROVED' });
    const approveJobPartsRequest = vi
      .fn()
      .mockReturnValue(
        of({
          request: approved,
          approval: (approved['approvals'] as Array<Record<string, unknown>>)[0],
          job: { ...detail.job, status: 'AWAITING_PARTS' },
        }),
      );
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'PENDING' })])),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
      approveJobPartsRequest,
    });
    const component = fixture.componentInstance as unknown as {
      startDecision(requestId: string, action: 'approve' | 'reject' | 'request-info'): void;
      confirmDecision(requestId: string): void;
    };
    component.startDecision('11', 'approve');
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Confirm Approval');
    component.confirmDecision('11');
    expect(approveJobPartsRequest).toHaveBeenCalledWith('5', '11', { comment: '' });
  });

  it('requires a comment for rejection', async () => {
    const detail = makeDetail('IN_PROGRESS');
    const rejectJobPartsRequest = vi.fn();
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'PENDING' })])),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
      rejectJobPartsRequest,
    });
    const component = fixture.componentInstance as unknown as {
      startDecision(requestId: string, action: 'approve' | 'reject' | 'request-info'): void;
      confirmDecision(requestId: string): void;
    };
    component.startDecision('11', 'reject');
    fixture.detectChanges();
    component.confirmDecision('11');
    expect(rejectJobPartsRequest).not.toHaveBeenCalled();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('rejection reason is required');
  });

  it('marks an APPROVED request as available through the service', async () => {
    const detail = makeDetail('AWAITING_PARTS');
    const markJobPartsAvailable = vi.fn().mockReturnValue(
      of({
        request: makePartsRequest({ status: 'PARTS_AVAILABLE' }),
        job: { ...detail.job, status: 'IN_PROGRESS' },
        jobResumed: true,
      }),
    );
    await setup({
      getBusinessJob: vi.fn().mockReturnValue(of(detail)),
      listBusinessJobImages: vi.fn().mockReturnValue(of([])),
      listBusinessJobUpdates: vi.fn().mockReturnValue(of([])),
      listBusinessVoiceNotes: vi.fn().mockReturnValue(of([])),
      listBusinessJobPartsRequests: vi.fn().mockReturnValue(of([makePartsRequest({ status: 'APPROVED' })])),
      getBusinessExecutionTimeline: vi.fn().mockReturnValue(of({ job: detail.job, events: [] })),
      markJobPartsAvailable,
    });
    const component = fixture.componentInstance as unknown as { markAvailable(requestId: string): void };
    component.markAvailable('11');
    expect(markJobPartsAvailable).toHaveBeenCalledWith('5', '11');
  });
});

function makePartsRequest(overrides: { id?: string; status?: 'PENDING' | 'APPROVED' | 'REJECTED' | 'PARTS_AVAILABLE' } = {}): Record<string, unknown> {
  const status = overrides.status ?? 'PENDING';
  const reviewed = status !== 'PENDING';
  return {
    id: overrides.id ?? '11',
    jobId: '5',
    businessId: '1',
    requestedBy: { technicianId: '2', displayName: 'Bongani Zulu' },
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
    reviewNotes: reviewed ? 'Genuine part required — approved.' : null,
    approvals: reviewed
      ? [
          {
            id: '31',
            jobId: '5',
            partsRequestId: overrides.id ?? '11',
            requestedBy: '7',
            reviewedBy: '9',
            status: status === 'PARTS_AVAILABLE' ? 'APPROVED' : status,
            comments: 'Genuine part required — approved.',
            reviewedAt: '2026-09-21T13:00:00.000Z',
            createdAt: '2026-09-21T13:00:00.000Z',
          },
        ]
      : [],
  };
}
