import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { API_BASE_URL } from '../config/api-config';
import type { ApiSuccess } from '../models/api.model';
import type {
  Business,
  CreateTechnicianRequest,
  Technician,
  TechnicianList,
  UpdateBusinessRequest,
  UpdateTechnicianRequest,
} from '../models/business.model';

/**
 * FixLink business API client — Stage 7A (business foundation +
 * technician management).
 *
 * Single owner of business calls. All endpoints require authentication
 * (the interceptor attaches the Bearer token); the business is derived
 * by the backend from the session membership, never from these payloads.
 * Job assignment arrives in a later stage.
 */
@Injectable({ providedIn: 'root' })
export class BusinessService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = inject(API_BASE_URL);

  /** Retrieve the authenticated user's business profile. */
  getMyBusiness(): Observable<Business> {
    return this.http
      .get<ApiSuccess<Business>>(`${this.baseUrl}/business/me`)
      .pipe(map((res) => res.data));
  }

  /** Update the business profile (owner only — the backend enforces it). */
  updateBusiness(payload: UpdateBusinessRequest): Observable<Business> {
    const body: Record<string, string> = {};
    if (payload.businessName?.trim()) body['businessName'] = payload.businessName.trim();
    if (payload.description?.trim()) body['description'] = payload.description.trim();
    if (payload.email?.trim()) body['email'] = payload.email.trim();
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.addressLine1?.trim()) body['addressLine1'] = payload.addressLine1.trim();
    if (payload.city?.trim()) body['city'] = payload.city.trim();
    if (payload.province?.trim()) body['province'] = payload.province.trim();
    if (payload.postalCode?.trim()) body['postalCode'] = payload.postalCode.trim();
    return this.http
      .patch<ApiSuccess<Business>>(`${this.baseUrl}/business/me`, body)
      .pipe(map((res) => res.data));
  }

  /** List technicians belonging to the authenticated user's business. */
  listTechnicians(): Observable<TechnicianList> {
    return this.http
      .get<ApiSuccess<TechnicianList>>(`${this.baseUrl}/business/technicians`)
      .pipe(map((res) => res.data));
  }

  /** Retrieve one roster row (owner/manager, or the technician's own row). */
  getTechnician(id: string): Observable<Technician> {
    return this.http
      .get<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians/${encodeURIComponent(id)}`)
      .pipe(map((res) => res.data));
  }

  /** Invite a technician into the authenticated user's business. */
  createTechnician(payload: CreateTechnicianRequest): Observable<Technician> {
    const body: Record<string, string> = {
      displayName: payload.displayName.trim(),
      email: payload.email.trim(),
    };
    if (payload.phone?.trim()) body['phone'] = payload.phone.trim();
    if (payload.password) body['password'] = payload.password;
    return this.http
      .post<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians`, body)
      .pipe(map((res) => res.data));
  }

  /** Rename a technician or change their active status (owner/manager). */
  updateTechnician(id: string, payload: UpdateTechnicianRequest): Observable<Technician> {
    const body: Record<string, string | boolean> = {};
    if (payload.displayName?.trim()) body['displayName'] = payload.displayName.trim();
    if (payload.isActive !== undefined) body['isActive'] = payload.isActive;
    return this.http
      .patch<ApiSuccess<Technician>>(`${this.baseUrl}/business/technicians/${encodeURIComponent(id)}`, body)
      .pipe(map((res) => res.data));
  }
}
