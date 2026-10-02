import { DEFAULT_LANDING, roleLandingRoute } from './role-landing';

describe('roleLandingRoute', () => {
  it('sends each role to the surface it works in', () => {
    expect(roleLandingRoute(['CUSTOMER'])).toBe('/my-jobs');
    expect(roleLandingRoute(['PROFESSIONAL'])).toBe('/requests');
    expect(roleLandingRoute(['BUSINESS_OWNER'])).toBe('/business');
    expect(roleLandingRoute(['BUSINESS_MANAGER'])).toBe('/business');
    expect(roleLandingRoute(['TECHNICIAN'])).toBe('/technician/jobs');
    expect(roleLandingRoute(['ADMIN'])).toBe('/admin');
  });

  it('gives provider roles precedence over CUSTOMER for a dual-role account', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL'])).toBe('/requests');
    expect(roleLandingRoute(['CUSTOMER', 'BUSINESS_OWNER'])).toBe('/business');
  });

  it('prefers platform and business administration over operational roles', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL', 'ADMIN'])).toBe('/admin');
    expect(roleLandingRoute(['TECHNICIAN', 'BUSINESS_MANAGER'])).toBe('/business');
  });

  it('falls back to the account page when no role is recognised', () => {
    expect(roleLandingRoute([])).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(null)).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(undefined)).toBe(DEFAULT_LANDING);
    expect(DEFAULT_LANDING).toBe('/account');
  });
});
