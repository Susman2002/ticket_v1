import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, Ticket } from '../../core/api.service';
import { WebSocketService, WsEvent } from '../../core/websocket.service';

@Component({
  selector: 'app-ticket-tracking',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex flex-col">
      <header class="bg-white shadow-sm">
        <div class="max-w-md mx-auto px-4 py-4">
          <h1 class="text-xl font-bold text-gray-800 text-center">Mi Turno</h1>
        </div>
      </header>

      <main class="flex-1 flex items-center justify-center px-4 py-8">
        <div class="w-full max-w-md">
          <div *ngIf="loading" class="bg-white rounded-2xl shadow-lg p-8 text-center">
            <svg class="animate-spin mx-auto h-10 w-10 text-blue-600" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
            <p class="mt-4 text-gray-500">Cargando información del turno...</p>
          </div>

          <div *ngIf="!loading && error" class="bg-white rounded-2xl shadow-lg p-8 text-center">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 text-red-600 mb-4">
              <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 class="text-xl font-semibold text-gray-800 mb-2">Turno no encontrado</h2>
            <p class="text-gray-500 mb-6">{{ error }}</p>
            <a routerLink="/kiosk" class="inline-block bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors">
              Obtener nuevo turno
            </a>
          </div>

          <div *ngIf="!loading && !error && ticket" class="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div class="p-6">
              <div class="text-center mb-6">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full" [ngClass]="statusConfig.bg">
                  <svg class="w-8 h-8" [class]="statusConfig.text" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path *ngIf="ticket.status === 'waiting'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    <path *ngIf="ticket.status === 'called'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                    <path *ngIf="ticket.status === 'in_service'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    <path *ngIf="ticket.status === 'completed'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    <path *ngIf="ticket.status === 'cancelled'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
                    <path *ngIf="ticket.status === 'transferred'" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                  </svg>
                </div>
                <h2 class="mt-3 text-xl font-semibold text-gray-800">{{ statusConfig.label }}</h2>
              </div>

              <div class="bg-gray-50 rounded-xl p-5 mb-6">
                <div class="flex items-center justify-center gap-4 mb-4">
                  <div class="text-center">
                    <p class="text-4xl font-bold font-mono text-blue-700">{{ ticket.ticket_number }}</p>
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Turno</p>
                  </div>
                  <div class="w-px h-12 bg-gray-300"></div>
                  <div class="text-center" *ngIf="ticket.position !== undefined && ticket.position !== null">
                    <p class="text-4xl font-bold font-mono text-gray-700">{{ ticket.position }}</p>
                    <p class="text-xs text-gray-500 uppercase tracking-wide">Posición</p>
                  </div>
                </div>
                <div class="text-sm text-gray-600 text-center">
                  <p>Trámite: <span class="font-medium">{{ ticket.service_name }}</span></p>
                  <p *ngIf="ticket.window_number">Ventanilla: <span class="font-medium">{{ ticket.window_number }}</span></p>
                </div>
              </div>

              <div *ngIf="ticket.status === 'called'" class="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-6 animate-pulse" role="alert">
                <div class="flex items-center gap-3">
                  <svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
                  </svg>
                  <div>
                    <p class="font-medium text-yellow-800">¡Su turno ha sido llamado!</p>
                    <p class="text-sm text-yellow-700" *ngIf="ticket.window_number">Diríjase a la ventanilla {{ ticket.window_number }}</p>
                    <p class="text-sm text-yellow-700" *ngIf="!ticket.window_number">Diríjase a la ventanilla indicada</p>
                  </div>
                </div>
              </div>

              <div *ngIf="ticket.status === 'transferred'" class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div class="flex items-center gap-3">
                  <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4"></path>
                  </svg>
                  <div>
                    <p class="font-medium text-blue-800">Su turno ha sido transferido</p>
                    <p class="text-sm text-blue-700" *ngIf="ticket.window_number">Diríjase a la ventanilla {{ ticket.window_number }}</p>
                    <p class="text-sm text-blue-700" *ngIf="!ticket.window_number">Espere indicaciones del operador</p>
                  </div>
                </div>
              </div>

              <div class="text-center text-sm text-gray-500">
                <p>Actualizado: {{ formatTime(ticket.updated_at) }}</p>
              </div>
            </div>

            <div class="bg-gray-50 px-6 py-4 border-t">
              <a routerLink="/kiosk" class="inline-block w-full text-center text-blue-600 hover:text-blue-700 font-medium">
                Obtener otro turno
              </a>
            </div>
          </div>
        </div>
      </main>
    </div>
  `
})
export class TicketTrackingComponent implements OnInit, OnDestroy {
  ticket: Ticket | null = null;
  loading = true;
  error = '';
  private token: string = '';
  private wsUnsubscribe: (() => void)[] = [];

  private statusMap: Record<string, { label: string; bg: string; text: string }> = {
    waiting: { label: 'En espera', bg: 'bg-yellow-100', text: 'text-yellow-600' },
    called: { label: 'Llamado', bg: 'bg-yellow-100', text: 'text-yellow-600' },
    in_service: { label: 'En atención', bg: 'bg-blue-100', text: 'text-blue-600' },
    completed: { label: 'Completado', bg: 'bg-green-100', text: 'text-green-600' },
    cancelled: { label: 'Cancelado', bg: 'bg-red-100', text: 'text-red-600' },
    transferred: { label: 'Transferido', bg: 'bg-purple-100', text: 'text-purple-600' }
  };

  get statusConfig() {
    const status = this.ticket?.status || 'waiting';
    return this.statusMap[status as keyof typeof this.statusMap] || this.statusMap['waiting'];
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private api: ApiService,
    private ws: WebSocketService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (this.token) {
      this.loadTicket();
      this.connectWebSocket();
    } else {
      this.error = 'Token no proporcionado';
      this.loading = false;
    }
  }

  ngOnDestroy(): void {
    this.wsUnsubscribe.forEach(unsub => unsub());
    this.ws.disconnect();
  }

  loadTicket(): void {
    this.api.getTicketByToken(this.token).subscribe({
      next: (ticket) => {
        this.ticket = ticket;
        this.loading = false;
      },
      error: (err) => {
        this.error = err.error?.error || 'Error al cargar el turno';
        this.loading = false;
      }
    });
  }

  connectWebSocket(): void {
    this.ws.connect('ticket', this.token).then(() => {
      this.wsUnsubscribe.push(
        this.ws.on('ticket_updated', (data: any) => {
          if (data.token === this.token) {
            this.ticket = { ...this.ticket, ...data };
            if (data.status === 'called' || data.status === 'transferred') {
              this.playNotification();
            }
          }
        }),
        this.ws.on('ticket_called', (data: any) => {
          if (data.token === this.token) {
            this.ticket = { ...this.ticket, ...data };
            this.playNotification();
          }
        }),
        this.ws.on('ticket_transferred', (data: any) => {
          if (data.token === this.token) {
            this.ticket = { ...this.ticket, ...data };
            this.playNotification();
          }
        })
      );
    }).catch(() => {});
  }

  playNotification(): void {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAA=');
      audio.volume = 0.5;
      audio.play().catch(() => {});
    } catch {}
  }

  formatTime(iso: string): string {
    try {
      const date = new Date(iso);
      return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }
}



