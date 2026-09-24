import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NotificationService, NOTIFICATION_POLL_INTERVAL_MS } from './notification.service';
import { API_BASE_URL } from '../config/api-config';
import type { NotificationItem } from '../models/notification.model';

const API = 'http://test.local/api/v1';

const item: NotificationItem = {
  id: '3',
  type: 'JOB_REQUEST',
  title: 'New job request',
  message: 'Leak Repair & Pipe Fixes requested at Fourways, Johannesburg (FL-2026-000003).',
  relatedJobId: '9',
  relatedEntityType: 'JOB',
  relatedEntityId: '9',
  read: false,
  createdAt: '2026-09-24T10:00:00.000Z',
  readAt: null,
};

describe('NotificationService', () => {
  let service: NotificationService;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: API_BASE_URL, useValue: API }],
    }).compileComponents();
    service = TestBed.inject(NotificationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    service.stopPolling();
    httpMock.verify();
    TestBed.resetTestingModule();
  });

  it('exposes a modest default poll interval', () => {
    expect(NOTIFICATION_POLL_INTERVAL_MS).toBe(60_000);
  });

  it('lists notifications with pagination and the unread filter', () => {
    let result: unknown = null;
    service.list(2, 10, true).subscribe((list) => (result = list));
    const req = httpMock.expectOne((r) => r.url === `${API}/notifications`);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    expect(req.request.params.get('unreadOnly')).toBe('true');
    req.flush({ success: true, data: { items: [item], total: 1, page: 2, pageSize: 10 }, message: 'ok' });
    expect((result as { total: number }).total).toBe(1);
  });

  it('omits the unread filter when listing everything', () => {
    service.list().subscribe();
    const req = httpMock.expectOne((r) => r.url === `${API}/notifications`);
    expect(req.request.params.has('unreadOnly')).toBe(false);
    req.flush({ success: true, data: { items: [], total: 0, page: 1, pageSize: 20 }, message: 'ok' });
  });

  it('fetches the unread count', () => {
    let result: number | null = null;
    service.fetchUnreadCount().subscribe((count) => (result = count));
    const req = httpMock.expectOne(`${API}/notifications/unread-count`);
    expect(req.request.method).toBe('GET');
    req.flush({ success: true, data: { unreadCount: 4 }, message: 'ok' });
    expect(result).toBe(4);
  });

  it('refreshes the badge signal and keeps the last value on failure', () => {
    service.refreshUnreadCount();
    httpMock.expectOne(`${API}/notifications/unread-count`).flush({
      success: true,
      data: { unreadCount: 2 },
      message: 'ok',
    });
    expect(service.unreadCount()).toBe(2);
    service.refreshUnreadCount();
    httpMock
      .expectOne(`${API}/notifications/unread-count`)
      .error(new ProgressEvent('error'), { status: 401, statusText: 'Unauthorized' });
    expect(service.unreadCount()).toBe(2);
  });

  it('marks one notification read and refreshes the badge', () => {
    let result: unknown = null;
    service.markRead('3').subscribe((updated) => (result = updated));
    const req = httpMock.expectOne(`${API}/notifications/3/read`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { ...item, read: true }, message: 'ok' });
    expect((result as NotificationItem).read).toBe(true);
    httpMock.expectOne(`${API}/notifications/unread-count`).flush({
      success: true,
      data: { unreadCount: 0 },
      message: 'ok',
    });
    expect(service.unreadCount()).toBe(0);
  });

  it('marks all read and zeroes the badge', () => {
    service.unreadCount.set(5);
    let result: number | null = null;
    service.markAllRead().subscribe((marked) => (result = marked));
    const req = httpMock.expectOne(`${API}/notifications/read-all`);
    expect(req.request.method).toBe('POST');
    req.flush({ success: true, data: { markedRead: 5 }, message: 'ok' });
    expect(result).toBe(5);
    expect(service.unreadCount()).toBe(0);
  });
});
