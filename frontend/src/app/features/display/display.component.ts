import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WebSocketService } from '../../core/websocket.service';
import QRCode from 'qrcode';

interface CalledTicket {
  ticket_number: string;
  service_name: string;
  service_prefix: string;
  window_number: number;
  created_at: string;
}

@Component({
  selector: 'app-display',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-900 text-white flex flex-col">
      <header class="bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between">
        <h1 class="text-2xl font-bold">Pantalla de Sala</h1>
        <div class="flex items-center gap-4 text-sm text-gray-400">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-green-500 animate-pulse"></span>
            <span>En vivo</span>
          </div>
          <span class="text-gray-500">{{ currentTime }}</span>
        </div>
      </header>

      <main class="flex-1 overflow-y-auto p-6">
        <div class="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          <!-- Panel izquierdo: QR Rotativo -->
          <div class="lg:col-span-1 flex flex-col">
            <div class="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 sticky top-24 flex flex-col items-center">
              <h2 class="text-xl font-semibold mb-4 text-center">Escanee para obtener turno</h2>
              
              <div class="w-64 h-64 bg-white rounded-xl p-4 flex items-center justify-center mb-4">
                <canvas #qrCanvas class="w-full h-full" [attr.width]="256" [attr.height]="256"></canvas>
              </div>
              
              <div class="w-64 mb-4">
                <div class="bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div class="bg-blue-500 h-full rounded-full transition-all duration-100 ease-linear" 
                       [style.width.%]="qrProgress"></div>
                </div>
                <p class="text-center text-sm text-gray-400 mt-2">
                  Se actualiza en: <span class="font-mono text-white">{{ qrCountdown }}s</span>
                </p>
              </div>
              
              <p class="text-center text-xs text-gray-500">Código válido por 90 segundos</p>
            </div>

            <div class="mt-6 bg-gray-800 rounded-2xl p-4 border border-gray-700">
              <h3 class="font-semibold mb-2">Instrucciones</h3>
              <ol class="text-sm text-gray-300 space-y-1 list-decimal list-inside">
                <li>Abra la cámara de su celular</li>
                <li>Apunte al código QR</li>
                <li>Toque la notificación que aparece</li>
                <li>Seleccione su trámite</li>
              </ol>
            </div>
          </div>

          <!-- Panel derecho: Turnos llamados -->
          <div class="lg:col-span-2 flex flex-col">
            <div class="mb-6">
              <h2 class="text-3xl font-semibold mb-2">Próximos Turnos Llamados</h2>
              <p class="text-gray-400">Los turnos aparecen automáticamente cuando son llamados</p>
            </div>

            <div *ngIf="calledTickets.length === 0" class="flex-1 flex flex-col items-center justify-center text-gray-500">
              <svg class="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>
              </svg>
              <p class="text-xl">No hay turnos llamados recientemente</p>
              <p class="mt-2">Los turnos aparecerán aquí cuando sean llamados</p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 flex-1" *ngIf="calledTickets.length > 0">
              <div
                *ngFor="let ticket of calledTickets; let i = index"
                class="bg-gray-800 rounded-2xl p-6 shadow-xl border border-gray-700 animate-slide-up"
                [style.animation-delay.ms]="i * 100"
              >
                <div class="flex items-start justify-between gap-4">
                  <div class="flex-1">
                    <div class="flex items-center gap-3 mb-3">
                      <span class="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded-full">
                        {{ ticket.service_prefix }}
                      </span>
                      <span class="text-sm text-gray-400">{{ ticket.service_name }}</span>
                    </div>
                    <div class="text-4xl font-bold font-mono text-white mb-2">{{ ticket.ticket_number }}</div>
                    <div class="flex items-center gap-2 text-lg text-gray-300">
                      <svg class="w-6 h-6 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"></path>
                      </svg>
                      <span>Ventanilla {{ ticket.window_number }}</span>
                    </div>
                  </div>
                  <div class="w-20 h-20 bg-gray-700 rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg class="w-10 h-10 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path>
                    </svg>
                  </div>
                </div>
                <div class="mt-4 pt-4 border-t border-gray-700 text-sm text-gray-500">
                  Llamado: {{ formatTime(ticket.created_at) }}
                </div>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  `,
  styles: [`
    @keyframes slide-up {
      from { opacity: 0; transform: translateY(20px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-slide-up { animation: slide-up 0.4s ease-out forwards; }
  `]
})
export class DisplayComponent implements OnInit, OnDestroy {
  calledTickets: CalledTicket[] = [];
  currentTime = '';
  qrCodeUrl = '';
  qrCountdown = 90;
  qrProgress = 100;
  private qrToken = '';
  private timeInterval: any;
  private countdownInterval: any;
  private wsUnsubscribe: (() => void)[] = [];
  private qrCanvas!: HTMLCanvasElement;

  @ViewChild('qrCanvas', { static: false }) set canvasRef(canvas: ElementRef<HTMLCanvasElement>) {
    if (canvas) {
      this.qrCanvas = canvas.nativeElement;
      this.renderQrCode();
    }
  }

  constructor(private ws: WebSocketService) {}

  ngOnInit(): void {
    this.updateTime();
    this.timeInterval = setInterval(() => this.updateTime(), 1000);
    this.connectWebSocket();
  }

  ngOnDestroy(): void {
    if (this.timeInterval) clearInterval(this.timeInterval);
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    this.wsUnsubscribe.forEach(unsub => unsub());
    this.ws.disconnect();
  }

  updateTime(): void {
    this.currentTime = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  connectWebSocket(): void {
    this.ws.connect('display').then(() => {
      this.wsUnsubscribe.push(
        this.ws.on('ticket_called', (data: any) => {
          this.addCalledTicket(data);
          this.playAlert();
        }),
        this.ws.on('ticket_transferred', (data: any) => {
          this.addCalledTicket(data);
          this.playAlert();
        }),
        this.ws.on('QR_ROTATED', (data: any) => {
          this.onQrRotated(data);
        })
      );
    }).catch(() => {});
  }

  onQrRotated(data: any): void {
    this.qrToken = data.token;
    this.qrCountdown = data.expiresIn || 90;
    this.qrProgress = 100;
    this.renderQrCode();
    this.startCountdown();
  }

  renderQrCode(): void {
    if (!this.qrCanvas || !this.qrToken) return;
    
    const kioskUrl = `${window.location.origin}/kiosk/${this.qrToken}`;
    
    QRCode.toCanvas(this.qrCanvas, kioskUrl, {
      width: 256,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF'
      }
    }).catch((err: unknown) => console.error('QR generation error:', err));
  }

  startCountdown(): void {
    if (this.countdownInterval) clearInterval(this.countdownInterval);
    
    this.countdownInterval = setInterval(() => {
      this.qrCountdown--;
      this.qrProgress = (this.qrCountdown / 90) * 100;
      
      if (this.qrCountdown <= 0) {
        clearInterval(this.countdownInterval);
      }
    }, 1000);
  }

  addCalledTicket(data: any): void {
    const ticket: CalledTicket = {
      ticket_number: data.ticket_number,
      service_name: data.service_name,
      service_prefix: data.service_prefix,
      window_number: data.window_number,
      created_at: data.updated_at || data.created_at
    };
    this.calledTickets.unshift(ticket);
    if (this.calledTickets.length > 20) this.calledTickets.pop();
  }

  playAlert(): void {
    try {
      const audio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAAA=');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {}
  }

  formatTime(iso: string): string {
    try {
      return new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return iso;
    }
  }
}