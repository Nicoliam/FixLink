import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnDestroy,
  computed,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TechnicianService } from '../../core/services/technician.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import { businessJobPriorityLabel, businessJobStatusLabel, partsRequestStatusLabel, technicianWorkPhaseLabel } from '../../core/models/business.model';
import type {
  BusinessJobDetail,
  PartsRequest,
  TechnicianExecutionEvent,
  TechnicianJobImage,
  TechnicianJobUpdate,
  TechnicianVoiceNote,
  TechnicianWorkPhase,
} from '../../core/models/business.model';

type DetailStatus = 'loading' | 'ready' | 'error';

type WorkStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Browser voice-recorder state (MediaRecorder where supported). */
type RecordingState = 'idle' | 'requesting' | 'recording';

/**
 * FixLink technician job detail — Stage 7C (`/technician/jobs/:id`,
 * read-only detail) + Stage 7D (execution workspace: start work,
 * BEFORE/DURING/AFTER photos and notes, voice notes, completion).
 *
 * Shows the service, customer, contact details, description, address,
 * priority, schedule, status and timeline for one INTERNAL job with
 * an active assignment to the caller. The backend enforces access:
 * opening another technician's job (for example by editing the URL)
 * reads as not found. An assigned REQUESTED/SCHEDULED job offers a
 * Start Work action (→ IN_PROGRESS); an in-progress job shows the
 * execution workspace with per-phase photos, notes, voice recording
 * and a completion section where the required completion note enables
 * Complete Job (→ COMPLETED). Stage 7E adds Request Parts
 * (IN_PROGRESS/AWAITING_PARTS → PENDING request, job state unchanged)
 * with the submitted requests listed under Parts Required. Approvals
 * and notifications arrive in later stages and are not shown.
 */
