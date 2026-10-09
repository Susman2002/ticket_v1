import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ApiService, Service, Window, OperatorSession } from '../../core/api.service';

@Component({
  selector: 'app-operator-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 class="text-xl font-bold text-gray-800">Panel de Operador</h1>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ user?.username }} ({{ user?.role }})</span>
            <button (click)="logout()" class="text-sm text-blue-600 hover:text-blue-700">Cerrar sesión</button>
          </div>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div class="lg:col-span-2">
            <div *ngIf="!currentSession" class="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <h2 class="text-lg font-semibold text-gray-800 mb-4">Iniciar Sesión de Atención</h2>
              <form (ngSubmit)="startSession()" #sessionForm="ngForm" class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Ventanilla</label>
                  <select
                    name="window_id"
                    [(ngModel)]="selectedWindow"
                    required
                    #windowSelect="ngModel"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Seleccione una ventanilla</option>
                    <option *ngFor="let w of availableWindows" [value]="w.id">Ventanilla {{ w.number }}</option>
                  </select>
                  <div *ngIf="windowSelect.invalid && windowSelect.touched" class="text-red-500 text-sm mt-1">Requerido</div>
                </div>
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Trámite</label>
                  <select
                    name="service_id"
                    [(ngModel)]="selectedService"
                    required
                    #serviceSelect="ngModel"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  >
                    <option value="">Seleccione un trámite</option>
                    <option *ngFor="let s of services" [value]="s.id">{{ s.name }} ({{ s.prefix }})</option>
                  </select>
                  <div *ngIf="serviceSelect.invalid && serviceSelect.touched" class="text-red-500 text-sm mt-1">Requerido</div>
                </div>
                <div class="md:col-span-2">
                  <button
                    type="submit"
                    [disabled]="sessionForm.invalid || loading"
                    class="w-full md:w-auto bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <span *ngIf="loading" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Iniciando...</span>
                    <span *ngIf="!loading">Iniciar Sesión</span>
                  </button>
                </div>
              </form>
              <div *ngIf="sessionError" class="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ sessionError }}</div>
            </div>

            <div *ngIf="currentSession" class="bg-white rounded-xl shadow-sm border p-6 mb-6">
              <div class="flex items-center justify-between mb-4">
                <h2 class="text-lg font-semibold text-gray-800">Sesión Activa</h2>
                <button (click)="endSession()" class="text-red-600 hover:text-red-700 text-sm font-medium">Finalizar Sesión</button>
              </div>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p class="text-gray-500">Ventanilla</p>
                  <p class="font-semibold text-xl">{{ currentSession.window_number }}</p>
                </div>
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p class="text-gray-500">Trámite</p>
                  <p class="font-semibold">{{ currentSession.service_name }}</p>
                </div>
                <div class="p-3 bg-gray-50 rounded-lg">
                  <p class="text-gray-500">Inicio</p>
                  <p class="font-semibold">{{ formatTime(currentSession.started_at) }}</p>
                </div>
              </div>
            </div>

            <div *ngIf="currentSession" class="bg-white rounded-xl shadow-sm border p-6">
              <h2 class="text-lg font-semibold text-gray-800 mb-4">Llamar Siguiente Turno</h2>

              <div *ngIf="lastCalled && lastCalled.status === 'in_service'" class="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="text-sm text-blue-800 mb-1">Turno en atención:</p>
                    <p class="text-2xl font-bold font-mono text-blue-700">{{ lastCalled.ticket_number }}</p>
                  </div>
                  <button
                    (click)="completeCurrentTicket()"
                    [disabled]="completing"
                    class="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    <span *ngIf="completing" class="flex items-center gap-2"><svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Finalizando...</span>
                    <span *ngIf="!completing">Finalizar Atención</span>
                  </button>
                </div>
              </div>

              <button
                (click)="callNext()"
                [disabled]="calling || (lastCalled && lastCalled.status === 'in_service')"
                class="w-full bg-green-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <span *ngIf="calling" class="flex items-center justify-center gap-2">
                  <svg class="animate-spin h-6 w-6" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  Llamando...
                </span>
                <span *ngIf="!calling && lastCalled && lastCalled.status === 'in_service'" class="flex items-center justify-center gap-2 text-sm">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                  Finalice la atención actual para llamar al siguiente
                </span>
                <span *ngIf="!calling && !(lastCalled && lastCalled.status === 'in_service')" class="flex items-center justify-center gap-2">
                  <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
                  Llamar Siguiente ({{ currentSession.service_name }})
                </span>
              </button>
              <div *ngIf="callError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ callError }}</div>
              <div *ngIf="lastCalled && lastCalled.status !== 'in_service'" class="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p class="text-sm text-green-800 mb-1">Último llamado:</p>
                <p class="text-2xl font-bold font-mono text-green-700">{{ lastCalled.ticket_number }}</p>
                <p class="text-sm text-green-600">Ventanilla {{ lastCalled.window_number }}</p>
              </div>

              <div class="mt-4">
                <button (click)="goToPanel()" class="inline-block w-full md:w-auto text-center bg-purple-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                  Ir al Panel de Atención
                </button>
              </div>
            </div>
          </div>

          <div class="lg:col-span-1">
            <div class="bg-white rounded-xl shadow-sm border p-6 sticky top-24">
              <h2 class="text-lg font-semibold text-gray-800 mb-4">Cola de Espera</h2>
              <button
                (click)="refreshQueue()"
                [disabled]="refreshing"
                class="w-full mb-4 text-sm text-blue-600 hover:text-blue-700 flex items-center justify-center gap-1"
              >
                <svg *ngIf="refreshing" class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                Actualizar cola
              </button>
              <div *ngIf="queue.length === 0" class="text-center py-8 text-gray-500">
                <svg class="mx-auto w-12 h-12 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"></path></svg>
                <p>No hay turnos en espera</p>
              </div>
              <div class="space-y-2 max-h-96 overflow-y-auto" *ngIf="queue.length > 0">
                <div *ngFor="let t of queue" class="p-3 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-200 transition-colors">
                  <div class="flex items-center justify-between">
                    <div>
                      <p class="font-mono font-bold text-lg text-gray-800">{{ t.ticket_number }}</p>
                      <p class="text-xs text-gray-500">{{ t.service_name }}</p>
                    </div>
                    <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="getStatusClass(t.status)">
                      {{ getStatusLabel(t.status) }}
                    </span>
                  </div>
                  <p class="text-xs text-gray-400 mt-1">Posición: {{ t.position }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  `
})
export class OperatorDashboardComponent implements OnInit {
  user: any = null;
  services: Service[] = [];
  availableWindows: Window[] = [];
  selectedWindow: string = '';
  selectedService: string = '';
  loading = false;
  sessionError = '';
  currentSession: OperatorSession | null = null;
  calling = false;
  completing = false;
  callError = '';
  lastCalled: any = null;
  queue: any[] = [];
  refreshing = false;

  constructor(private auth: AuthService, private api: ApiService, private router: Router) {}

  ngOnInit(): void {
    this.user = this.auth.getUser();
    this.loadServices();
    this.loadWindows();
    this.checkCurrentSession();
  }

  loadServices(): void {
    this.api.getServices().subscribe({
      next: (s) => this.services = s,
      error: () => this.services = []
    });
  }

  loadWindows(): void {
    this.api.getWindows().subscribe({
      next: (w) => this.availableWindows = w,
      error: () => this.availableWindows = []
    });
  }

  checkCurrentSession(): void {
    this.api.getCurrentOperatorSession().subscribe({
      next: (session) => this.currentSession = session,
      error: () => this.currentSession = null,
      complete: () => { if (this.currentSession) this.loadQueue(); }
    });
  }

  startSession(): void {
    this.loading = true;
    this.sessionError = '';
    this.api.startOperatorSession(+this.selectedWindow, +this.selectedService).subscribe({
      next: (session) => {
        this.currentSession = session;
        this.loading = false;
        this.loadQueue();
      },
      error: (err) => {
        this.sessionError = err.error?.error || 'Error al iniciar sesión';
        this.loading = false;
      }
    });
  }

  endSession(): void {
    this.api.endOperatorSession().subscribe({
      next: () => {
        this.currentSession = null;
        this.lastCalled = null;
        this.queue = [];
      },
      error: () => alert('Error al finalizar sesión')
    });
  }

  callNext(): void {
    if (!this.currentSession) return;
    this.calling = true;
    this.callError = '';
    this.api.callNextTicket(this.currentSession.service_id).subscribe({
      next: (ticket) => {
        this.lastCalled = ticket;
        this.calling = false;
        this.loadQueue();
      },
      error: (err) => {
        this.callError = err.error?.error || 'Error al llamar turno';
        this.calling = false;
      }
    });
  }

  completeCurrentTicket(): void {
    if (!this.lastCalled || this.lastCalled.status !== 'in_service') return;
    this.completing = true;
    this.api.completeTicket(this.lastCalled.token).subscribe({
      next: (ticket) => {
        this.lastCalled = ticket;
        this.completing = false;
        this.loadQueue();
      },
      error: () => {
        this.completing = false;
      }
    });
  }

  loadQueue(): void {
    if (!this.currentSession) return;
    this.refreshing = true;
    this.api.getQueue(this.currentSession.service_id).subscribe({
      next: (res) => {
        this.queue = res.queue;
        this.refreshing = false;
      },
      error: () => this.refreshing = false
    });
  }

  refreshQueue(): void {
    this.loadQueue();
  }

  goToPanel(): void {
    this.router.navigate(['/operator/panel']);
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
      waiting: 'En espera',
      called: 'Llamado',
      in_service: 'En atención',
      completed: 'Completado',
      cancelled: 'Cancelado',
      transferred: 'Transferido'
    };
    return map[status] || status;
  }

  formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }

  logout(): void {
    this.auth.logout();
  }
}



