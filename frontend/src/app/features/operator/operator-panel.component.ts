import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService, Ticket } from '../../core/api.service';
import { WebSocketService } from '../../core/websocket.service';

@Component({
  selector: 'app-operator-panel',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b sticky top-0 z-10">
        <div class="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <a routerLink="/operator" class="text-blue-600 hover:text-blue-700 font-medium">← Dashboard</a>
            <h1 class="text-lg font-bold text-gray-800">Panel de Atención - Ventanilla {{ currentSession?.window_number }}</h1>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ currentSession?.service_name }}</span>
            <button (click)="logout()" class="text-sm text-red-600 hover:text-red-700">Salir</button>
          </div>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2 space-y-6">
            <div *ngIf="currentTicket" class="bg-white rounded-xl shadow-sm border p-6 animate-fade-in">
              <div class="flex items-start justify-between mb-4">
                <div>
                  <div class="flex items-center gap-2 mb-1">
                    <span class="px-2 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded-full">
                      {{ currentTicket.service_prefix }}
                    </span>
                    <span class="text-sm text-gray-500">{{ currentTicket.service_name }}</span>
                  </div>
                  <h2 class="text-4xl font-bold font-mono text-gray-900">{{ currentTicket.ticket_number }}</h2>
                </div>
                <div class="flex items-center gap-2">
                  <span class="px-3 py-1 rounded-full text-sm font-medium" [ngClass]="getStatusClass(currentTicket.status)">
                    {{ getStatusLabel(currentTicket.status) }}
                  </span>
                </div>
              </div>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Creado</p>
                  <p class="font-mono text-sm">{{ formatTime(currentTicket.created_at) }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Actualizado</p>
                  <p class="font-mono text-sm">{{ formatTime(currentTicket.updated_at) }}</p>
                </div>
                <div>
                  <p class="text-xs text-gray-500 uppercase tracking-wide">Posición original</p>
                  <p class="font-mono text-sm">{{ currentTicket.position || '-' }}</p>
                </div>
              </div>

              <div class="flex flex-wrap gap-3">
                <button
                  *ngIf="currentTicket.status === 'called' || currentTicket.status === 'transferred'"
                  (click)="startTicket()"
                  [disabled]="processing"
                  class="bg-green-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  <span *ngIf="processing" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Iniciando...</span>
                  <span *ngIf="!processing">Iniciar Atención</span>
                </button>

                <button
                  *ngIf="currentTicket.status === 'in_service'"
                  (click)="completeTicket()"
                  [disabled]="processing"
                  class="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  <span *ngIf="processing" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Completando...</span>
                  <span *ngIf="!processing">Completar Atención</span>
                </button>

                <button
                  *ngIf="currentTicket.status === 'waiting' || currentTicket.status === 'called' || currentTicket.status === 'in_service'"
                  (click)="cancelTicket()"
                  [disabled]="processing"
                  class="bg-red-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  <span *ngIf="processing" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Cancelando...</span>
                  <span *ngIf="!processing">Cancelar Turno</span>
                </button>

                <button
                  *ngIf="currentTicket.status === 'in_service' || currentTicket.status === 'called'"
                  (click)="showTransfer = true"
                  class="bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors"
                >
                  Transferir
                </button>
              </div>
            </div>

            <div *ngIf="!currentTicket" class="bg-white rounded-xl shadow-sm border p-12 text-center">
              <svg class="mx-auto w-16 h-16 text-gray-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
              <h3 class="text-xl font-semibold text-gray-600 mb-2">No hay turno activo</h3>
              <p class="text-gray-500">Use "Llamar Siguiente" en el dashboard para atender un turno</p>
            </div>

            <div class="bg-white rounded-xl shadow-sm border p-6">
              <h2 class="text-lg font-semibold text-gray-800 mb-4">Historial Reciente</h2>
              <div *ngIf="recentTickets.length === 0" class="text-center py-8 text-gray-500">
                <p>No hay turnos atendidos recientemente</p>
              </div>
              <div class="space-y-2" *ngIf="recentTickets.length > 0">
                <div *ngFor="let t of recentTickets" class="p-3 bg-gray-50 rounded-lg border border-gray-100 flex items-center justify-between">
                  <div class="flex items-center gap-3">
                    <span class="px-2 py-1 bg-gray-100 text-gray-700 text-sm font-mono rounded">{{ t.ticket_number }}</span>
                    <span class="text-sm text-gray-600">{{ t.service_name }}</span>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="getStatusClass(t.status)">{{ getStatusLabel(t.status) }}</span>
                    <span class="text-xs text-gray-400">{{ formatTime(t.updated_at) }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-white rounded-xl shadow-sm border p-6 sticky top-20 space-y-6">
              <div>
                <h3 class="font-semibold text-gray-800 mb-3">Cola: {{ currentSession?.service_name }}</h3>
                <button (click)="loadQueue()" [disabled]="loadingQueue" class="w-full text-sm text-blue-600 hover:text-blue-700 mb-3 flex items-center justify-center gap-1">
                  <svg *ngIf="loadingQueue" class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  Actualizar
                </button>
                <div *ngIf="queue.length === 0" class="text-center py-6 text-gray-500 text-sm">
                  <p>No hay turnos en espera</p>
                </div>
                <div class="space-y-2 max-h-80 overflow-y-auto" *ngIf="queue.length > 0">
                  <div *ngFor="let t of queue" class="p-3 bg-gray-50 rounded-lg border border-gray-100">
                    <div class="flex items-center justify-between mb-1">
                      <span class="font-mono font-bold text-gray-800">{{ t.ticket_number }}</span>
                      <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="getStatusClass(t.status)">{{ getStatusLabel(t.status) }}</span>
                    </div>
                    <p class="text-xs text-gray-500">Posición: {{ t.position }}</p>
                  </div>
                </div>
              </div>

              <div *ngIf="showTransfer" class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 class="font-semibold text-yellow-800 mb-3">Transferir Turno</h4>
                <p class="text-sm text-yellow-700 mb-3">Seleccione un operador con sesión activa en otra ventanilla:</p>
                <div class="space-y-2 max-h-40 overflow-y-auto" *ngIf="availableOperators.length > 0">
                  <button
                    *ngFor="let op of availableOperators"
                    (click)="transferTo(op.id)"
                    [disabled]="transferring"
                    class="w-full text-left p-3 bg-white border border-yellow-200 rounded-lg hover:border-yellow-400 transition-colors"
                  >
                    <p class="font-medium text-gray-800">{{ op.username }}</p>
                    <p class="text-xs text-gray-500">Ventanilla {{ op.window_number }} - {{ op.service_name }}</p>
                  </button>
                </div>
                <p *ngIf="availableOperators.length === 0" class="text-sm text-yellow-600">No hay operadores disponibles para transferir</p>
                <button (click)="showTransfer = false" class="mt-3 text-sm text-yellow-700 hover:underline">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: scale(0.98); }
      to { opacity: 1; transform: scale(1); }
    }
    .animate-fade-in { animation: fade-in 0.2s ease-out; }
  `]
})
export class OperatorPanelComponent implements OnInit, OnDestroy {
  currentSession: any = null;
  currentTicket: Ticket | null = null;
  queue: any[] = [];
  recentTickets: Ticket[] = [];
  availableOperators: any[] = [];
  loadingQueue = false;
  processing = false;
  showTransfer = false;
  transferring = false;
  private wsUnsubscribe: (() => void)[] = [];

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private auth: AuthService,
    private api: ApiService,
    private ws: WebSocketService
  ) {}

  ngOnInit(): void {
    this.checkSession();
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    this.wsUnsubscribe.forEach(unsub => unsub());
    this.ws.disconnect();
  }

  checkSession(): void {
    this.api.getCurrentOperatorSession().subscribe({
      next: (session) => {
        this.currentSession = session;
        if (session) {
          this.loadCurrentTicket();
          this.loadQueue();
          this.loadRecentTickets();
          this.loadAvailableOperators();
        } else {
          this.router.navigate(['/operator']);
        }
      },
      error: () => this.router.navigate(['/operator'])
    });
  }

  loadCurrentTicket(): void {
    if (!this.currentSession) return;
    this.api.getTickets({ service_id: this.currentSession.service_id, status: 'called', limit: 1 }).subscribe({
      next: (tickets) => {
        const mine = tickets.find(t => t.operator_id === this.auth.getUser()?.id);
        if (mine) this.currentTicket = mine;
        else {
          this.api.getTickets({ service_id: this.currentSession.service_id, status: 'in_service', limit: 1 }).subscribe({
            next: (t2) => {
              const mine2 = t2.find(t => t.operator_id === this.auth.getUser()?.id);
              if (mine2) this.currentTicket = mine2;
              else {
                this.api.getTickets({ service_id: this.currentSession.service_id, status: 'transferred', limit: 1 }).subscribe({
                  next: (t3) => {
                    const mine3 = t3.find(t => t.operator_id === this.auth.getUser()?.id);
                    if (mine3) this.currentTicket = mine3;
                  }
                });
              }
            }
          });
        }
      }
    });
  }

  loadQueue(): void {
    if (!this.currentSession) return;
    this.loadingQueue = true;
    this.api.getQueue(this.currentSession.service_id).subscribe({
      next: (res) => { this.queue = res.queue; this.loadingQueue = false; },
      error: () => this.loadingQueue = false
    });
  }

  loadRecentTickets(): void {
    if (!this.currentSession) return;
    this.api.getTickets({ status: 'completed', limit: 10 }).subscribe({
      next: (tickets) => {
        const mine = tickets.filter(t => t.operator_id === this.auth.getUser()?.id);
        this.recentTickets = mine;
      }
    });
  }

  loadAvailableOperators(): void {
    this.api.getTickets({ status: 'in_service', limit: 50 }).subscribe({
      next: (tickets) => {
        const ops = new Map<number, any>();
        tickets.forEach(t => {
          if (t.operator_id && t.operator_id !== this.auth.getUser()?.id && t.window_number) {
            ops.set(t.operator_id, {
              id: t.operator_id,
              username: t.operator_username,
              window_number: t.window_number,
              service_name: t.service_name
            });
          }
        });
        this.availableOperators = Array.from(ops.values());
      }
    });
  }

  connectWebSocket(): void {
    this.ws.connect('operator').then(() => {
      this.wsUnsubscribe.push(
        this.ws.on('ticket_updated', (data: any) => {
          if (this.currentTicket && data.token === this.currentTicket.token) {
            this.currentTicket = { ...this.currentTicket, ...data };
          }
        }),
        this.ws.on('ticket_called', (data: any) => {
          if (data.operator_id === this.auth.getUser()?.id) {
            this.currentTicket = data;
          }
        }),
        this.ws.on('ticket_transferred', (data: any) => {
          if (data.target_operator_id === this.auth.getUser()?.id) {
            this.currentTicket = data;
          }
        }),
        this.ws.on('operator_session_ended', (data: any) => {
          if (data.operator_id === this.auth.getUser()?.id) {
            this.currentSession = null;
            this.router.navigate(['/operator']);
          }
        })
      );
    }).catch(() => {});
  }

  startTicket(): void {
    if (!this.currentTicket) return;
    this.processing = true;
    this.api.startTicket(this.currentTicket.token).subscribe({
      next: (t) => { this.currentTicket = t; this.processing = false; },
      error: () => this.processing = false
    });
  }

  completeTicket(): void {
    if (!this.currentTicket) return;
    this.processing = true;
    this.api.completeTicket(this.currentTicket.token).subscribe({
      next: (t) => {
        this.currentTicket = null;
        this.processing = false;
        this.loadRecentTickets();
        this.loadQueue();
      },
      error: () => this.processing = false
    });
  }

  cancelTicket(): void {
    if (!this.currentTicket) return;
    this.processing = true;
    this.api.cancelTicket(this.currentTicket.token).subscribe({
      next: () => {
        this.currentTicket = null;
        this.processing = false;
        this.loadQueue();
      },
      error: () => this.processing = false
    });
  }

  transferTo(targetOperatorId: number): void {
    if (!this.currentTicket) return;
    this.transferring = true;
    this.api.transferTicket(this.currentTicket.token, targetOperatorId).subscribe({
      next: () => {
        this.showTransfer = false;
        this.transferring = false;
        this.currentTicket = null;
        this.loadAvailableOperators();
      },
      error: () => this.transferring = false
    });
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      waiting: 'bg-yellow-100 text-yellow-800',
      called: 'bg-yellow-100 text-yellow-800',
      in_service: 'bg-blue-100 text-blue-800',
      completed: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
      transferred: 'bg-purple-100 text-purple-800'
    };
    return map[status] || 'bg-gray-100 text-gray-800';
  }

  getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      waiting: 'En espera', called: 'Llamado', in_service: 'En atención',
      completed: 'Completado', cancelled: 'Cancelado', transferred: 'Transferido'
    };
    return map[status] || status;
  }

  formatTime(iso: string): string {
    try { return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  logout(): void {
    this.auth.logout();
  }
}