@Component({
  selector: 'app-technician-job-detail',
  imports: [ReactiveFormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './technician-job-detail.html',
})
export class TechnicianJobDetailComponent implements OnInit, OnDestroy {
  private readonly api = inject(TechnicianService);
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<DetailStatus>('loading');
  protected readonly errorMessage = signal('');
  protected readonly detail = signal<BusinessJobDetail | null>(null);

  protected readonly statusText = businessJobStatusLabel;
  protected readonly priorityText = businessJobPriorityLabel;
  protected readonly phaseLabel = technicianWorkPhaseLabel;
  protected readonly partsStatusText = partsRequestStatusLabel;

  /** The Start Work action is shown only for REQUESTED/SCHEDULED jobs. */
  protected readonly canStart = computed<boolean>(() => {
    const jobStatus = this.detail()?.job.status;
    return jobStatus === 'REQUESTED' || jobStatus === 'SCHEDULED';
  });

  protected readonly showStartConfirm = signal(false);
  protected readonly starting = signal(false);
  protected readonly startError = signal<string | null>(null);

  /** Stage 7D work record for IN_PROGRESS jobs and later (read-only once completed). */
  protected readonly workStatus = signal<WorkStatus>('idle');
  protected readonly workError = signal('');
  protected readonly images = signal<TechnicianJobImage[]>([]);
  protected readonly updates = signal<TechnicianJobUpdate[]>([]);
  protected readonly voiceNotes = signal<TechnicianVoiceNote[]>([]);
  protected readonly events = signal<TechnicianExecutionEvent[]>([]);
  protected readonly photoUrls = signal<Record<string, string>>({});
  protected readonly voiceUrls = signal<Record<string, string>>({});

  protected readonly uploadingPhase = signal<TechnicianWorkPhase | null>(null);
  protected readonly uploadError = signal<string | null>(null);
  protected readonly deletingImageId = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly savingNote = signal<TechnicianWorkPhase | null>(null);
  protected readonly noteError = signal<string | null>(null);

  protected readonly showCompleteConfirm = signal(false);
  protected readonly completing = signal(false);
  protected readonly completeError = signal<string | null>(null);

  /**
   * Mirror of the completion-note textarea. Reactive-form values are not
   * signals, so the input is forwarded here for the `canComplete`
   * derivation below (re-evaluated on every keystroke via valueChanges).
   */
  protected readonly completionNoteValue = signal('');

  /** The completion note (the AFTER record), once completed. */
  protected readonly completionNote = computed<string | null>(() => {
    const after = this.updates().filter((update) => update.phase === 'AFTER');
    return after.length > 0 ? (after[after.length - 1] as TechnicianJobUpdate).note : null;
  });

  /**
   * The Complete Job action is enabled only for IN_PROGRESS jobs with a
   * non-empty completion note — the note is required by the backend.
   */
  protected readonly canComplete = computed<boolean>(() => {
    const job = this.detail()?.job;
    if (job?.status !== 'IN_PROGRESS' || this.completing()) return false;
    return this.completionNoteValue().trim().length > 0;
  });

  protected readonly isWorkEditable = computed<boolean>(() => this.detail()?.job.status === 'IN_PROGRESS');

  /**
   * Stage 7E — Request Parts is offered while the job accepts parts
   * requests (IN_PROGRESS now; AWAITING_PARTS once the Stage 7F
   * approval workflow can move jobs there).
   */
  protected readonly canRequestParts = computed<boolean>(() => {
    const jobStatus = this.detail()?.job.status;
    return jobStatus === 'IN_PROGRESS' || jobStatus === 'AWAITING_PARTS';
  });

  /** Stage 7E submitted parts requests (read-only once the job leaves execution). */
  protected readonly partsRequests = signal<PartsRequest[]>([]);
  protected readonly submittingParts = signal(false);
  protected readonly partsSubmitError = signal<string | null>(null);
  protected readonly partsPhotoName = signal<string | null>(null);
  protected readonly partsPhotoUrls = signal<Record<string, string>>({});

  private partsPhotoFile: File | null = null;

  /** Stage 7D progress-note forms (BEFORE/DURING notes, AFTER completion note). */
  readonly beforeForm = this.fb.group({
    note: ['', []],
  });

  readonly duringForm = this.fb.group({
    note: ['', []],
  });

  readonly completionForm = this.fb.group({
    note: ['', []],
  });

  /** Stage 7E parts-request form (part, quantity, reason, optional photo). */
  readonly partsForm = this.fb.group({
    partName: ['', [Validators.required, Validators.maxLength(255)]],
    quantity: [1, [Validators.required, Validators.min(1), Validators.max(10000)]],
    reason: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(1000)]],
  });

  // ---------------------------------------------------------------
  // Stage 7D voice recording (browser MediaRecorder where supported).
  // Recording never blocks the rest of the workflow: when the API is
  // missing or the microphone is denied, the workspace keeps working
  // with photos and notes, and an audio file picker stays available.
  // ---------------------------------------------------------------

  /** True when the browser can record audio in-page. */
  protected readonly voiceSupported = signal(false);

  protected readonly recordingState = signal<RecordingState>('idle');
  protected readonly recordError = signal<string | null>(null);
  /** Object URL of the just-recorded clip for in-page playback. */
  protected readonly recordedAudioUrl = signal<string | null>(null);
  protected readonly recordedDuration = signal(0);
  protected readonly uploadingVoice = signal(false);
  protected readonly voiceUploadError = signal<string | null>(null);

  private mediaRecorder: MediaRecorder | null = null;
  private mediaStream: MediaStream | null = null;
  private recordChunks: BlobPart[] = [];
  private recordStartedAt = 0;
  private recordedBlob: Blob | null = null;
  private recordedMime = '';

  ngOnInit(): void {
    this.voiceSupported.set(
      typeof MediaRecorder !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia,
    );
    this.completionForm
      .get('note')
      ?.valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((value: unknown) => {
        this.completionNoteValue.set(typeof value === 'string' ? value : '');
      });
    this.load();
  }

  ngOnDestroy(): void {
    for (const url of Object.values(this.photoUrls())) {
      URL.revokeObjectURL(url);
    }
    for (const url of Object.values(this.voiceUrls())) {
      URL.revokeObjectURL(url);
    }
    for (const url of Object.values(this.partsPhotoUrls())) {
      URL.revokeObjectURL(url);
    }
    const recorded = this.recordedAudioUrl();
    if (recorded) URL.revokeObjectURL(recorded);
    this.stopMediaTracks();
  }

  protected jobId(): string {
    return this.route.snapshot.paramMap.get('id') ?? '';
  }

  protected load(): void {
    this.status.set('loading');
    this.errorMessage.set('');
    this.api
      .getMyJob(this.jobId())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          this.detail.set(detail);
          this.status.set('ready');
          this.loadWork(detail);
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not load the job. Please try again.'));
          this.status.set('error');
        },
      });
  }

  protected imagesFor(phase: TechnicianWorkPhase): TechnicianJobImage[] {
    return this.images().filter((image) => image.phase === phase);
  }

  protected notesFor(phase: TechnicianWorkPhase): TechnicianJobUpdate[] {
    return this.updates().filter((update) => update.phase === phase);
  }

  protected photoUrl(imageId: string): string {
    return this.photoUrls()[imageId] ?? '';
  }

  protected voiceUrl(voiceId: string): string {
    return this.voiceUrls()[voiceId] ?? '';
  }

  protected retry(): void {
    this.load();
  }

  // ---------------------------------------------------------------
  // Start work (REQUESTED/SCHEDULED → IN_PROGRESS, server-side).
  // ---------------------------------------------------------------

  protected startStart(): void {
    this.showStartConfirm.set(true);
    this.startError.set(null);
  }

  protected cancelStart(): void {
    if (this.starting()) return;
    this.showStartConfirm.set(false);
    this.startError.set(null);
  }

  protected confirmStart(): void {
    const job = this.detail()?.job;
    if (!job || this.starting() || !this.canStart()) return;
    this.starting.set(true);
    this.startError.set(null);
    this.api
      .startMyJob(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.starting.set(false);
          this.showStartConfirm.set(false);
          this.detail.update((current) => (current ? { ...current, job: updated } : current));
          const current = this.detail();
          if (current) this.loadWork(current);
        },
        error: (error: unknown) => {
          this.starting.set(false);
          this.startError.set(getApiErrorMessage(error, 'Could not start the job. Please try again.'));
        },
      });
  }

  /** Load the work record for IN_PROGRESS jobs and later stages. */
  protected loadWork(detail: BusinessJobDetail): void {
    const jobStatus = detail.job.status;
    if (
      jobStatus !== 'IN_PROGRESS' &&
      jobStatus !== 'AWAITING_PARTS' &&
      jobStatus !== 'COMPLETED' &&
      jobStatus !== 'CONFIRMED' &&
      jobStatus !== 'CLOSED'
    ) {
      this.workStatus.set('idle');
      return;
    }
    this.workStatus.set('loading');
    this.workError.set('');
    forkJoin({
      images: this.api.listMyJobImages(detail.job.id).pipe(catchError(() => of(null))),
      updates: this.api.listMyJobUpdates(detail.job.id).pipe(catchError(() => of(null))),
      voiceNotes: this.api.listMyJobVoiceNotes(detail.job.id).pipe(catchError(() => of(null))),
      parts: this.api.listMyJobPartsRequests(detail.job.id).pipe(catchError(() => of(null))),
      timeline: this.api.getMyJobExecutionTimeline(detail.job.id).pipe(catchError(() => of(null))),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result) => {
        if (
          result.images === null ||
          result.updates === null ||
          result.voiceNotes === null ||
          result.parts === null ||
          result.timeline === null
        ) {
          this.workError.set('Could not load the work record. Please try again.');
          this.workStatus.set('error');
          return;
        }
        this.images.set(result.images);
        this.updates.set(result.updates);
        this.voiceNotes.set(result.voiceNotes);
        this.partsRequests.set(result.parts);
        this.events.set(result.timeline.events);
        this.workStatus.set('ready');
        this.loadPhotoBlobs(detail.job.id, result.images);
        this.loadVoiceBlobs(detail.job.id, result.voiceNotes);
        this.loadPartsPhotoBlobs(detail.job.id, result.parts);
      });
  }

  private loadPhotoBlobs(jobId: string, images: TechnicianJobImage[]): void {
    for (const image of images) {
      if (this.photoUrls()[image.id]) continue;
      this.api
        .fetchMyJobImageBlob(jobId, image.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.photoUrls.update((current) => ({ ...current, [image.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable photo must not break the work record.
          },
        });
    }
  }

  private loadVoiceBlobs(jobId: string, voiceNotes: TechnicianVoiceNote[]): void {
    for (const voice of voiceNotes) {
      if (this.voiceUrls()[voice.id]) continue;
      this.api
        .fetchMyJobVoiceNoteBlob(jobId, voice.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.voiceUrls.update((current) => ({ ...current, [voice.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable voice note must not break the work record.
          },
        });
    }
  }

  protected retryWork(): void {
    const current = this.detail();
    if (current) this.loadWork(current);
  }

  /** Upload a photo for a work phase (JPEG, PNG or WebP, 5MB max). */
  protected onFileSelected(event: Event, phase: TechnicianWorkPhase): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    const job = this.detail()?.job;
    if (!file || !job || this.uploadingPhase()) return;
    this.uploadingPhase.set(phase);
    this.uploadError.set(null);
    this.api
      .uploadMyJobImage(job.id, phase, file)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (image) => {
          this.uploadingPhase.set(null);
          this.images.update((current) => [...current, image]);
          this.loadPhotoBlobs(job.id, [image]);
          if (input) input.value = '';
        },
        error: (error: unknown) => {
          this.uploadingPhase.set(null);
          this.uploadError.set(getApiErrorMessage(error, 'Could not upload the photo. Please try again.'));
          if (input) input.value = '';
        },
      });
  }

  /** Delete an incorrectly uploaded photo while the job is IN_PROGRESS. */
  protected deletePhoto(imageId: string): void {
    const job = this.detail()?.job;
    if (!job || this.deletingImageId()) return;
    this.deletingImageId.set(imageId);
    this.deleteError.set(null);
    this.api
      .deleteMyJobImage(job.id, imageId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.deletingImageId.set(null);
          const url = this.photoUrls()[imageId];
          if (url) URL.revokeObjectURL(url);
          this.photoUrls.update((current) => {
            const next = { ...current };
            delete next[imageId];
            return next;
          });
          this.images.update((current) => current.filter((image) => image.id !== imageId));
        },
        error: (error: unknown) => {
          this.deletingImageId.set(null);
          this.deleteError.set(getApiErrorMessage(error, 'Could not delete the photo. Please try again.'));
        },
      });
  }

  /** Save a BEFORE/DURING progress note. */
  protected saveNote(phase: 'BEFORE' | 'DURING'): void {
    const form = phase === 'BEFORE' ? this.beforeForm : this.duringForm;
    const job = this.detail()?.job;
    if (!job || this.savingNote()) return;
    form.markAllAsTouched();
    const note = ((form.get('note')?.value as string | null) ?? '').trim();
    if (!note || note.length > 2000) {
      this.noteError.set('Please write a note of 2000 characters or fewer.');
      return;
    }
    this.savingNote.set(phase);
    this.noteError.set(null);
    this.api
      .createMyJobUpdate(job.id, phase, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (update) => {
          this.savingNote.set(null);
          this.updates.update((current) => [...current, update]);
          form.reset();
        },
        error: (error: unknown) => {
          this.savingNote.set(null);
          this.noteError.set(getApiErrorMessage(error, 'Could not save the note. Please try again.'));
        },
      });
  }

  // ---------------------------------------------------------------
  // Voice recording with MediaRecorder. Short clips are kept in
  // memory only until the technician uploads them — nothing is sent
  // until Upload is pressed. Microphone denial shows a message and
  // leaves photos/notes fully usable.
  // ---------------------------------------------------------------

  protected async startRecording(): Promise<void> {
    if (this.recordingState() !== 'idle' || !this.voiceSupported()) return;
    this.recordError.set(null);
    this.recordingState.set('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      this.mediaStream = stream;
      this.mediaRecorder = recorder;
      this.recordChunks = [];
      this.recordedMime = recorder.mimeType || 'audio/webm';
      recorder.ondataavailable = (event: BlobEvent): void => {
        if (event.data && event.data.size > 0) this.recordChunks.push(event.data);
      };
      recorder.onstop = (): void => {
        this.finishRecording();
      };
      this.recordStartedAt = Date.now();
      recorder.start();
      this.recordingState.set('recording');
    } catch {
      this.recordingState.set('idle');
      this.stopMediaTracks();
      this.recordError.set(
        'Microphone access was denied or is unavailable. You can still document the job with photos and notes, or choose an audio file below.',
      );
    }
  }

  protected stopRecording(): void {
    if (this.recordingState() !== 'recording' || !this.mediaRecorder) return;
    try {
      this.mediaRecorder.stop();
    } catch {
      this.recordingState.set('idle');
      this.stopMediaTracks();
    }
  }

  private finishRecording(): void {
    const duration = Math.max(0, Math.round((Date.now() - this.recordStartedAt) / 1000));
    const blob = new Blob(this.recordChunks, { type: this.recordedMime || 'audio/webm' });
    this.recordChunks = [];
    this.stopMediaTracks();
    this.mediaRecorder = null;
    this.recordedBlob = blob;
    this.recordedDuration.set(duration);
    const previous = this.recordedAudioUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.recordedAudioUrl.set(URL.createObjectURL(blob));
    this.recordingState.set('idle');
  }

  protected discardRecording(): void {
    if (this.uploadingVoice()) return;
    this.recordedBlob = null;
    this.recordedDuration.set(0);
    const previous = this.recordedAudioUrl();
    if (previous) URL.revokeObjectURL(previous);
    this.recordedAudioUrl.set(null);
    this.recordError.set(null);
  }

  private stopMediaTracks(): void {
    if (this.mediaStream) {
      for (const track of this.mediaStream.getTracks()) {
        try {
          track.stop();
        } catch {
          // Best effort: the stream is already gone.
        }
      }
      this.mediaStream = null;
    }
  }

  /** Upload the just-recorded clip as the DURING voice note. */
  protected uploadRecording(): void {
    const job = this.detail()?.job;
    const blob = this.recordedBlob;
    if (!job || !blob || this.uploadingVoice()) return;
    const file = new File([blob], `voice-note.${extensionForBlob(blob.type)}`, { type: blob.type || 'audio/webm' });
    this.uploadVoiceFile(job.id, file, this.recordedDuration());
    this.discardRecording();
  }

  /** Upload an audio file picked from the device (fallback for no-mic browsers). */
  protected onVoiceFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0];
    const job = this.detail()?.job;
    if (!file || !job || this.uploadingVoice()) return;
    this.uploadVoiceFile(job.id, file);
    if (input) input.value = '';
  }

  private uploadVoiceFile(jobId: string, file: File, duration?: number): void {
    this.uploadingVoice.set(true);
    this.voiceUploadError.set(null);
    this.api
      .uploadMyJobVoiceNote(jobId, file, duration)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (voiceNote) => {
          this.uploadingVoice.set(false);
          this.voiceNotes.update((current) => [...current, voiceNote]);
          this.loadVoiceBlobs(jobId, [voiceNote]);
        },
        error: (error: unknown) => {
          this.uploadingVoice.set(false);
          this.voiceUploadError.set(getApiErrorMessage(error, 'Could not upload the voice note. Please try again.'));
        },
      });
  }

  // ---------------------------------------------------------------
  // Completion (IN_PROGRESS → COMPLETED, note required).
  // ---------------------------------------------------------------

  protected startComplete(): void {
    this.completionForm.markAllAsTouched();
    if (!this.canComplete()) {
      this.completeError.set('A completion note is required to complete the job.');
      return;
    }
    this.showCompleteConfirm.set(true);
    this.completeError.set(null);
  }

  protected cancelComplete(): void {
    if (this.completing()) return;
    this.showCompleteConfirm.set(false);
    this.completeError.set(null);
  }

  protected confirmComplete(): void {
    const job = this.detail()?.job;
    if (!job || this.completing() || !this.canComplete()) return;
    this.completing.set(true);
    this.completeError.set(null);
    const note = ((this.completionForm.get('note')?.value as string | null) ?? '').trim();
    this.api
      .completeMyJob(job.id, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.completing.set(false);
          this.showCompleteConfirm.set(false);
          this.updates.update((current) => [...current, result.update]);
          this.detail.update((current) => (current ? { ...current, job: result.job } : current));
        },
        error: (error: unknown) => {
          this.completing.set(false);
          this.completeError.set(getApiErrorMessage(error, 'Could not complete the job. Please try again.'));
        },
      });
  }

  // ---------------------------------------------------------------
  // Stage 7E — parts requests (IN_PROGRESS/AWAITING_PARTS → PENDING,
  // job state unchanged). The form posts part, quantity, reason and
  // an optional evidence photo; submitted requests render below with
  // their backend-derived status.
  // ---------------------------------------------------------------

  protected partsPhotoUrl(requestId: string): string {
    return this.partsPhotoUrls()[requestId] ?? '';
  }

  /** Remember the optional evidence photo (sent with the request). */
  protected onPartsPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    this.partsPhotoFile = file;
    this.partsPhotoName.set(file ? file.name : null);
  }

  /** Submit a parts request for the assigned job. */
  protected submitPartsRequest(): void {
    const job = this.detail()?.job;
    if (!job || this.submittingParts() || !this.canRequestParts()) return;
    this.partsForm.markAllAsTouched();
    if (this.partsForm.invalid) {
      this.partsSubmitError.set('Please complete the part name, quantity and reason.');
      return;
    }
    const value = this.partsForm.getRawValue();
    const quantity = Number(value.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) {
      this.partsSubmitError.set('Quantity must be a whole number between 1 and 10000.');
      return;
    }
    this.submittingParts.set(true);
    this.partsSubmitError.set(null);
    this.api
      .createMyJobPartsRequest(
        job.id,
        {
          partName: (value.partName ?? '').trim(),
          quantity,
          reason: (value.reason ?? '').trim(),
        },
        this.partsPhotoFile ?? undefined,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (created) => {
          this.submittingParts.set(false);
          this.partsRequests.update((current) => [...current, created]);
          this.loadPartsPhotoBlobs(job.id, [created]);
          this.partsForm.reset({ partName: '', quantity: 1, reason: '' });
          this.partsPhotoFile = null;
          this.partsPhotoName.set(null);
        },
        error: (error: unknown) => {
          this.submittingParts.set(false);
          this.partsSubmitError.set(getApiErrorMessage(error, 'Could not submit the parts request. Please try again.'));
        },
      });
  }

  private loadPartsPhotoBlobs(jobId: string, requests: PartsRequest[]): void {
    for (const item of requests) {
      if (!item.items.some((entry) => entry.hasPhoto)) continue;
      if (this.partsPhotoUrls()[item.id]) continue;
      this.api
        .fetchMyJobPartsPhotoBlob(jobId, item.id)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (blob) => {
            this.partsPhotoUrls.update((current) => ({ ...current, [item.id]: URL.createObjectURL(blob) }));
          },
          error: () => {
            // A single unreadable evidence photo must not break the section.
          },
        });
    }
  }
}

/** File extension for a recorded audio blob (matches the backend allowlist). */
function extensionForBlob(mime: string): string {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (normalized === 'audio/mp4') return 'mp4';
  if (normalized === 'audio/mpeg') return 'mp3';
  if (normalized === 'audio/wav' || normalized === 'audio/x-wav') return 'wav';
  if (normalized === 'audio/ogg') return 'ogg';
  return 'webm';
}
