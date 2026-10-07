import {
  formatNotificationTime,
  notificationRouteFor,
  notificationTypeLabel,
} from './notification.model';
import type { NotificationItem } from './notification.model';

const base: NotificationItem = {
  id: '1',
  type: 'JOB_REQUEST',
  title: 'New job request',
  message: 'Leak Repair & Pipe Fixes requested.',
  relatedJobId: '9',
  relatedEntityType: 'JOB',
  relatedEntityId: '9',
  read: false,
  createdAt: '2026-09-24T10:00:00.000Z',
  readAt: null,
};

describe('notification model helpers', () => {
  it('labels every notification type', () => {
    expect(notificationTypeLabel('JOB_REQUEST')).toBe('Job request');
    expect(notificationTypeLabel('JOB_REQUEST_OPEN')).toBe('Open request');
    expect(notificationTypeLabel('QUOTE_RECEIVED')).toBe('Quote received');
    expect(notificationTypeLabel('QUOTE_ACCEPTED')).toBe('Quote accepted');
    expect(notificationTypeLabel('JOB_SCHEDULED')).toBe('Scheduled');
    expect(notificationTypeLabel('JOB_STARTED')).toBe('Started');
    expect(notificationTypeLabel('JOB_COMPLETED')).toBe('Completed');
    expect(notificationTypeLabel('JOB_CONFIRMED')).toBe('Confirmed');
    expect(notificationTypeLabel('TECHNICIAN_ASSIGNED')).toBe('Assigned');
    expect(notificationTypeLabel('TECHNICIAN_REASSIGNED')).toBe('Reassigned');
    expect(notificationTypeLabel('JOB_UPDATE')).toBe('Update');
    expect(notificationTypeLabel('WORK_DOCUMENTED')).toBe('Documented');
    expect(notificationTypeLabel('PARTS_REQUESTED')).toBe('Parts requested');
    expect(notificationTypeLabel('PARTS_APPROVED')).toBe('Parts approved');
    expect(notificationTypeLabel('PARTS_REJECTED')).toBe('Parts rejected');
    expect(notificationTypeLabel('PARTS_MORE_INFO')).toBe('Parts info needed');
    expect(notificationTypeLabel('PARTS_AVAILABLE')).toBe('Parts available');
  });

  it('routes customers to their job detail', () => {
    expect(notificationRouteFor(base, ['CUSTOMER'])).toEqual(['/my-jobs', '9']);
  });

  it('routes technicians to their job detail', () => {
    expect(notificationRouteFor({ ...base, relatedEntityType: 'INTERNAL_JOB' }, ['TECHNICIAN'])).toEqual([
      '/technician/jobs',
      '9',
    ]);
  });

  it('routes business roles to the business detail for internal jobs', () => {
    expect(
      notificationRouteFor({ ...base, relatedEntityType: 'INTERNAL_JOB' }, ['BUSINESS_OWNER']),
    ).toEqual(['/business/jobs', '9']);
    expect(
      notificationRouteFor({ ...base, relatedEntityType: 'INTERNAL_JOB' }, ['BUSINESS_MANAGER']),
    ).toEqual(['/business/jobs', '9']);
  });

  it('routes providers to the marketplace request detail', () => {
    expect(notificationRouteFor(base, ['PROFESSIONAL'])).toEqual(['/requests', '9']);
    expect(notificationRouteFor(base, ['BUSINESS_OWNER'])).toEqual(['/requests', '9']);
  });

  // Step 14 — an open request belongs on the board, not in the inbox.
  it('routes an open-request alert to the board, because the request is not in the inbox yet', () => {
    const alert: NotificationItem = {
      ...base,
      type: 'JOB_REQUEST_OPEN',
      title: 'New job request in your area',
    };
    expect(notificationRouteFor(alert, ['PROFESSIONAL'])).toEqual(['/open-requests', '9']);
    expect(notificationRouteFor(alert, ['BUSINESS_OWNER'])).toEqual(['/open-requests', '9']);
    // A CUSTOMER must never be sent to a provider board, whatever the payload.
    expect(notificationRouteFor(alert, ['CUSTOMER'])).toEqual(['/my-jobs', '9']);
  });

  it('still routes an addressed JOB_REQUEST to the inbox', () => {
    // The two types mean different things and must not collapse into one route.
    expect(notificationRouteFor(base, ['PROFESSIONAL'])).toEqual(['/requests', '9']);
  });

  it('never routes internal jobs to customer screens', () => {
    const route = notificationRouteFor({ ...base, relatedEntityType: 'INTERNAL_JOB' }, ['BUSINESS_MANAGER']);
    expect(route[0]).not.toBe('/my-jobs');
  });

  it('falls back home without a related job', () => {
    expect(notificationRouteFor({ ...base, relatedJobId: null }, ['CUSTOMER'])).toEqual(['/']);
  });

  it('formats relative times deterministically', () => {
    const now = new Date('2026-09-24T12:00:00.000Z').getTime();
    expect(formatNotificationTime('2026-09-24T11:59:30.000Z', now)).toBe('Just now');
    expect(formatNotificationTime('2026-09-24T11:55:00.000Z', now)).toBe('5m ago');
    expect(formatNotificationTime('2026-09-24T10:00:00.000Z', now)).toBe('2h ago');
    expect(formatNotificationTime('2026-09-22T12:00:00.000Z', now)).toBe('2d ago');
    expect(formatNotificationTime('2026-09-01T12:00:00.000Z', now)).not.toBe('');
  });
});
