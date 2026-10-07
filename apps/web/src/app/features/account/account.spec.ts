import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AccountComponent } from './account';
import { AuthService } from '../../core/services/auth.service';
import { JobService } from '../../core/services/job.service';
import { BusinessService } from '../../core/services/business.service';
import { TechnicianService } from '../../core/services/technician.service';
import type { Job } from '../../core/models/job.model';
import type { UserRole } from '../../core/models/auth.model';

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: '7',
    reference: 'FL-2026-000007',
    source: 'MARKETPLACE',
    status: 'REQUESTED',
    customerId: '1',
    provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu' },
    service: {
      id: '1',
      name: 'Leak Repair & Pipe Fixes',
      slug: 'leak-repair',
      categoryId: '1',
      categoryName: 'Plumbing',
    },
    description: 'Kitchen mixer tap leaking.',
    location: 'Fourways, Johannesburg',
    city: null,
    province: null,
    preferredDate: '2026-10-05',
    scheduledAt: null,
    createdAt: '2026-09-23T10:00:00.000Z',
    updatedAt: '2026-09-23T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * The Account page overview cards.
 *
 * The cards are now interactive, so the things worth locking down are: each one
 * is a real anchor to the right list for the role (a click that goes nowhere is
 * worse than a card that was never clickable), every card is distinguishable
 * without its colour, and "Total spent" is not shown to a professional — they
 * earn through Fixlynk, they do not spend through it, so that card was always
 * a misleading R0.
 */
describe('AccountComponent overview cards', () => {
  let fixture: ComponentFixture<AccountComponent>;

  async function setup(options: {
    roles?: UserRole[];
    jobs?: Job[];
  } = {}): Promise<void> {
    const roles = options.roles ?? ['CUSTOMER'];
    const jobs = options.jobs ?? [job()];
    const jobsApi = {
      listMyJobs: vi.fn().mockReturnValue(of({ items: jobs, total: jobs.length, page: 1, pageSize: 50 })),
      listProviderRequests: vi.fn().mockReturnValue(of({ items: jobs, total: jobs.length, page: 1, pageSize: 20 })),
    };
    await TestBed.configureTestingModule({
      imports: [AccountComponent],
      providers: [
        provideRouter([]),
        { provide: JobService, useValue: jobsApi },
        { provide: BusinessService, useValue: { listBusinessJobs: vi.fn().mockReturnValue(of({ items: [] })) } },
        { provide: TechnicianService, useValue: { listMyJobs: vi.fn().mockReturnValue(of({ items: [] })) } },
      ],
    }).compileComponents();
    TestBed.overrideProvider(AuthService, {
      useValue: { isAuthenticated: signal(true), currentUser: signal({ roles }), logout: vi.fn().mockReturnValue(of(undefined)) },
    });
    fixture = TestBed.createComponent(AccountComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return root().textContent as string;
  }

  function cards(): HTMLAnchorElement[] {
    return Array.from(root().querySelectorAll<HTMLAnchorElement>('.fl-stats-grid .fl-stat'));
  }

  it('renders one card per stat with its value and label', async () => {
    await setup({
      jobs: [
        job({ status: 'REQUESTED' }),
        job({ id: '8', status: 'COMPLETED', agreedAmount: 900 }),
      ],
    });
    const rendered = cards();
    expect(rendered.length).toBe(4); // total, completed, in progress, spent
    expect(text()).toContain('Total jobs');
    expect(text()).toContain('Completed');
    expect(text()).toContain('In progress');
    expect(text()).toContain('Total spent');
  });

  it('makes every card a real anchor, so keyboard and screen readers get a link', async () => {
    await setup();
    const rendered = cards();
    expect(rendered.length).toBeGreaterThan(0);
    for (const card of rendered) {
      expect(card.tagName).toBe('A');
      expect(card.getAttribute('href')).toBeTruthy();
    }
  });

  it('points a customer at their own jobs list', async () => {
    await setup();
    const hrefs = cards().map((c) => c.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(['/my-jobs']));
  });

  it('points a professional at their requests list', async () => {
    await setup({ roles: ['PROFESSIONAL'] });
    const hrefs = cards().map((c) => c.getAttribute('href'));
    expect(new Set(hrefs)).toEqual(new Set(['/requests']));
  });

  it('gives each card a distinct tone, icon and label, so colour is never the only cue', async () => {
    await setup();
    const rendered = cards();
    const tones = rendered.map((c) => c.className.match(/fl-stat--\w+/)?.[0] ?? '');
    const labels = rendered.map((c) => c.querySelector('.fl-stat-label')?.textContent ?? '');
    const icons = rendered.map((c) => c.querySelector('.material-symbols-outlined')?.textContent?.trim() ?? '');
    expect(new Set(tones).size).toBe(rendered.length);
    expect(new Set(labels).size).toBe(rendered.length);
    expect(new Set(icons).size).toBe(rendered.length);
  });

  it('names each card for assistive tech, including the value', async () => {
    await setup({ jobs: [job({ status: 'REQUESTED' })] });
    const total = cards().find((c) => c.textContent?.includes('Total jobs'));
    // Without this the value would not be announced; the visual label alone
    // gives a screen-reader user no number.
    expect(total?.getAttribute('aria-label')).toContain('Total jobs');
    expect(total?.getAttribute('aria-label')).toContain('1');
  });

  it('hides "Total spent" from a professional, who earns rather than spends here', async () => {
    await setup({ roles: ['PROFESSIONAL'] });
    expect(text()).not.toContain('Total spent');
    expect(cards().length).toBe(3);
  });

  it('shows "Total spent" to a customer', async () => {
    await setup({
      jobs: [job({ status: 'COMPLETED', agreedAmount: 1250 })],
    });
    expect(text()).toContain('Total spent');
    expect(text()).toContain('R1,250');
  });

  it('keeps the overview out of the way while loading', async () => {
    await setup();
    // Sanity: the section is labelled for assistive tech rather than relying on
    // the visual heading alone.
    expect(root().querySelector('#fl-overview-heading')?.textContent).toBe('Overview');
  });
});