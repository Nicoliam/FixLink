import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ProviderRequestsComponent } from './requests';
import { JobService } from '../../core/services/job.service';
import type { ProviderRequest } from '../../core/models/job.model';

const item: ProviderRequest = {
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

describe('ProviderRequestsComponent', () => {
  let fixture: ComponentFixture<ProviderRequestsComponent>;

  async function setup(listProviderRequests: ReturnType<typeof vi.fn>): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ProviderRequestsComponent],
      providers: [provideRouter([]), { provide: JobService, useValue: { listProviderRequests } }],
    }).compileComponents();
    fixture = TestBed.createComponent(ProviderRequestsComponent);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('lists addressed requests with customer, location and status', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [item], total: 1, page: 1, pageSize: 20 })));
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('FL-2026-000003');
    expect(text).toContain('Leak Repair & Pipe Fixes');
    expect(text).toContain('Thandi K.');
    expect(text).toContain('Requested');
  });

  it('shows the empty state when there are no requests', async () => {
    await setup(vi.fn().mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 20 })));
    expect((fixture.nativeElement.textContent as string)).toContain('No requests yet');
  });

  it('shows the error state when loading fails', async () => {
    await setup(vi.fn().mockReturnValue(throwError(() => new Error('down'))));
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
  });
});
