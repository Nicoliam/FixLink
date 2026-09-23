/**
 * Production environment configuration.
 *
 * `apiBaseUrl` is the ONLY place the API origin is defined. Application code
 * must inject API_BASE_URL (see core/config/api-config.ts) instead of
 * hardcoding URLs. Replaced by `environment.development.ts` for local
 * development via angular.json fileReplacements.
 */
export const environment = {
  production: true,
  // Same-origin in production (served behind the same host / reverse proxy).
  apiBaseUrl: '/api/v1',
};
