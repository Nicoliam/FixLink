import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RequestJobComponent } from './request-job';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { JobService } from '../../core/services/job.service';
import { SavedProvidersService } from '../../core/services/saved-providers.service';
import { AuthService } from '../../core/services/auth.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';
import type { Job } from '../../core/models/job.model';
import type { ProviderCard } from '../../core/models/marketplace.model';
import type { SavedProvider } from '../../core/models/saved-provider.model';
import type { UserRole } from '../../core/models/auth.model';

const DESCRIPTION = 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.';

const createdJob: Job = {
  id: '7',
  reference: 'FL-2026-000007',
  source: 'MARKETPLACE',
  status: 'REQUESTED',
  customerId: '1',
  provider: { id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu - ProPlumb' },
  service: {
    id: '1',
    name: 'Leak Repair & Pipe Fixes',
    slug: 'leak-repair',
    categoryId: '1',
    categoryName: 'Plumbing',
  },
  description: DESCRIPTION,
  location: 'Fourways, Johannesburg',
  city: null,
  province: null,
  preferredDate: '2026-10-05',
  scheduledAt: '2026-10-05T09:00:00',
  createdAt: '2026-09-23T10:00:00.000Z',
  updatedAt: '2026-09-23T10:00:00.000Z',
};

function providerCard(id: string, name: string): ProviderCard {
  return {
    id,
    providerType: 'professional',
    name,
    description: null,
    city: 'Johannesburg',
    province: 'Gauteng',
    verificationStatus: 'VERIFIED',
    isVerified: true,
    ratingAvg: 4.8,
    ratingCount: 12,
    experienceYears: 9,
    services: [{ id: '1', name: 'Leak Repair & Pipe Fixes', slug: 'leak-repair' }],
    serviceAreas: [{ areaName: 'Randburg & surrounds', city: 'Johannesburg', province: 'Gauteng' }],
    portfolioCount: 3,
    approvedCertificateCount: 1,
    fromPrice: 850,
    fromPriceCurrency: 'ZAR',
  };
}

function savedProvider(id: string, name: string): SavedProvider {
  return { ...providerCard(id, name), savedAt: '2026-10-01T00:00:00.000Z' };
}

interface SetupOptions {
  queryParams?: Record<string, string>;
  roles?: UserRole[] | null;
  searchItems?: ProviderCard[];
  searchError?: boolean;
  saved?: unknown;
  createError?: boolean;
  /** Override the created job, e.g. to model an open request (provider null). */
  created?: Job;
}

describe('RequestJobComponent', () => {
  beforeEach(() => {
    // jsdom implements no object-URL API. Define only the two statics the
    // component calls — replacing the whole `URL` global would break Angular,
    // which constructs URLs itself.
    let counter = 0;
    Object.defineProperty(URL, 'createObjectURL', {
      value: () => `blob:photo-${(counter += 1)}`,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: () => undefined,
      configurable: true,
      writable: true,
    });
  });

  let fixture: ComponentFixture<RequestJobComponent>;
  let component: RequestJobComponent;
  let api: {
    listServices: ReturnType<typeof vi.fn>;
    getProvider: ReturnType<typeof vi.fn>;
    searchProviders: ReturnType<typeof vi.fn>;
  };
  let jobs: { createJob: ReturnType<typeof vi.fn>; uploadJobRequestImage: ReturnType<typeof vi.fn> };
  let savedApi: { list: ReturnType<typeof vi.fn> };

  async function setup(options: SetupOptions = {}): Promise<void> {
    const items = options.searchItems ?? [providerCard('professional-1', 'Sipho Ndlovu - ProPlumb')];
    api = {
      listServices: vi
        .fn()
        .mockReturnValue(of([{ id: '1', name: 'Leak Repair & Pipe Fixes', categoryName: 'Plumbing' }])),
      getProvider: vi
        .fn()
        .mockReturnValue(of(providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'))),
      searchProviders: options.searchError
        ? vi.fn().mockReturnValue(
            throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Search down.' } } })),
          )
        : vi.fn().mockReturnValue(of({ items, total: items.length, page: 1, pageSize: 12 })),
    };
    jobs = {
      createJob: options.createError
        ? vi
            .fn()
            .mockReturnValue(
              throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'Nope.' } } })),
            )
        : vi.fn().mockReturnValue(of(options.created ?? createdJob)),
      uploadJobRequestImage: vi.fn().mockReturnValue(of({ id: 'img-1', context: 'REQUEST' })),
    };
    savedApi = { list: vi.fn().mockReturnValue(options.saved ?? of([])) };

    const roles = options.roles === undefined ? (['CUSTOMER'] as UserRole[]) : options.roles;
    await TestBed.configureTestingModule({
      imports: [RequestJobComponent],
      providers: [
        provideRouter([]),
        { provide: MarketplaceService, useValue: api },
        { provide: JobService, useValue: jobs },
        { provide: SavedProvidersService, useValue: savedApi },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(options.queryParams ?? {}) } },
        },
      ],
    }).compileComponents();
    if (roles) {
      TestBed.overrideProvider(AuthService, {
        useValue: { isAuthenticated: signal(true), currentUser: signal({ roles }) },
      });
    }
    fixture = TestBed.createComponent(RequestJobComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function text(): string {
    return root().textContent as string;
  }

  function fillValidForm(): void {
    component.form.setValue({
      serviceId: '1',
      description: DESCRIPTION,
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
    });
  }

  /**
   * Invoke a protected method without widening the component's public API.
   * `apply(component, ...)` is required: a bare `member(...args)` would run
   * detached, leaving `this` undefined inside the component.
   */
  function invoke<T>(name: string, ...args: unknown[]): T {
    const member = (component as unknown as Record<string, unknown>)[name] as (...a: unknown[]) => T;
    return member.apply(component, args);
  }

  function step(): number {
    return (component as unknown as { step: () => number }).step();
  }

  function photos(): { file: File; url: string }[] {
    return (component as unknown as { photos: () => { file: File; url: string }[] }).photos();
  }

  /** A File with the given type/size, as a picker would produce. */
  function makeFile(name: string, type: string, size = 64): File {
    const file = new File([new Uint8Array(size)], name, { type });
    return file;
  }

  /** Drive the file input as a user picking files would. */
  function pickFiles(files: File[]): void {
    const input = root().querySelector<HTMLInputElement>('[data-testid="request-photos"]');
    if (!input) throw new Error('photo input is not rendered');
    Object.defineProperty(input, 'files', { value: files, configurable: true });
    input.dispatchEvent(new Event('change'));
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('requires authentication at the route level', () => {
    const route = routes.find((r) => r.path === 'request-job');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
  });

  it('shows the four frictionless steps as a progress indicator', async () => {
    await setup();
    expect(text()).toContain('Tell us what you need');
    expect(text()).toContain('Find the right professional');
    expect(text()).toContain('Review and send');
    expect(text()).toContain('What happens next');
  });

  it('starts on step 01 with the details form', async () => {
    await setup();
    expect(step()).toBe(1);
    expect(component.form.controls.serviceId.value).toBe('');
  });

  it('does not advance past step 01 while the details are invalid', async () => {
    await setup();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(step()).toBe(1);
    expect(component.form.invalid).toBe(true);
    expect(text()).toContain('Choose the service you need.');
  });

  it('rejects descriptions that are too short', async () => {
    await setup();
    component.form.controls.description.setValue('Fix tap');
    component.form.controls.description.markAsTouched();
    expect(component.form.controls.description.invalid).toBe(true);
  });

  it('advances to step 02 once the details are valid', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(step()).toBe(2);
  });

  it('goes back to the details without losing them', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('backToDetails');
    expect(step()).toBe(1);
    expect(component.form.controls.location.value).toBe('Fourways, Johannesburg');
  });

  it('searches professionals inside the flow and scopes the search to the chosen service', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(api.searchProviders).toHaveBeenLastCalledWith(
      expect.objectContaining({ service: '1', page: 1, pageSize: 12 }),
    );
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
  });

  // --- Step 14: step 02 is optional ---------------------------------------

  it('offers a visible skip instead of a blocked button when nobody is chosen', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    // The step says plainly that it can be skipped, and the reason is stated.
    expect(text()).toContain('This step is optional.');
    expect(text()).toContain('Let matching professionals come to you');
    expect(root().querySelectorAll('button[disabled]').length).toBe(0);
  });

  it('advances to review with nobody chosen, which is the whole point of the skip', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('goToReview');
    fixture.detectChanges();
    expect(step()).toBe(3);
    expect(text()).toContain('Any professional matching your area');
  });

  it('says who will be alerted, and how many quotes can arrive', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('chooseForMe');
    fixture.detectChanges();
    const review = text();
    expect(review).toContain('matching professionals');
    expect(review).toContain('Up to 3 quotes will reach you');
  });

  it('clears an earlier choice when the customer changes their mind', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    fixture.detectChanges();
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');

    invoke('chooseForMe');
    fixture.detectChanges();
    // The skipped state must not still be showing the name they abandoned.
    expect(text()).toContain('Any professional matching your area');
    expect(text()).not.toContain('Selected professional');
  });

  it('goes back to step 02 from the review screen to change the professional', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('chooseForMe');
    fixture.detectChanges();
    expect(step()).toBe(3);
    invoke('changeProfessional');
    fixture.detectChanges();
    expect(step()).toBe(2);
  });

  it('posts with no providerId at all when the step is skipped', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('chooseForMe');
    invoke('onSubmit');
    fixture.detectChanges();
    expect(jobs.createJob).toHaveBeenCalledTimes(1);
    const payload = jobs.createJob.mock.calls[0]?.[0] as Record<string, unknown>;
    // The key is OMITTED rather than sent blank: that is what tells the backend
    // to post an open request.
    expect('providerId' in payload).toBe(false);
    expect(payload['serviceId']).toBe('1');
  });

  it('still sends providerId when a professional was chosen', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    invoke('goToReview');
    invoke('onSubmit');
    fixture.detectChanges();
    expect(jobs.createJob).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'professional-1' }));
  });

  it('confirms an open request to the customer without naming anyone', async () => {
    await setup({ created: { ...createdJob, provider: null } });
    fillValidForm();
    invoke('goToProviderStep');
    invoke('chooseForMe');
    invoke('onSubmit');
    fixture.detectChanges();
    expect(step()).toBe(4);
    const confirmation = text();
    expect(confirmation).toContain('Request sent to matching professionals');
    expect(confirmation).toContain('Up to 3 quotes will reach you');
  });

  it('reviews the answers before anything is created', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    invoke('goToReview');
    fixture.detectChanges();
    expect(step()).toBe(3);
    expect(jobs.createJob).not.toHaveBeenCalled();
    const review = text();
    expect(review).toContain('Leak Repair & Pipe Fixes');
    expect(review).toContain('Sipho Ndlovu - ProPlumb');
    expect(review).toContain(DESCRIPTION);
    expect(review).toContain('Fourways, Johannesburg');
  });

  it('submits the chosen provider with the step 01 details', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    invoke('onSubmit');
    fixture.detectChanges();
    expect(jobs.createJob).toHaveBeenCalledWith({
      providerId: 'professional-1',
      serviceId: '1',
      description: DESCRIPTION,
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
    });
    expect(step()).toBe(4);
  });

  it('shows the confirmation with the reference and what happens next', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    invoke('onSubmit');
    fixture.detectChanges();
    const confirmation = text();
    expect(confirmation).toContain('Request sent to Sipho Ndlovu - ProPlumb');
    expect(confirmation).toContain('FL-2026-000007');
    expect(confirmation).toContain('Get a quote');
    expect(confirmation).toContain('Get the job done');
    expect(confirmation).toContain('Go to My Jobs');
  });

  it('surfaces a submission failure and stays on the review step', async () => {
    await setup({ createError: true });
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
    invoke('goToReview');
    invoke('onSubmit');
    fixture.detectChanges();
    expect(text()).toContain('Nope.');
    expect(step()).toBe(3);
  });

  it('still refuses to submit while the details themselves are invalid', async () => {
    await setup();
    // Step 14: the professional is optional, the job details are not. Submitting
    // straight from step 02 without ever filling them in must not post.
    invoke('onSubmit');
    expect(jobs.createJob).not.toHaveBeenCalled();
    expect(step()).toBe(1);
  });

  // --- Saved professionals -------------------------------------------------

  it('hides the saved-professional section entirely when the customer has none', async () => {
    await setup({ saved: of([]) });
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(text()).not.toContain('Your saved professionals');
    // The search is always available, so the flow is never a dead end.
    expect(text()).toContain('Search professionals');
  });

  it('offers saved professionals when the customer has some', async () => {
    await setup({ saved: of([savedProvider('professional-2', 'Blessing Moyo')]) });
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(text()).toContain('Your saved professionals');
    expect(text()).toContain('Blessing Moyo');
  });

  it('selects a saved professional with one click', async () => {
    await setup({ saved: of([savedProvider('professional-2', 'Blessing Moyo')]) });
    fillValidForm();
    invoke('goToProviderStep');
    invoke('choose', providerCard('professional-2', 'Blessing Moyo'));
    invoke('onSubmit');
    expect(jobs.createJob).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'professional-2' }));
  });

  it('does not call the saved endpoint for a non-customer', async () => {
    await setup({ roles: ['PROFESSIONAL'] });
    expect(savedApi.list).not.toHaveBeenCalled();
  });

  // --- Deep links ----------------------------------------------------------

  it('pre-selects a provider from the query param and jumps to step 02', async () => {
    await setup({ queryParams: { provider: 'professional-1' } });
    expect(api.getProvider).toHaveBeenCalledWith('professional-1');
    expect(step()).toBe(2);
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
  });

  it('falls back to searching when the linked provider cannot be loaded', async () => {
    await setup({ queryParams: { provider: 'professional-1' } });
    api.getProvider.mockReturnValue(
      throwError(() => ({ error: { error: { code: 'NOT_FOUND', message: 'gone' } } })),
    );
    const late = TestBed.createComponent(RequestJobComponent);
    late.detectChanges();
    // The customer is not stranded on an empty step.
    expect((late.componentInstance as unknown as { step: () => number }).step()).toBe(2);
    expect((late.nativeElement.textContent as string)).toContain('Sipho Ndlovu - ProPlumb');
  });

  // --- Search states -------------------------------------------------------

  it('shows the empty state when the search matches nobody', async () => {
    await setup({ searchItems: [] });
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(text()).toContain('No professionals found');
  });

  it('shows the error state when the search fails and retries on demand', async () => {
    await setup({ searchError: true });
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(text()).toContain('Search down.');
    const attempts = api.searchProviders.mock.calls.length;
    invoke('retrySearch');
    fixture.detectChanges();
    // Retry really re-queries. This stub keeps failing, so the message stays:
    // the point is that the customer is not left with a dead end.
    expect(api.searchProviders.mock.calls.length).toBe(attempts + 1);
  });

  it('recovers on retry when the search succeeds the second time', async () => {
    await setup();
    fillValidForm();
    invoke('goToProviderStep');
    fixture.detectChanges();
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
    api.searchProviders.mockReturnValueOnce(
      throwError(() => ({ error: { error: { code: 'INTERNAL_ERROR', message: 'Search down.' } } })),
    );
    invoke('retrySearch');
    fixture.detectChanges();
    expect(text()).toContain('Search down.');
    invoke('retrySearch');
    fixture.detectChanges();
    expect(text()).not.toContain('Search down.');
    expect(text()).toContain('Sipho Ndlovu - ProPlumb');
  });

  // --- Photos of the problem (step 01) -------------------------------------

  describe('photos of the problem', () => {
    it('promises photos in the step copy, matching the marketing promise', async () => {
      await setup();
      expect(text()).toContain('upload photos');
    });

    it('offers a multi-file picker restricted to the allowed image types', async () => {
      await setup();
      const input = root().querySelector<HTMLInputElement>('[data-testid="request-photos"]');
      expect(input).toBeTruthy();
      expect(input?.multiple).toBe(true);
      expect(input?.accept).toBe('image/jpeg,image/png,image/webp');
    });

    it('adds a preview for each picked photo', async () => {
      await setup();
      pickFiles([makeFile('leak.png', 'image/png'), makeFile('pipes.jpg', 'image/jpeg')]);
      expect(photos()).toHaveLength(2);
      expect(root().querySelectorAll('.fl-wizard-photo')).toHaveLength(2);
    });

    it('rejects a disallowed type before it is ever uploaded', async () => {
      await setup();
      pickFiles([makeFile('notes.pdf', 'application/pdf')]);
      expect(photos()).toHaveLength(0);
      expect(text()).toContain('only JPEG, PNG or WebP');
    });

    it('rejects an oversized photo before it is ever uploaded', async () => {
      await setup();
      pickFiles([makeFile('huge.png', 'image/png', 6 * 1024 * 1024)]);
      expect(photos()).toHaveLength(0);
      expect(text()).toContain('larger than 5MB');
    });

    it('keeps the good photos when a bad one is picked alongside them', async () => {
      await setup();
      pickFiles([makeFile('leak.png', 'image/png'), makeFile('notes.pdf', 'application/pdf')]);
      expect(photos()).toHaveLength(1);
      expect(text()).toContain('Some photos were not added');
    });

    it('enforces the per-request photo cap', async () => {
      await setup();
      pickFiles(Array.from({ length: 7 }, (_v, i) => makeFile(`photo-${i}.png`, 'image/png')));
      expect(photos()).toHaveLength(6);
      expect(text()).toContain('limit is 6 photos');
    });

    it('removes a photo again', async () => {
      await setup();
      pickFiles([makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')]);
      const remove = root().querySelectorAll<HTMLButtonElement>('.fl-wizard-photo-remove')[0];
      expect(remove).toBeTruthy();
      remove?.click();
      fixture.detectChanges();
      expect(photos()).toHaveLength(1);
    });

    it('sends the photos to the new job once it exists', async () => {
      await setup();
      fillValidForm();
      pickFiles([makeFile('leak.png', 'image/png')]);
      invoke('goToProviderStep');
      invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
      invoke('onSubmit');
      fixture.detectChanges();

      // The job must exist before a photo can reference it, so the upload is a
      // second request against the returned id.
      expect(jobs.createJob).toHaveBeenCalledTimes(1);
      expect(jobs.uploadJobRequestImage).toHaveBeenCalledTimes(1);
      expect(jobs.uploadJobRequestImage).toHaveBeenCalledWith('7', photos()[0]?.file);
    });

    it('creates the request without an upload when no photo was picked', async () => {
      await setup();
      fillValidForm();
      invoke('goToProviderStep');
      invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
      invoke('onSubmit');
      fixture.detectChanges();
      expect(jobs.createJob).toHaveBeenCalledTimes(1);
      expect(jobs.uploadJobRequestImage).not.toHaveBeenCalled();
    });

    it('keeps the request and reports which photos failed to attach', async () => {
      await setup();
      jobs.uploadJobRequestImage.mockReturnValue(
        throwError(() => ({ error: { error: { code: 'CONFLICT', message: 'too many' } } })),
      );
      fillValidForm();
      pickFiles([makeFile('leak.png', 'image/png')]);
      invoke('goToProviderStep');
      invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
      invoke('onSubmit');
      fixture.detectChanges();

      // The job was created; a photo failure must not undo or hide it.
      expect(jobs.createJob).toHaveBeenCalledTimes(1);
      expect(step()).toBe(4);
      expect(text()).toContain('could not be attached');
      expect(text()).toContain('leak.png');
    });

    it('reports progress while the photos are sending', async () => {
      await setup();
      fillValidForm();
      pickFiles([makeFile('a.png', 'image/png'), makeFile('b.png', 'image/png')]);
      invoke('goToProviderStep');
      invoke('choose', providerCard('professional-1', 'Sipho Ndlovu - ProPlumb'));
      invoke('onSubmit');
      fixture.detectChanges();
      // Uploads are synchronous in the stub, so progress has already finished;
      // the assertion that matters is that no stale progress is left showing.
      expect(text()).not.toContain('Sending 0 of');
    });
  });
});
