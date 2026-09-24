import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { BusinessJobsListComponent } from './business-jobs-list';
import { BusinessService } from '../../core/services/business.service';
import type {
  BusinessBoardJob,
  BusinessBoardSummary,
  BusinessJob,
  Technician,
} from '../../core/models/business.model';

function makeJob(overrides: Partial<BusinessJob> = {}): BusinessJob {
  return {
    id: '5',
    reference: 'FL-2026-000123',
    source: 'INTERNAL',
    status: 'REQUESTED',
    businessId: '1',
    business: { id: '1', businessName: 'Ubuntu Plumbing Co.' },
    customerId: '3',
    customer: {
      id: '3',
      firstName: 'Naledi',
      lastName: 'Dlamini',
      displayName: 'Naledi Dlamini',
      email: null,
      phone: null,
    },
    service: { id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' },
    title: null,
    description: 'Geyser is leaking from the pressure valve and the drip tray is overflowing.',
    addressLine1: '12 Protea Street, Randburg',
    city: null,
    province: null,
    postalCode: null,
    priority: 'HIGH',
    scheduledAt: null,
    createdAt: '2026-09-21T09:00:00.000Z',
    updatedAt: '2026-09-21T09:00:00.000Z',
    ...overrides,
  };
}

function makeBoardJob(overrides: Partial<BusinessBoardJob> = {}): BusinessBoardJob {
  return {
    ...makeJob(),
    assignment: null,
    partsOutstanding: 0,
    lastUpdateAt: null,
    ...overrides,
  };
}

const technician: Technician = {
  id: '7',
  businessId: '1',
  userId: '10',
  displayName: 'Bongani Zulu',
  email: 'bongani.zulu@example.co.za',
  phone: '+27825550109',
  isActive: true,
  createdAt: '2026-08-22T09:00:00.000Z',
  updatedAt: '2026-08-22T09:00:00.000Z',
};

const boardSummary: BusinessBoardSummary = {
  total: 4,
  requested: 1,
  assigned: 2,
  scheduled: 1,
  inProgress: 1,
  awaitingParts: 1,
  completed: 0,
  cancelled: 0,
  history: 0,
};

function pageOf(items: BusinessBoardJob[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

describe('BusinessJobsListComponent — Stage 7G job board', () => {
  let fixture: ComponentFixture<BusinessJobsListComponent>;

  async function setup(options: {
    listBoardJobs?: ReturnType<typeof vi.fn>;
    listTechnicians?: ReturnType<typeof vi.fn>;
    getBusinessBoardSummary?: ReturnType<typeof vi.fn>;
  } = {}): Promise<{
    listBoardJobs: ReturnType<typeof vi.fn>;
  }> {
    const listBoardJobs =
      options.listBoardJobs ?? vi.fn().mockReturnValue(of(pageOf([makeBoardJob()])));
    const listTechnicians =
      options.listTechnicians ?? vi.fn().mockReturnValue(of({ items: [technician], total: 1 }));
    const getBusinessBoardSummary =
      options.getBusinessBoardSummary ?? vi.fn().mockReturnValue(of(boardSummary));
    await TestBed.configureTestingModule({
      imports: [BusinessJobsListComponent],
      providers: [
        provideRouter([]),
        { provide: BusinessService, useValue: { listBoardJobs, listTechnicians, getBusinessBoardSummary } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(BusinessJobsListComponent);
    fixture.detectChanges();
    return { listBoardJobs };
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function tabButton(label: string): HTMLButtonElement {
    const buttons = [...fixture.nativeElement.querySelectorAll('nav button')] as HTMLButtonElement[];
    const found = buttons.find((button) => (button.textContent ?? '').includes(label));
    if (!found) throw new Error(`board tab not found: ${label}`);
    return found;
  }

  it('shows the loading state while jobs load', async () => {
    const { defer } = await import('rxjs');
    let resolve!: (value: ReturnType<typeof pageOf>) => void;
    const pending = new Promise<ReturnType<typeof pageOf>>((accept) => (resolve = accept));
    // A deferred observable keeps the component in its loading state
    // until the promise resolves.
    await setup({ listBoardJobs: vi.fn().mockReturnValue(defer(() => pending)) });
    expect((fixture.nativeElement.textContent as string)).toContain('Loading jobs…');
    resolve(pageOf([makeBoardJob()]));
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('FL-2026-000123');
  });

  it('lists internal jobs with status, customer, service, date, priority and source', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000123');
    expect(text).toContain('Requested');
    expect(text).toContain('INTERNAL');
    expect(text).toContain('Naledi Dlamini');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('High');
  });

  it('shows the empty state when there are no jobs', async () => {
    await setup({ listBoardJobs: vi.fn().mockReturnValue(of(pageOf([], 0))) });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('No internal jobs yet');
    expect(text).toContain('Create internal job');
  });

  it('shows the error state when loading fails', async () => {
    await setup({ listBoardJobs: vi.fn().mockReturnValue(throwError(() => new Error('down'))) });
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });

  it('shows operational assignment info without inline assignment controls', async () => {
    await setup({
      listBoardJobs: vi.fn().mockReturnValue(
        of(
          pageOf([
            makeBoardJob({
              status: 'IN_PROGRESS',
              assignment: {
                id: '2',
                jobId: '5',
                businessId: '1',
                technician: {
                  id: '7',
                  displayName: 'Bongani Zulu',
                  email: 'bongani.zulu@example.co.za',
                  phone: '+27825550109',
                  isActive: true,
                },
                assignedBy: '1',
                assignedAt: '2026-09-22T09:00:00.000Z',
              },
              lastUpdateAt: '2026-09-23T10:00:00.000Z',
            }),
          ]),
        ),
      ),
    });
    const text = fixture.nativeElement.textContent as string;
    // Operational info is visible on the card …
    expect(text).toContain('Technician: Bongani Zulu');
    expect(text).toContain('Assigned 2026-09-22T09:00:00.000Z');
    expect(text).toContain('Last work update 2026-09-23T10:00:00.000Z');
    // … but assignment happens in the job detail screen, never inline.
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    expect(buttons.some((button) => /assign technician/i.test(button.textContent ?? ''))).toBe(false);
  });

  it('renders board tabs with operational counts', async () => {
    await setup();
    const nav = (fixture.nativeElement.querySelector('nav[aria-label="Job board categories"]') as HTMLElement)
      .textContent as string;
    expect(nav).toContain('All jobs');
    expect(nav).toContain('New');
    expect(nav).toContain('Assigned');
    expect(nav).toContain('Scheduled');
    expect(nav).toContain('In progress');
    expect(nav).toContain('Awaiting parts');
    expect(nav).toContain('Completed');
    expect(nav).toContain('Cancelled');
    expect(nav).toContain('History');
    expect(nav).toContain('(4)');
    expect(nav).toContain('(2)');
  });

  it('selecting a board tab reloads with the board filter', async () => {
    const { listBoardJobs } = await setup();
    listBoardJobs.mockReturnValue(of(pageOf([], 0)));
    tabButton('Awaiting parts').click();
    fixture.detectChanges();
    expect(listBoardJobs).toHaveBeenLastCalledWith(
      expect.objectContaining({ board: 'AWAITING_PARTS', page: 1, pageSize: 20 }),
    );
    expect((fixture.nativeElement.textContent as string)).toContain('No jobs in this view yet');
  });

  it('selecting the history tab reloads with the history filter', async () => {
    const { listBoardJobs } = await setup();
    listBoardJobs.mockReturnValue(of(pageOf([], 0)));
    tabButton('History').click();
    fixture.detectChanges();
    expect(listBoardJobs).toHaveBeenLastCalledWith(expect.objectContaining({ board: 'HISTORY' }));
  });

  it('sends technician, priority, date-range, sort and search filters', async () => {
    const { listBoardJobs } = await setup();
    const component = fixture.componentInstance as unknown as {
      technicianId: { set(value: string): void };
      priority: { set(value: string): void };
      from: { set(value: string): void };
      to: { set(value: string): void };
      sort: { set(value: string): void };
      search: { set(value: string): void };
      applyFilters(): void;
    };
    listBoardJobs.mockClear();
    component.technicianId.set('7');
    component.priority.set('HIGH');
    component.from.set('2026-09-01');
    component.to.set('2026-09-30');
    component.sort.set('PRIORITY');
    component.search.set('Naledi');
    component.applyFilters();
    expect(listBoardJobs).toHaveBeenCalledWith({
      technicianId: '7',
      priority: 'HIGH',
      from: '2026-09-01',
      to: '2026-09-30',
      sort: 'PRIORITY',
      search: 'Naledi',
      page: 1,
      pageSize: 20,
    });
  });

  it('shows the awaiting-parts badge with outstanding materials', async () => {
    await setup({
      listBoardJobs: vi.fn().mockReturnValue(
        of(pageOf([makeBoardJob({ status: 'AWAITING_PARTS', partsOutstanding: 2 })])),
      ),
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Awaiting parts');
    expect(text).toContain('2 parts outstanding');
  });

  it('shows unassigned jobs without an assignment date', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Technician: Unassigned');
    expect(text).not.toContain('Assigned 20');
  });

  it('paginates through board results', async () => {
    const { listBoardJobs } = await setup({
      listBoardJobs: vi
        .fn()
        .mockReturnValueOnce(of({ items: [makeBoardJob()], total: 2, page: 1, pageSize: 1 }))
        .mockReturnValueOnce(of({ items: [makeBoardJob({ id: '6', reference: 'FL-2026-000124' })], total: 2, page: 2, pageSize: 1 })),
    });
    const buttons = [...fixture.nativeElement.querySelectorAll('button')] as HTMLButtonElement[];
    const next = buttons.find((button) => (button.textContent ?? '').trim() === 'Next');
    next?.click();
    fixture.detectChanges();
    expect(listBoardJobs).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }));
    expect((fixture.nativeElement.textContent as string)).toContain('FL-2026-000124');
  });

  it('links each board row to the existing job detail screen', async () => {
    await setup();
    const link = fixture.nativeElement.querySelector('a[href="/business/jobs/5"]') as HTMLAnchorElement | null;
    expect(link).not.toBeNull();
    expect(link?.textContent).toContain('FL-2026-000123');
  });
});
