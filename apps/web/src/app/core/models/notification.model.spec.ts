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
