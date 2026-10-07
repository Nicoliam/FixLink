import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type { ProviderArea, ProviderAreaList, ReplaceProviderAreasRequest } from '../models/provider-area.model';

/**
 * Fixlynk provider service-area API client (Step 14).
 *
 * The areas a professional or business works in. Not a cosmetic profile field:
 * open-request matching needs BOTH a matching service category and a matching
 * area, so a provider with no areas is offered no open requests at all.
 *
 * Ownership is derived server-side from the session, so this client never sends
 * a provider id — which is also why there is no way to address somebody else's
 * coverage from here.
 */
@Injectable({ providedIn: 'root' })
export class ProviderAreaService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** The caller's published areas. A provider with none gets an empty list. */
  list(): Observable<ProviderAreaList> {
    return this.http
      .get<ApiSuccess<ProviderAreaList>>(`${this.baseUrl}/provider/me/service-areas`)
      .pipe(map((res) => res.data));
  }

  /**
   * Replace the caller's WHOLE area list.
   *
   * There is no add/remove endpoint, by design: the list is one value the
   * provider edits as a unit, and replacing it in one request is the only shape
   * that cannot leave coverage half-applied. Blank city/province are sent as
   * `null` rather than `''`, because an empty string would round-trip as a real
   * (blank) value.
   */
  replace(areas: ReplaceProviderAreasRequest['areas']): Observable<ProviderAreaList> {
    return this.http
      .patch<ApiSuccess<ProviderAreaList>>(`${this.baseUrl}/provider/me/service-areas`, {
        areas: areas.map((area) => ({
          areaName: area.areaName.trim(),
          city: area.city.trim() ? area.city.trim() : null,
          province: area.province.trim() ? area.province.trim() : null,
        })),
      })
      .pipe(map((res) => res.data));
  }

  /** The areas currently on screen, in list order. */
  static toDrafts(areas: ProviderArea[]): ReplaceProviderAreasRequest['areas'] {
    return areas.map((area) => ({
      areaName: area.areaName,
      city: area.city ?? '',
      province: area.province ?? '',
    }));
  }
}
