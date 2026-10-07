/**
 * Customer name derivation.
 *
 * `customer_profiles.first_name` and `last_name` are NOT NULL, so a customer
 * account always needs both. The registration form asks for them, and that is
 * the path every new Fixlynk signup takes.
 *
 * This helper is the FALLBACK for accounts that supply no name: an older
 * client, or a direct API call. It derives a presentable name from the email
 * local part (`naledi.dlamini@…` -> `Naledi` / `Dlamini`), which is a guess —
 * good enough to own a profile row with, and the customer can correct it later.
 *
 * Shared deliberately: registration and the jobs module's legacy profile
 * fallback must not drift into two different derivations.
 */

/** Derive a presentable customer name from an account email. */
export function provisionCustomerNames(email: string): { firstName: string; lastName: string } {
  const local = email.split('@')[0] ?? '';
  const parts = local
    .split(/[._-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const capitalise = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);
  if (parts.length === 0) return { firstName: 'Fixlynk', lastName: 'Customer' };
  if (parts.length === 1) return { firstName: capitalise(parts[0] as string), lastName: 'Customer' };
  return {
    firstName: capitalise(parts[0] as string),
    lastName: parts
      .slice(1)
      .map(capitalise)
      .join(' '),
  };
}
