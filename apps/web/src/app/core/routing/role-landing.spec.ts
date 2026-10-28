import { DEFAULT_LANDING, roleLandingRoute } from './role-landing';

describe('roleLandingRoute', () => {
  it('sends each role to its intended landing page', () => {
    expect(roleLandingRoute(['CUSTOMER'])).toBe('/account');
    expect(roleLandingRoute(['PROFESSIONAL'])).toBe('/account');
    expect(roleLandingRoute(['BUSINESS_OWNER'])).toBe('/business');
    expect(roleLandingRoute(['BUSINESS_MANAGER'])).toBe('/business');
    expect(roleLandingRoute(['TECHNICIAN'])).toBe('/account');
    expect(roleLandingRoute(['ADMIN'])).toBe('/account');
  });

  it('prioritises the business workspace for dual-role business accounts', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL'])).toBe('/account');
    expect(roleLandingRoute(['CUSTOMER', 'BUSINESS_OWNER'])).toBe('/business');
  });

  it('respects role priority for administration and business accounts', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL', 'ADMIN'])).toBe('/account');
    expect(roleLandingRoute(['TECHNICIAN', 'BUSINESS_MANAGER'])).toBe('/business');
  });

  it('falls back to the account page when no role is recognised', () => {
    expect(roleLandingRoute([])).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(null)).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(undefined)).toBe(DEFAULT_LANDING);
    expect(DEFAULT_LANDING).toBe('/account');
  });
});
