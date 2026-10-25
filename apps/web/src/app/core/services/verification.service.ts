import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';

import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { VerificationDocumentType, VerificationStatus } from '../models/verification.model';

@Injectable({ providedIn: 'root' })
export class VerificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL); // already ends in /api/v1

  getStatus(): Observable<VerificationStatus> {
    return this.http
      .get<ApiSuccess<VerificationStatus>>(`${this.baseUrl}/verification/status`)
      .pipe(map((res) => res.data));
  }

  /** documentDate (YYYY-MM-DD) is required for the Huru report. */
  uploadDocument(type: VerificationDocumentType, file: File, documentDate?: string): Observable<unknown> {
    const formData = new FormData();
    formData.append('type', type); // text fields before the file
    if (documentDate) {
      formData.append('document_date', documentDate);
    }
    formData.append('file', file);
    return this.http.post<ApiSuccess<unknown>>(`${this.baseUrl}/verification/document`, formData).pipe(map((res) => res.data));
  }

  deleteDocument(type: VerificationDocumentType): Observable<unknown> {
    return this.http
      .delete<ApiSuccess<unknown>>(`${this.baseUrl}/verification/document/${encodeURIComponent(type)}`)
      .pipe(map((res) => res.data));
  }

  /** Fetch a document the signed-in provider owns, as a Blob, for the View action. */
  viewDocument(documentId: string): Observable<Blob> {
    return this.http.get(`${this.baseUrl}/verification/document/${encodeURIComponent(documentId)}/file`, {
      responseType: 'blob',
    });
  }

  resendPhoneCode(): Observable<unknown> {
    return this.http.post<ApiSuccess<unknown>>(`${this.baseUrl}/verification/phone-code`, {}).pipe(map((res) => res.data));
  }

  confirmPhoneCode(code: string): Observable<unknown> {
    return this.http
      .post<ApiSuccess<unknown>>(`${this.baseUrl}/verification/phone-code/confirm`, { code })
      .pipe(map((res) => res.data));
  }

  sendEmailLink(): Observable<unknown> {
    return this.http.post<ApiSuccess<unknown>>(`${this.baseUrl}/verification/email-link`, {}).pipe(map((res) => res.data));
  }

  confirmEmail(token: string): Observable<unknown> {
    return this.http
      .get<ApiSuccess<unknown>>(`${this.baseUrl}/verification/email-confirm`, { params: { token } })
      .pipe(map((res) => res.data));
  }
}