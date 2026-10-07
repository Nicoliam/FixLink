import { OPEN_REQUEST_PROVIDER_LABEL, jobProviderLabel, jobStatusLabel } from './job.model';
import type { Job } from './job.model';

function job(provider: Job['provider']): Pick<Job, 'provider'> {
  return { provider };
}

/**
 * Step 14 — the wording used everywhere a job's other party is named.
 *
 * One helper, one phrase. The risk this guards is a screen reading "no provider"
 * for an open request, which tells the customer something is broken when in
 * fact quotes are on their way.
 */
describe('jobProviderLabel', () => {
  it('names the provider when the request is addressed', () => {
    expect(
      jobProviderLabel(job({ id: 'professional-1', providerType: 'professional', name: 'Sipho Ndlovu' })),
    ).toBe('Sipho Ndlovu');
  });

  it('describes an open request as matching professionals, not as missing', () => {
    expect(jobProviderLabel(job(null))).toBe(OPEN_REQUEST_PROVIDER_LABEL);
    expect(OPEN_REQUEST_PROVIDER_LABEL).toBe('Matching professionals');
    expect(OPEN_REQUEST_PROVIDER_LABEL.toLowerCase()).not.toContain('no provider');
  });

  it('names a business the same way as a professional', () => {
    expect(
      jobProviderLabel(job({ id: 'business-2', providerType: 'business', name: 'Mokoena Services' })),
    ).toBe('Mokoena Services');
  });
});

describe('jobStatusLabel', () => {
  it('labels REQUESTED and QUOTED distinctly, because an open request passes through both', () => {
    expect(jobStatusLabel('REQUESTED')).toBe('Requested');
    expect(jobStatusLabel('QUOTED')).toBe('Quoted');
  });
});
