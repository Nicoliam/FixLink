import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RequestDetailComponent } from './request-detail';
import { JobService } from '../../core/services/job.service';
import type { ProviderRequest, Quote } from '../../core/models/job.model';

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
});
