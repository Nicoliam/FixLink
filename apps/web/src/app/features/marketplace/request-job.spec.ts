import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { RequestJobComponent } from './request-job';
import { MarketplaceService } from '../../core/services/marketplace.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';

describe('RequestJobComponent', () => {
  let fixture: ComponentFixture<RequestJobComponent>;
  let component: RequestJobComponent;

  async function setup(queryParams: Record<string, string> = {}): Promise<void> {
    const api = {
      listServices: vi.fn().mockReturnValue(
        of([{ id: '1', name: 'Leak Repair & Pipe Fixes', categoryName: 'Plumbing' }]),
      ),
      getProvider: vi.fn().mockReturnValue(
        of({ id: 'professional-1', name: 'Sipho Ndlovu — ProPlumb', isVerified: true }),
      ),
    };
    await TestBed.configureTestingModule({
      imports: [RequestJobComponent],
      providers: [
        { provide: MarketplaceService, useValue: api },
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

  it('requires service, description and location before accepting the request', async () => {
    await setup({ provider: 'professional-1' });
    component.onSubmit();
    fixture.detectChanges();
    expect(component.form.invalid).toBe(true);
    expect((fixture.nativeElement.textContent as string)).toContain('Please choose a service.');

    component.form.setValue({
      serviceId: '1',
      description: 'Kitchen mixer tap leaking at the base and the cupboard floor is damp.',
      location: 'Fourways, Johannesburg',
      preferredDate: '2026-10-05',
      photoNote: '',
    });
    component.onSubmit();
    fixture.detectChanges();
    expect(component.form.valid).toBe(true);
    expect((fixture.nativeElement.textContent as string)).toContain('Your request is ready');
  });

  it('rejects descriptions that are too short', async () => {
    await setup();
    component.form.controls.description.setValue('Fix tap');
    component.form.controls.description.markAsTouched();
    expect(component.form.controls.description.invalid).toBe(true);
  });
});
