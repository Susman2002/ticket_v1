import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService, Service } from '../../core/api.service';

@Component({
  selector: 'app-kiosk',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50 flex flex-col">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4">
          <h1 class="text-2xl font-bold text-gray-800">Kiosco de Turnos</h1>
        </div>
      </header>

      <main class="flex-1 flex items-center justify-center px-4 py-12">
        <div class="w-full max-w-4xl">
          
          <!-- Pantalla de acceso inválido -->
          <div *ngIf="!tokenValid" class="text-center py-12">
            <div class="inline-flex items-center justify-center w-24 h-24 rounded-full bg-red-100 text-red-600 mb-6">
              <svg class="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </div>
            <h2 class="text-2xl font-bold text-gray-800 mb-3">Acceso no válido</h2>
            <p class="text-gray-600 mb-6 max-w-md mx-auto">
              Debe escanear el código QR proyectado en la pantalla de la sala de atención.
              <br><span class="font-medium">El código expira cada 90 segundos.</span>
            </p>
            <p class="text-sm text-gray-500">Si ya escaneó un código, intente escanear nuevamente el que se muestra en pantalla.</p>
          </div>

          <!-- Pantalla principal del kiosko -->
          <div *ngIf="tokenValid" class="w-full">
            <div class="text-center mb-12">
              <h2 class="text-3xl font-semibold text-gray-700">Seleccione su trámite</h2>
              <p class="text-gray-500 mt-2">Toque una opción para obtener su turno</p>
              <div class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full text-sm font-medium">
                <span class="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                <span>Código QR válido</span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
              <button
                *ngFor="let service of services"
                (click)="emitTicket(service)"
                [disabled]="loading === service.id"
                class="group relative p-8 bg-white rounded-2xl shadow-lg border border-gray-100 hover:shadow-xl hover:border-blue-200 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed focus:ring-4 focus:ring-blue-300"
              >
                <div class="text-center">
                  <div class="inline-flex items-center justify-center w-20 h-20 rounded-full bg-blue-100 text-blue-600 mb-4 group-hover:bg-blue-200 transition-colors">
                    <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path>
                    </svg>
                  </div>
                  <h3 class="text-xl font-semibold text-gray-800 mb-1">{{ service.name }}</h3>
                  <p class="text-gray-500">Prefijo: <span class="font-mono font-medium text-blue-600">{{ service.prefix }}</span></p>
                  <div *ngIf="loading === service.id" class="mt-4 flex justify-center">
                    <svg class="animate-spin h-8 w-8 text-blue-600" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
                  </div>
                </div>
              </button>
            </div>

            <div *ngIf="issuedTicket" class="mt-12 p-6 bg-white rounded-2xl shadow-lg border border-gray-100 animate-fade-in">
              <div class="text-center">
                <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 text-green-600 mb-4">
                  <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
                  </svg>
                </div>
                <h3 class="text-2xl font-bold text-gray-800 mb-2">Su turno ha sido emitido</h3>
                <div class="inline-block bg-blue-50 text-blue-800 px-6 py-3 rounded-lg mb-4">
                  <p class="text-sm font-medium">Número de turno</p>
                  <p class="text-4xl font-bold font-mono tracking-wide">{{ issuedTicket.ticket_number }}</p>
                </div>
                <p class="text-gray-600 mb-6">Guarde este número para seguimiento</p>

                <div class="flex flex-col sm:flex-row gap-4 justify-center">
                  <button
                    (click)="goToTracking(issuedTicket.token)"
                    class="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Seguir en mi celular
                  </button>
                  <button
                    (click)="reset()"
                    class="bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition-colors"
                  >
                    Obtener otro turno
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer class="bg-white border-t py-4 px-4">
        <div class="max-w-6xl mx-auto text-center text-sm text-gray-500">
          <p>Sistema de Turnos - Instituto Público</p>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    @keyframes fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in { animation: fade-in 0.3s ease-out; }
  `]
})
export class KioskComponent implements OnInit {
  services: Service[] = [];
  loading: number | null = null;
  issuedTicket: any = null;
  tokenValid = false;
  private qrToken = '';

  constructor(
    private api: ApiService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Obtener token de la URL
    this.qrToken = this.route.snapshot.paramMap.get('token') || '';
    
    if (this.qrToken) {
      this.validateQrToken();
    } else {
      // Sin token en URL - acceso directo a /kiosk (para compatibilidad)
      this.tokenValid = false;
    }
    
    this.loadServices();
  }

  loadServices(): void {
    this.api.getServices().subscribe({
      next: (services) => this.services = services,
      error: () => this.services = []
    });
  }

  validateQrToken(): void {
    this.api['http'].get<{ valid: boolean }>(`http://localhost:3000/api/qr/validate/${this.qrToken}`).subscribe({
      next: (res) => {
        this.tokenValid = res.valid;
        if (!res.valid) {
          console.warn('QR token inválido o expirado:', this.qrToken);
        }
      },
      error: () => {
        this.tokenValid = false;
      }
    });
  }

  emitTicket(service: Service): void {
    if (!this.tokenValid || !this.qrToken) {
      alert('El código QR ha expirado. Por favor escanee el código que se muestra en la pantalla de la sala.');
      this.validateQrToken(); // Re-validar por si acaso
      return;
    }

    this.loading = service.id;
    this.issuedTicket = null;

    this.api.createTicket(service.id, this.qrToken).subscribe({
      next: (ticket) => {
        this.issuedTicket = ticket;
        this.loading = null;
        // Re-validar token después de emitir (por si rotó)
        this.validateQrToken();
      },
      error: (err) => {
        this.loading = null;
        const msg = err.error?.error || 'Error al emitir el turno. Intente nuevamente.';
        alert(msg);
        // Si el error es por QR inválido, invalidar
        if (err.status === 403) {
          this.tokenValid = false;
        }
      }
    });
  }

  goToTracking(token: string): void {
    this.router.navigate(['/ticket', token]);
  }

  reset(): void {
    this.issuedTicket = null;
  }
}