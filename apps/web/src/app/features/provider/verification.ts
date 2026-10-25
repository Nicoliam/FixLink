import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { VerificationService } from '../../core/services/verification.service';
import { getApiErrorMessage } from '../../core/models/api.model';
import type { VerificationDocumentType, VerificationItem, VerificationStatus } from '../../core/models/verification.model';

import { DOCUMENT_STATUS_KEY } from '../../core/models/verification.model';

@Component({
  selector: 'app-verification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './verification.html',
  styleUrl: './verification.css',
})
export class VerificationComponent {
  private readonly api = inject(VerificationService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = signal<'loading' | 'loaded' | 'error'>('loading');
  protected readonly errorMessage = signal<string>('');
  protected readonly errorCode = signal<string | null>(null);
  protected readonly verification = signal<VerificationStatus>({
    status: 'unverified',
    huru_report: { status: 'missing', document_id: null, file_name: null, document_date: null },
    certified_id: { status: 'missing', document_id: null, file_name: null },
    proof_of_residence: { status: 'missing', document_id: null, file_name: null },
    qualifications: { status: 'missing', document_id: null, file_name: null, count: 0 },
    profile_picture: { status: 'missing', document_id: null, file_name: null },
    selfie: { status: 'missing', document_id: null, file_name: null },
    phone_verified: false,
    email_verified: false,
    pending_since: null,
  });

  protected readonly uploading = signal(false);
  protected readonly resendCooldown = signal(0);
  protected readonly huruDate = signal('');

  protected onHuruDateChange(event: Event): void {
    this.huruDate.set((event.target as HTMLInputElement).value);
  }

  protected readonly documentTypes = signal<VerificationDocumentType[]>([
    'HURU_REPORT',
    'ID_COPY',
    'PROOF_OF_RESIDENCE',
    'QUALIFICATION',
    'PROFILE_PICTURE',
    'SELFIE',
  ]);

  protected readonly TYPE_LABELS: Record<VerificationDocumentType, string> = {
    HURU_REPORT: 'Huru report',
    ID_COPY: 'Certified ID',
    PROOF_OF_RESIDENCE: 'Proof of residence',
    QUALIFICATION: 'Qualifications',
    PROFILE_PICTURE: 'Profile picture',
    SELFIE: 'Selfie',
  };

  protected readonly STATUS_LABELS: Record<string, string> = {
    missing: 'Missing',
    uploaded: 'Uploaded',
    approved: 'Approved',
    rejected: 'Rejected',
  };

  protected readonly today = new Date();
  protected readonly todayString = this.today.toISOString().split('T')[0];
  protected readonly minDate = (() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 3);
    return d.toISOString().split('T')[0];
  })();

  protected readonly documentStatusKey = DOCUMENT_STATUS_KEY;
  protected readonly isVerificationPage = signal(true);

  ngOnInit(): void {
    this.isVerificationPage.set(this.router.url !== '/verification');
    this.loadStatus();
  }

  protected loadStatus(): void {
    this.status.set('loading');
    this.fetchStatus();
  }

  /** Reload the status without blanking the page (used after uploads and confirmations). */
  private refreshStatus(): void {
    this.fetchStatus();
  }

  private fetchStatus(): void {
    this.api
      .getStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (vs: VerificationStatus) => {
          this.verification.set(vs);
          this.status.set('loaded');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'We could not load your verification status. Please try again.'));
          this.errorCode.set('LOAD_ERROR');
          this.status.set('error');
        },
      });
  }

  protected resendPhoneCode(): void {
    this.uploading.set(true);
    this.api
      .resendPhoneCode()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: () => {
          this.errorMessage.set('A new verification code has been sent to your phone.');
          this.errorCode.set('SEND_CODE_SUCCESS');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not send verification code. Please try again.'));
          this.errorCode.set('SEND_CODE_ERROR');
        },
      });
  }

  protected confirmPhoneCode(code: string): void {
    this.uploading.set(true);
    this.api
      .confirmPhoneCode(code)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: () => {
          this.refreshStatus();
          this.errorMessage.set('Your phone number has been verified.');
          this.errorCode.set('PHONE_VERIFIED_SUCCESS');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Invalid or expired verification code. Please try again.'));
          this.errorCode.set('INVALID_CODE');
        },
      });
  }

  protected sendEmailLink(): void {
    this.uploading.set(true);
    this.api
      .sendEmailLink()
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: () => {
          this.errorMessage.set('A verification link has been sent to your email.');
          this.errorCode.set('SEND_EMAIL_SUCCESS');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Could not send verification link. Please try again.'));
          this.errorCode.set('SEND_EMAIL_ERROR');
        },
      });
  }

  protected confirmEmail(token: string): void {
    this.uploading.set(true);
    this.api
      .confirmEmail(token)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.uploading.set(false)),
      )
      .subscribe({
        next: () => {
          this.refreshStatus();
          this.errorMessage.set('Your email address has been verified.');
          this.errorCode.set('EMAIL_VERIFIED_SUCCESS');
        },
        error: (error: unknown) => {
          this.errorMessage.set(getApiErrorMessage(error, 'Invalid or expired verification token. Please try again.'));
          this.errorCode.set('INVALID_TOKEN');
        },
      });
  }

  protected readonly REQUIRED_ITEMS: readonly VerificationDocumentType[] = [
    'HURU_REPORT',
    'ID_COPY',
    'PROOF_OF_RESIDENCE',
    'QUALIFICATION',
    'PROFILE_PICTURE',
    'SELFIE',
  ];

  protected get progressPercentage(): number {
    const v = this.verification();
    const items = this.REQUIRED_ITEMS.map((key) => v[this.documentStatusKey[key]]?.status);
    const completed = items.filter((s) => s === 'uploaded' || s === 'approved').length;
    return Math.round((completed / this.REQUIRED_ITEMS.length) * 100);
  }

  protected get pendingReason(): string | null {
    const v = this.verification();
    const missingItems = this.REQUIRED_ITEMS
      .map((key) => v[this.documentStatusKey[key]])
      .filter((item) => item?.status === 'missing');
    if (missingItems.length > 0) {
      return `Missing ${missingItems.length} document${missingItems.length > 1 ? 's' : ''}`;
    }
    return null;
  }

  protected onFileChange(event: Event, field: VerificationDocumentType): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    let documentDate: string | undefined;
    if (field === 'HURU_REPORT') {
      documentDate = this.huruDate();
      if (!documentDate) {
        this.errorMessage.set('Please choose the Huru report date first.');
        input.value = '';
        return;
      }
    }

    this.uploading.set(true);
    this.activeType.set(field);
    this.api
      .uploadDocument(field, file, documentDate)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          this.uploading.set(false);
          this.activeType.set(null);
          input.value = '';
        }),
      )
      .subscribe({
        next: () => {
          this.refreshStatus();
          this.errorMessage.set(`${this.TYPE_LABELS[field]} uploaded successfully.`);
        },
        error: (err: unknown) => {
          this.errorMessage.set(
            getApiErrorMessage(err, 'Could not upload document. Please check the file format and size.'),
          );
        },
      });
  }

  protected readonly activeType = signal<VerificationDocumentType | null>(null);

  protected item(type: VerificationDocumentType): VerificationItem {
    return this.verification()[this.documentStatusKey[type]];
  }

  protected viewDocument(type: VerificationDocumentType): void {
    const id = this.item(type).document_id;
    if (!id) return;
    // Open the tab inside the click itself, or Safari blocks it as a pop-up.
    const tab = window.open('', '_blank');
    if (!tab) {
      this.errorMessage.set('Your browser blocked the new tab. Please allow pop-ups for this site and try again.');
      return;
    }
    this.api
      .viewDocument(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob: Blob) => {
          const url = URL.createObjectURL(blob);
          tab.location.href = url;
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
        },
        error: (err: unknown) => {
          tab.close();
          this.errorMessage.set(getApiErrorMessage(err, 'Could not open the document. Please try again.'));
        },
      });
  }

  protected removeDocument(type: VerificationDocumentType): void {
    if (!confirm(`Remove your ${this.TYPE_LABELS[type]}?`)) return;
    this.activeType.set(type);
    this.api
      .deleteDocument(type)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.activeType.set(null)),
      )
      .subscribe({
        next: () => {
          this.errorMessage.set(`${this.TYPE_LABELS[type]} removed.`);
          this.refreshStatus();
        },
        error: (err: unknown) => {
          this.errorMessage.set(getApiErrorMessage(err, 'Could not remove the document. Please try again.'));
        },
      });
  }

  protected retryUpload(_field: VerificationDocumentType): void {
    this.refreshStatus();
  }
}