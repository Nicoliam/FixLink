import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { OpenRequestsComponent } from './open-requests';
import { JobService } from '../../core/services/job.service';
import type { ProviderRequest } from '../../core/models/job.model';

function openRequest(overrides: Partial<ProviderRequest> = {}): ProviderRequest {
  return {
    id: '9',
    reference: 'FL-2026-000009',
    source: 'MARKETPLACE',
    status: 'REQUESTED',
    // An open request has nobody: that is the whole point of the board.
    provider: null,
    service: {
      id: '1',
      name: 'Leak Repair & Pipe Fixes',
      slug: 'leak-repair',
      categoryId: '1',
      categoryName: 'Plumbing',
    },
    description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
    location: 'Randburg, Johannesburg',
    city: null,
    province: null,
    preferredDate: '2026-10-05',
    scheduledAt: '2026-10-05T09:00:00',
    createdAt: '2026-09-23T10:00:00.000Z',
    customer: { displayName: 'Thandi K.' },
    quotes: [],
    ...overrides,
  };
}

function ownQuote(overrides: Partial<ProviderRequest['quotes'][number]> = {}): ProviderRequest['quotes'][number] {
  return {
    id: 'q1',
    jobId: '9',
    provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu - ProPlumb' },
    total: 1250,
    currency: 'ZAR',
    message: null,
    status: 'SUBMITTED',
    items: [],
    submittedAt: '2026-09-23T11:00:00.000Z',
    createdAt: '2026-09-23T11:00:00.000Z',
    ...overrides,
  };
}

/**
 * Step 14 — the open-request board.
 *
 * The board is where a professional finds unaddressed requests matching their
 * services and areas. What matters to test here is that it never over-promises:
 * it never shows competing quotes, and its empty state explains the two
 * fixable reasons for an empty board instead of just saying "nothing here".
 */
describe('OpenRequestsComponent', () => {
  let fixture: ComponentFixture<OpenRequestsComponent>;
  let component: OpenRequestsComponent;
  let api: { listOpenRequests: ReturnType<typeof vi.fn> };

  async function setup(options: { items?: ProviderRequest[]; error?: boolean } = {}): Promise<void> {
    const items = options.items ?? [openRequest()];
    api = {
      listOpenRequests: options.error
        ? vi.fn().mockReturnValue(
            throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Board down.' } } })),
          )
        : vi.fn().mockReturnValue(of({ items, total: items.length, page: 1, pageSize: 20 })),
    };
    await TestBed.configureTestingModule({
      imports: [OpenRequestsComponent],
      providers: [provideRouter([]), { provide: JobService, useValue: api }],
    }).compileComponents();
    fixture = TestBed.createComponent(OpenRequestsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent as string;
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('lists matching open requests and labels each as unaddressed', async () => {
    await setup();
    expect(text()).toContain('Leak Repair & Pipe Fixes');
    expect(text()).toContain('Randburg, Johannesburg');
    expect(text()).toContain('Open request');
    expect(root().querySelectorAll('article').length).toBe(1);
  });

  it('states the quote cap so the professional knows the request can close', async () => {
    await setup();
    expect(text()).toContain('The first 3 professionals to quote are accepted');
  });

  it('offers no filters, because there is no distance or category filter to offer', async () => {
    await setup();
    expect(root().querySelectorAll('select').length).toBe(0);
    expect(text()).not.toContain('radius');
    expect(text()).not.toContain('within');
  });

  it('explains both fixable reasons when the board is empty', async () => {
    await setup({ items: [] });
    const empty = text();
    expect(empty).toContain('No matching requests right now');
    // "Services" and "areas" are the two halves of the match; naming only one
    // would send the provider to fix the wrong thing.
    expect(empty).toContain('services on your profile');
    expect(empty).toContain('areas you service');
    expect(root().querySelectorAll('a').length).toBe(2);
  });

  it('surfaces a load failure with a retry', async () => {
    await setup({ error: true });
    expect(text()).toContain('Board down.');
    expect(root().querySelector('button')?.textContent).toContain('Try again');
  });

  it('warns that some requests already have quotes, without revealing who or how much', async () => {
    await setup({
      items: [
        openRequest({ id: '9', status: 'QUOTED', quotes: [ownQuote({ id: 'q-mine' })] }),
        openRequest({ id: '10', reference: 'FL-2026-000010' }),
      ],
    });
    const board = text();
    expect(board).toContain('Some of these already have quotes');
    expect(board).toContain('You have quoted');
    // The competing professional's identity and amount must never appear: a
    // price shown to a rival is an anchor the customer did not ask for.
    expect(board).not.toContain('Nomsa');
    expect(board).not.toContain('2400');
    expect(board).not.toContain('R2');
  });

  it('says nothing about competing quotes when this professional has quoted none', async () => {
    await setup({ items: [openRequest({ status: 'QUOTED' })] });
    // Status QUOTED, but `quotes` is the VIEWING provider's own and is empty:
    // someone else quoted and we must not say so.
    expect(text()).not.toContain('Some of these already have quotes');
  });
});