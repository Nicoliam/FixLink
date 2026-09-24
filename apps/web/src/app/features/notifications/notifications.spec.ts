import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { NotificationsComponent } from './notifications';
import { NotificationService } from '../../core/services/notification.service';
import { AuthService } from '../../core/services/auth.service';
import { authGuard } from '../../core/guards/auth.guard';
import { routes } from '../../app.routes';
import type { NotificationItem, NotificationList } from '../../core/models/notification.model';

const unread: NotificationItem = {
  id: '1',
  type: 'JOB_REQUEST',
  title: 'New job request',
  message: 'Leak Repair & Pipe Fixes requested at Fourways, Johannesburg (FL-2026-000001).',
  relatedJobId: '9',
  relatedEntityType: 'JOB',
  relatedEntityId: '9',
  read: false,
  createdAt: '2026-09-24T10:00:00.000Z',
  readAt: null,
};

const read: NotificationItem = {
  ...unread,
  id: '2',
  type: 'QUOTE_RECEIVED',
  title: 'New quote received',
  read: true,
  createdAt: '2026-09-23T10:00:00.000Z',
  readAt: '2026-09-23T11:00:00.000Z',
};

function listResponse(items: NotificationItem[], total = items.length): NotificationList {
  return { items, total, page: 1, pageSize: 20 };
}

describe('NotificationsComponent', () => {
  let fixture: ComponentFixture<NotificationsComponent>;
  let api: {
    list: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
    markAllRead: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  async function setup(roles: string[] = ['CUSTOMER']): Promise<void> {
    api = {
      list: vi.fn().mockReturnValue(of(listResponse([unread, read]))),
      markRead: vi.fn().mockReturnValue(of({ ...unread, read: true })),
      markAllRead: vi.fn().mockReturnValue(of(1)),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ roles }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
  }

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('is protected by the auth guard', () => {
    const route = routes.find((r) => r.path === 'notifications');
    expect(route).toBeDefined();
    expect(route?.canActivate).toContain(authGuard);
  });

  it('lists notifications with title, message, type and unread styling', async () => {
    await setup();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('New job request');
    expect(text).toContain('Leak Repair & Pipe Fixes requested');
    expect(text).toContain('Job request');
    const unreaded = fixture.nativeElement.querySelectorAll('.fl-notification-unread');
    expect(unreaded.length).toBe(1);
  });

  it('shows the empty state when no notifications exist', async () => {
    api = {
      list: vi.fn().mockReturnValue(of(listResponse([]))),
      markRead: vi.fn(),
      markAllRead: vi.fn().mockReturnValue(of(0)),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ roles: ['CUSTOMER'] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('No notifications yet');
  });

  it('shows the error state when loading fails and retries', async () => {
    api = {
      list: vi.fn().mockReturnValue(throwError(() => new Error('down'))),
      markRead: vi.fn(),
      markAllRead: vi.fn(),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ roles: ['CUSTOMER'] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('Something went wrong');
    api.list.mockReturnValue(of(listResponse([unread])));
    (fixture.nativeElement.querySelector('button.fl-btn-primary') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect((fixture.nativeElement.textContent as string)).toContain('New job request');
  });

  it('toggles the unread-only filter', async () => {
    await setup();
    const toggle = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((el) => (el as HTMLButtonElement).textContent?.includes('unread')) as HTMLButtonElement;
    toggle.click();
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(1, 20, true);
  });

  it('marks all read and reloads', async () => {
    await setup();
    const button = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((el) => (el as HTMLButtonElement).textContent?.includes('Mark all as read')) as HTMLButtonElement;
    button.click();
    fixture.detectChanges();
    expect(api.markAllRead).toHaveBeenCalledOnce();
  });

  it('opens an unread notification via mark-read then navigates to the customer job', async () => {
    await setup(['CUSTOMER']);
    const open = fixture.nativeElement.querySelector('.fl-notification-open') as HTMLButtonElement;
    open.click();
    fixture.detectChanges();
    expect(api.markRead).toHaveBeenCalledWith('1');
    expect(router.navigate).toHaveBeenCalledWith(['/my-jobs', '9']);
  });

  it('opens a read notification without a mark-read call', async () => {
    await setup(['TECHNICIAN']);
    const buttons = fixture.nativeElement.querySelectorAll('.fl-notification-open');
    (buttons[1] as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(api.markRead).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/technician/jobs', '9']);
  });

  it('routes business roles to the business job detail for internal jobs', async () => {
    api = {
      list: vi.fn().mockReturnValue(
        of(listResponse([{ ...unread, relatedEntityType: 'INTERNAL_JOB', type: 'TECHNICIAN_ASSIGNED' }])),
      ),
      markRead: vi.fn().mockReturnValue(of({ ...unread, read: true })),
      markAllRead: vi.fn().mockReturnValue(of(1)),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ roles: ['BUSINESS_OWNER'] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.fl-notification-open') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(router.navigate).toHaveBeenCalledWith(['/business/jobs', '9']);
  });

  it('paginates forward and back', async () => {
    api = {
      list: vi.fn().mockReturnValue(of({ items: [unread, read], total: 25, page: 1, pageSize: 20 })),
      markRead: vi.fn().mockReturnValue(of({ ...unread, read: true })),
      markAllRead: vi.fn().mockReturnValue(of(1)),
    };
    await TestBed.configureTestingModule({
      imports: [NotificationsComponent],
      providers: [
        provideRouter([]),
        { provide: NotificationService, useValue: api },
        { provide: AuthService, useValue: { currentUser: signal({ roles: ['CUSTOMER'] }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NotificationsComponent);
    fixture.detectChanges();
    api.list.mockReturnValue(of({ items: [unread], total: 25, page: 2, pageSize: 20 }));
    const next = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ).find((el) => (el as HTMLButtonElement).textContent?.trim() === 'Next') as HTMLButtonElement;
    next.click();
    fixture.detectChanges();
    expect(api.list).toHaveBeenLastCalledWith(2, 20, false);
  });
});
