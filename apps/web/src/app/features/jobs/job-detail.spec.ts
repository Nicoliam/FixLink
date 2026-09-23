import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { vi } from 'vitest';
import { JobDetailComponent } from './job-detail';
import { JobService } from '../../core/services/job.service';
import type { AcceptQuoteResult, Job, Quote } from '../../core/models/job.model';

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

const submittedQuote: Quote = {
  id: '11',
  jobId: '7',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu — ProPlumb' },
  total: 1250,
  currency: 'ZAR',
  message: 'Supply and install replacement kitchen mixer tap.',
  status: 'SUBMITTED',
  items: [{ id: '1', description: 'Labour', quantity: 1, unitPrice: 950, total: 950, sortOrder: 0 }],
  submittedAt: '2026-09-23T11:00:00.000Z',
  createdAt: '2026-09-23T11:00:00.000Z',
};

const quotedJob: Job = { ...job, status: 'QUOTED', quotes: [submittedQuote] };

const acceptedQuote: Quote = { ...submittedQuote, status: 'ACCEPTED' };

const acceptedJob: Job = {
  ...quotedJob,
  status: 'ACCEPTED',
  agreedAmount: 1250,
  currency: 'ZAR',
  quotes: [acceptedQuote],
};

function acceptanceResult(): AcceptQuoteResult {
  return { job: acceptedJob, quote: acceptedQuote };
}

