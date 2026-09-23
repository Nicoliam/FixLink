import { APP_INITIALIZER, ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { catchError, firstValueFrom, of } from 'rxjs';

import { routes } from './app.routes';
import { AuthService } from './core/services/auth.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';

/** Restore a persisted session before first render (fails silently). */
function restoreSession(auth: AuthService): () => Promise<unknown> {
  return () => firstValueFrom(auth.restoreSession().pipe(catchError(() => of(null))));
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    { provide: APP_INITIALIZER, multi: true, useFactory: restoreSession, deps: [AuthService] },
  ],
};
