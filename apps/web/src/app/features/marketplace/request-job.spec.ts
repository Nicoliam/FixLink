import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { RequestJobComponent } from './request-job';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { JobService } from '../../core/services/job.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';
import type { Job } from '../../core/models/job.model';

const createdJob: Job = {
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

describe('RequestJobComponent', () => {
  let fixture: ComponentFixture<RequestJobComponent>;
  let component: RequestJobComponent;
  let jobs: { createJob: ReturnType<typeof vi.fn> };

  async function setup(queryParams: Record<string, string> = {}): Promise<void> {
    const api = {
      listServices: vi.fn().mockReturnValue(
        of([{ id: '1', name: 'Leak Repair & Pipe Fixes', categoryName: 'Plumbing' }]),
      ),
      getProvider: vi.fn().mockReturnValue(
        of({ id: 'professional-1', name: 'Sipho Ndlovu — ProPlumb', isVerified: true }),
      ),
    };
    jobs = { createJob: vi.fn().mockReturnValue(of(createdJob)) };
    await TestBed.configureTestingModule({
      imports: [RequestJobComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
        { provide: JobService, useValue: jobs },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(RequestJobComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  function fillValidForm(): void {
    component.form.setValue({
      serviceId: '1',
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
      photoNote: '',
    });
  }

  it('requires authentication at the route level', () => {
    const route = routes.find((r) => r.path === 'request-job');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
  });

  it('shows the selected provider summary from the query param', async () => {
    await setup({ provider: 'professional-1' });
    expect((fixture.nativeElement.textContent as string)).toContain('Sipho Ndlovu — ProPlumb');
  });

  it('prompts marketplace browsing when no provider is selected', async () => {
    await setup();
    expect((fixture.nativeElement.textContent as string)).toContain('No provider selected yet');
  });

  it('requires service, description and location before submitting', async () => {
    await setup({ provider: 'professional-1' });
    component.onSubmit();
    fixture.detectChanges();
    expect(component.form.invalid).toBe(true);
    expect(jobs.createJob).not.toHaveBeenCalled();
    expect((fixture.nativeElement.textContent as string)).toContain('Please choose a service.');
  });

  it('rejects descriptions that are too short', async () => {
    await setup();
    component.form.controls.description.setValue('Fix tap');
    component.form.controls.description.markAsTouched();
    expect(component.form.controls.description.invalid).toBe(true);
  });

  it('submits the request and shows the success state', async () => {
    await setup({ provider: 'professional-1' });
    fillValidForm();
    component.onSubmit();
    fixture.detectChanges();
    expect(jobs.createJob).toHaveBeenCalledWith({
      providerId: 'professional-1',
      serviceId: '1',
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      preferredTime: '14:30',
      notes: '',
    });
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Job request submitted');
    expect(text).toContain('Sipho Ndlovu — ProPlumb');
    expect(text).toContain('Requested');
    expect(text).toContain('Go to My Jobs');
  });

  it('shows an error state when submission fails', async () => {
    await setup({ provider: 'professional-1' });
    jobs.createJob.mockReturnValue(
      throwError(() => ({ error: { error: { code: 'VALIDATION_ERROR', message: 'Nope.' } } })),
    );
    fillValidForm();
    component.onSubmit();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Nope.');
    expect((fixture.nativeElement.textContent as string)).not.toContain('Job request submitted');
  });

  it('blocks submission without a provider', async () => {
    await setup();
    fillValidForm();
    component.onSubmit();
    fixture.detectChanges();
    expect(jobs.createJob).not.toHaveBeenCalled();
    expect((fixture.nativeElement.textContent as string)).toContain('No provider selected yet');
  });
});