describe('JobDetailComponent', () => {
  let fixture: ComponentFixture<JobDetailComponent>;

  async function setup(id: string, api: Record<string, ReturnType<typeof vi.fn>>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [JobDetailComponent],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: api },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ id }) } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(JobDetailComponent);
    fixture.detectChanges();
  }

  function apiWith(current: Job, accept: ReturnType<typeof vi.fn> = vi.fn()): Record<string, ReturnType<typeof vi.fn>> {
    return { getJob: vi.fn().mockReturnValue(of(current)), acceptQuote: accept };
  }

  function buttonWithText(text: string): HTMLButtonElement | null {
    const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)];
    return buttons.find((button) => button.textContent?.trim() === text) ?? null;
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('shows the request detail with provider, service and status', async () => {
    await setup('7', apiWith(job));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000007');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Requested');
    expect(text).toContain('Fourways, Johannesburg');
  });

  it('shows a received quote with an Accept Quote action', async () => {
    await setup('7', apiWith(quotedJob));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote received');
    expect(text).toContain('R1,250');
    expect(text).toContain('Supply and install replacement kitchen mixer tap.');
    expect(text).toContain('Labour');
    expect(buttonWithText('Accept Quote')).not.toBeNull();
  });

  it('hides the Accept action for ineligible states', async () => {
    // REQUESTED job without quotes: no accept action.
    await setup('7', apiWith(job));
    expect(buttonWithText('Accept Quote')).toBeNull();
    TestBed.resetTestingModule();
    // ACCEPTED job: accepted state, no accept action.
    await setup('7', apiWith(acceptedJob));
    expect((fixture.nativeElement.textContent as string)).toContain('Quote accepted');
    expect(buttonWithText('Accept Quote')).toBeNull();
  });

  it('shows a confirmation step with payment wording before accepting', async () => {
    await setup('7', apiWith(quotedJob));
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Accept this quote?');
    expect(text).toContain('agree to the quoted amount of R1,250');
    expect(text).toContain('Payment is arranged directly with the professional.');
    expect(buttonWithText('Cancel')).not.toBeNull();
    expect(text).not.toContain('payment successful');
  });

  it('accepts the quote and shows the accepted state with agreed price', async () => {
    const accept = vi.fn().mockReturnValue(of(acceptanceResult()));
    await setup('7', apiWith(quotedJob, accept));
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    expect(accept).toHaveBeenCalledWith('7', '11');
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote accepted');
    expect(text).toContain('Accepted');
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Agreed price: R1,250');
    expect(text).toContain('Payment is arranged directly with the professional.');
    expect(buttonWithText('Accept Quote')).toBeNull();
  });

  it('shows the accepting state while the request is in flight', async () => {
    const pending = new Subject<AcceptQuoteResult>();
    const accept = vi.fn().mockReturnValue(pending.asObservable());
    await setup('7', apiWith(quotedJob, accept));
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Accepting…');
    expect(buttonWithText('Accepting…')?.disabled).toBe(true);
    pending.next(acceptanceResult());
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Quote accepted');
  });

  it('surfaces acceptance errors without losing the quote', async () => {
    const accept = vi
      .fn()
      .mockReturnValue(throwError(() => ({ error: { error: { code: 'CONFLICT', message: 'This quote has already been accepted.' } } })));
    await setup('7', apiWith(quotedJob, accept));
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    buttonWithText('Accept Quote')?.click();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('This quote has already been accepted.');
    // The quote is still visible and the job is still QUOTED.
    expect(text).toContain('R1,250');
    expect(text).toContain('Quoted');
  });

  it('marks competing quotes as no longer available after acceptance', async () => {
    const retired: Quote = {
      ...submittedQuote,
      id: '12',
      total: 950,
      message: 'Competing offer.',
      status: 'DECLINED',
    };
    await setup('7', apiWith({ ...acceptedJob, quotes: [acceptedQuote, retired] }));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Quote accepted');
    expect(text).toContain('No longer available');
    expect(text).toContain('Competing offer.');
    expect(buttonWithText('Accept Quote')).toBeNull();
  });

  it('lets the customer pick between multiple eligible quotes', async () => {
    const second: Quote = { ...submittedQuote, id: '12', total: 950, message: 'Second offer.', status: 'SUBMITTED' };
    const accept = vi.fn().mockReturnValue(of(acceptanceResult()));
    await setup('7', apiWith({ ...quotedJob, quotes: [submittedQuote, second] }, accept));
    const buttons = [...(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)].filter(
      (button) => button.textContent?.trim() === 'Accept Quote',
    );
    expect(buttons.length).toBe(2);
  });

  it('shows the not-found state for unknown jobs', async () => {
    await setup(
      '9999',
      {
        getJob: vi.fn().mockReturnValue(throwError(() => ({ error: { error: { code: 'NOT_FOUND', message: 'x' } } }))),
        acceptQuote: vi.fn(),
      },
    );
    expect((fixture.nativeElement.textContent as string)).toContain('Job not found');
  });

  it('shows the error state when loading fails', async () => {
    await setup('7', { getJob: vi.fn().mockReturnValue(throwError(() => new Error('down'))), acceptQuote: vi.fn() });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  describe('Stage 6E — scheduled and in-progress states (read-only)', () => {
    const scheduledJob: Job = {
      ...acceptedJob,
      status: 'SCHEDULED',
      preferredDate: '2026-10-05',
      scheduledAt: '2026-10-05T08:00:00.000Z',
    };
    const activeJob: Job = { ...scheduledJob, status: 'IN_PROGRESS' };

    it('tells the customer the provider will schedule an ACCEPTED job', async () => {
      await setup('7', apiWith(acceptedJob));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Accepted');
      expect(text).toContain('will schedule the job');
      expect(text).toContain('Agreed price: R1,250');
      expect(text).toContain('Payment is arranged directly with the professional.');
    });

    it('shows the scheduled slot, provider and agreed price for SCHEDULED jobs', async () => {
      await setup('7', apiWith(scheduledJob));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('Scheduled');
      // The stored instant renders as the SAST wall time the provider picked.
      expect(text).toContain('Scheduled: 5 October 2026 at 10:00');
      expect(text).toContain('Sipho Ndlovu — ProPlumb');
      expect(text).toContain('Agreed price: R1,250');
      expect(text).toContain('Payment is arranged directly with the professional.');
    });

    it('shows the in-progress state with schedule and price', async () => {
      await setup('7', apiWith(activeJob));
      const text = fixture.nativeElement.textContent as string;
      expect(text).toContain('In progress');
      expect(text).toContain('has started the job');
      expect(text).toContain('Scheduled: 5 October 2026 at 10:00');
      expect(text).toContain('Sipho Ndlovu — ProPlumb');
      expect(text).toContain('Agreed price: R1,250');
    });

    it('gives the customer no controls that change the job status', async () => {
      for (const current of [acceptedJob, scheduledJob, activeJob]) {
        await setup('7', apiWith(current));
        expect(buttonWithText('Schedule Job')).toBeNull();
        expect(buttonWithText('Start Job')).toBeNull();
        expect(buttonWithText('Accept Quote')).toBeNull();
        TestBed.resetTestingModule();
      }
    });
  });
});
