import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  BusinessJob,
  BusinessJobDetail,
  BusinessJobList,
  BusinessJobListParams,
  CompleteTechnicianJobResult,
  TechnicianExecutionTimeline,
  TechnicianJobImage,
  TechnicianJobImageList,
  TechnicianJobUpdate,
  TechnicianJobUpdateList,
  TechnicianVoiceNote,
  TechnicianVoiceNoteList,
  TechnicianWorkPhase,
} from '../models/business.model';

/**
 * FixLink technician API client — Stage 7C (My Jobs) + Stage 7D
 * (execution: start, BEFORE/DURING/AFTER photos and notes, voice
 * notes, timeline, completion).
 *
 * Single owner of technician calls. All endpoints require
 * authentication; the technician identity is derived by the backend
 * from the session user, never from these payloads. Only jobs with
 * an active TECHNICIAN assignment to the caller are visible.
 * Parts, approvals and notifications arrive in later stages.
 */
@Injectable({ providedIn: 'root' })
export class TechnicianService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** List INTERNAL jobs actively assigned to the authenticated technician. */
  listMyJobs(params: BusinessJobListParams = {}): Observable<BusinessJobList> {
    let httpParams = new HttpParams();
    if (params.status?.trim()) httpParams = httpParams.set('status', params.status.trim());
    if (params.page) httpParams = httpParams.set('page', String(params.page));
    if (params.pageSize) httpParams = httpParams.set('pageSize', String(params.pageSize));
    return this.http
      .get<ApiSuccess<BusinessJobList>>(`${this.baseUrl}/technician/jobs`, { params: httpParams })
      .pipe(map((res) => res.data));
  }

  /** Retrieve one assigned INTERNAL job with its timeline. */
  getMyJob(id: string): Observable<BusinessJobDetail> {
    return this.http
      .get<ApiSuccess<BusinessJobDetail>>(`${this.baseUrl}/technician/jobs/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Start work on an assigned REQUESTED/SCHEDULED job (→ IN_PROGRESS). */
  startMyJob(id: string): Observable<BusinessJob> {
    return this.http
      .post<ApiSuccess<BusinessJob>>(`${this.baseUrl}/technician/jobs/${encodeURIComponent(id)}/start`, {})
      .pipe(map((res) => res.data));
  }

  /**
   * Upload a BEFORE/DURING/AFTER photo for an IN_PROGRESS job. Sent as
   * multipart FormData (`image` file + `phase` field); resolves with
   * the stored file metadata (never binaries or paths).
   */
  uploadMyJobImage(jobId: string, phase: TechnicianWorkPhase, file: File): Observable<TechnicianJobImage> {
    const form = new FormData();
    form.append('phase', phase);
    form.append('image', file, file.name);
    return this.http
      .post<ApiSuccess<TechnicianJobImage>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/images`,
        form,
      )
      .pipe(map((res) => res.data));
  }

  /** List photo metadata for an assigned job. */
  listMyJobImages(jobId: string): Observable<TechnicianJobImage[]> {
    return this.http
      .get<ApiSuccess<TechnicianJobImageList>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/images`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Authorized URL for photo bytes (use an object URL from fetch for <img>). */
  myJobImageFileUrl(jobId: string, imageId: string): string {
    return `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}/file`;
  }

  /** Fetch authorized photo bytes as a Blob (interceptor attaches the token). */
  fetchMyJobImageBlob(jobId: string, imageId: string): Observable<Blob> {
    return this.http.get(this.myJobImageFileUrl(jobId, imageId), { responseType: 'blob' });
  }

  /** Delete an uploaded photo while the job is still IN_PROGRESS. */
  deleteMyJobImage(jobId: string, imageId: string): Observable<void> {
    return this.http
      .delete<ApiSuccess<{ deleted: boolean }>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/images/${encodeURIComponent(imageId)}`,
      )
      .pipe(map(() => undefined));
  }

  /** Save a BEFORE/DURING/AFTER progress note (IN_PROGRESS only). */
  createMyJobUpdate(jobId: string, phase: TechnicianWorkPhase, note: string): Observable<TechnicianJobUpdate> {
    return this.http
      .post<ApiSuccess<TechnicianJobUpdate>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/updates`,
        { phase, note: note.trim() },
      )
      .pipe(map((res) => res.data));
  }

  /** List progress notes for an assigned job. */
  listMyJobUpdates(jobId: string): Observable<TechnicianJobUpdate[]> {
    return this.http
      .get<ApiSuccess<TechnicianJobUpdateList>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/updates`,
      )
      .pipe(map((res) => res.data.items));
  }

  /**
   * Upload a voice note for an IN_PROGRESS job. Sent as multipart
   * FormData (`audio` file + optional `duration` seconds); resolves
   * with the stored file metadata (never audio bytes or paths).
   */
  uploadMyJobVoiceNote(jobId: string, file: File, durationSeconds?: number): Observable<TechnicianVoiceNote> {
    const form = new FormData();
    form.append('audio', file, file.name);
    if (durationSeconds !== undefined && Number.isFinite(durationSeconds)) {
      form.append('duration', String(Math.round(durationSeconds)));
    }
    return this.http
      .post<ApiSuccess<TechnicianVoiceNote>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/voice-notes`,
        form,
      )
      .pipe(map((res) => res.data));
  }

  /** List voice-note metadata for an assigned job. */
  listMyJobVoiceNotes(jobId: string): Observable<TechnicianVoiceNote[]> {
    return this.http
      .get<ApiSuccess<TechnicianVoiceNoteList>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/voice-notes`,
      )
      .pipe(map((res) => res.data.items));
  }

  /** Authorized URL for voice-note bytes (use an object URL from fetch for <audio>). */
  myJobVoiceNoteFileUrl(jobId: string, voiceNoteId: string): string {
    return `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/voice-notes/${encodeURIComponent(voiceNoteId)}/file`;
  }

  /** Fetch authorized voice-note bytes as a Blob (interceptor attaches the token). */
  fetchMyJobVoiceNoteBlob(jobId: string, voiceNoteId: string): Observable<Blob> {
    return this.http.get(this.myJobVoiceNoteFileUrl(jobId, voiceNoteId), { responseType: 'blob' });
  }

  /** Retrieve the execution timeline (status + assignment + work + voice events). */
  getMyJobExecutionTimeline(jobId: string): Observable<TechnicianExecutionTimeline> {
    return this.http
      .get<ApiSuccess<TechnicianExecutionTimeline>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/timeline`,
      )
      .pipe(map((res) => res.data));
  }

  /**
   * Complete an IN_PROGRESS job (→ COMPLETED). The completion note is
   * required and stored as the AFTER record; the backend validates the
   * assignment and state server-side.
   */
  completeMyJob(jobId: string, note: string): Observable<CompleteTechnicianJobResult> {
    return this.http
      .post<ApiSuccess<CompleteTechnicianJobResult>>(
        `${this.baseUrl}/technician/jobs/${encodeURIComponent(jobId)}/complete`,
        { note: note.trim() },
      )
      .pipe(map((res) => res.data));
  }
}
