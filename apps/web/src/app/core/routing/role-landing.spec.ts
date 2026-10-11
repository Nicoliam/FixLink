import { DEFAULT_LANDING, roleLandingRoute } from './role-landing';

describe('roleLandingRoute', () => {
  it('sends every role to the account page', () => {
    expect(roleLandingRoute(['CUSTOMER'])).toBe('/account');
    expect(roleLandingRoute(['PROFESSIONAL'])).toBe('/account');
    expect(roleLandingRoute(['BUSINESS_OWNER'])).toBe('/account');
    expect(roleLandingRoute(['BUSINESS_MANAGER'])).toBe('/account');
    expect(roleLandingRoute(['TECHNICIAN'])).toBe('/account');
    expect(roleLandingRoute(['ADMIN'])).toBe('/account');
  });

  it('gives the same account landing for a dual-role account', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL'])).toBe('/account');
    expect(roleLandingRoute(['CUSTOMER', 'BUSINESS_OWNER'])).toBe('/account');
  });

  it('lands platform and business administration on the account page too', () => {
    expect(roleLandingRoute(['CUSTOMER', 'PROFESSIONAL', 'ADMIN'])).toBe('/account');
    expect(roleLandingRoute(['TECHNICIAN', 'BUSINESS_MANAGER'])).toBe('/account');
  });

  it('falls back to the account page when no role is recognised', () => {
    expect(roleLandingRoute([])).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(null)).toBe(DEFAULT_LANDING);
    expect(roleLandingRoute(undefined)).toBe(DEFAULT_LANDING);
    expect(DEFAULT_LANDING).toBe('/account');
  });
});
