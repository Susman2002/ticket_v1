import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Service {
  id: number;
  name: string;
  prefix: string;
  active: number;
  created_at: string;
}

export interface Window {
  id: number;
  number: number;
  active: number;
  created_at: string;
}

export interface Ticket {
  id: number;
  ticket_number: string;
  service_id: number;
  token: string;
  status: string;
  operator_id: number | null;
  created_at: string;
  updated_at: string;
  service_name?: string;
  service_prefix?: string;
  operator_username?: string;
  window_number?: number;
  position?: number;
}

export interface LoginResponse {
  token: string;
  user: { id: number; username: string; role: string };
}

export interface User {
  id: number;
  username: string;
  role: string;
}

export interface OperatorSession {
  id: number;
  operator_id: number;
  window_id: number;
  window_number: number;
  service_id: number;
  service_name: string;
  started_at: string;
  ended_at: string | null;
}

export interface QueueResponse {
  service: Service;
  queue: (Ticket & { position: number })[];
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  login(username: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.baseUrl}/auth/login`, { username, password });
  }

  me(): Observable<User> {
    return this.http.get<User>(`${this.baseUrl}/auth/me`);
  }

  getServices(): Observable<Service[]> {
    return this.http.get<Service[]>(`${this.baseUrl}/services`);
  }

  getWindows(): Observable<Window[]> {
    return this.http.get<Window[]>(`${this.baseUrl}/windows`);
  }

  createTicket(serviceId: number, qrToken?: string): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.baseUrl}/tickets`, { service_id: serviceId, qr_token: qrToken });
  }

  getTicketByToken(token: string): Observable<Ticket> {
    return this.http.get<Ticket>(`${this.baseUrl}/tickets/${token}`);
  }

  getTickets(filters?: { service_id?: number; status?: string; limit?: number; offset?: number }): Observable<Ticket[]> {
    let params = new HttpParams();
    if (filters?.service_id) params = params.set('service_id', filters.service_id);
    if (filters?.status) params = params.set('status', filters.status);
    if (filters?.limit) params = params.set('limit', filters.limit);
    if (filters?.offset) params = params.set('offset', filters.offset);
    return this.http.get<Ticket[]>(`${this.baseUrl}/tickets`, { params });
  }

  updateTicketStatus(token: string, status: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.baseUrl}/tickets/${token}/status`, { status });
  }

  transferTicket(token: string, targetOperatorId: number): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.baseUrl}/tickets/${token}/transfer`, { target_operator_id: targetOperatorId });
  }

  startOperatorSession(windowId: number, serviceId: number): Observable<OperatorSession> {
    return this.http.post<OperatorSession>(`${this.baseUrl}/operator/sessions`, { window_id: windowId, service_id: serviceId });
  }

  endOperatorSession(): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/operator/sessions`);
  }

  getCurrentOperatorSession(): Observable<OperatorSession> {
    return this.http.get<OperatorSession>(`${this.baseUrl}/operator/sessions/current`);
  }

  getQueue(serviceId: number): Observable<QueueResponse> {
    return this.http.get<QueueResponse>(`${this.baseUrl}/queues/${serviceId}`);
  }

  callNextTicket(serviceId: number): Observable<Ticket> {
    return this.http.post<Ticket>(`${this.baseUrl}/tickets/call-next`, { service_id: serviceId });
  }

  startTicket(token: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.baseUrl}/tickets/${token}/start`, {});
  }

  completeTicket(token: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.baseUrl}/tickets/${token}/complete`, {});
  }

  cancelTicket(token: string): Observable<Ticket> {
    return this.http.put<Ticket>(`${this.baseUrl}/tickets/${token}/cancel`, {});
  }
}