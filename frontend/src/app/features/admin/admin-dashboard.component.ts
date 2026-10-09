import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 class="text-xl font-bold text-gray-800">Panel de Administración</h1>
          <div class="flex items-center gap-4">
            <span class="text-sm text-gray-600">{{ user?.username }} (Admin)</span>
            <button (click)="logout()" class="text-sm text-red-600 hover:text-red-700">Cerrar sesión</button>
          </div>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <button (click)="navigate('/admin/users')" class="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer text-left">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800">Usuarios</h3>
                <p class="text-sm text-gray-500">Gestionar operadores y admins</p>
              </div>
            </div>
          </button>

          <button (click)="navigate('/admin/services')" class="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer text-left">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"></path></svg>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800">Servicios</h3>
                <p class="text-sm text-gray-500">Trámites y prefijos</p>
              </div>
            </div>
          </button>

          <button (click)="navigate('/admin/windows')" class="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer text-left">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></svg>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800">Ventanillas</h3>
                <p class="text-sm text-gray-500">Configurar ventanillas</p>
              </div>
            </div>
          </button>

          <button (click)="navigate('/operator')" class="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow cursor-pointer text-left">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 bg-gray-100 rounded-xl flex items-center justify-center">
                <svg class="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
              </div>
              <div>
                <h3 class="font-semibold text-gray-800">Operador</h3>
                <p class="text-sm text-gray-500">Ir a panel de operador</p>
              </div>
            </div>
          </button>
        </div>

        <div class="mt-8 bg-white rounded-xl shadow-sm border p-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Accesos Directos</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button (click)="openDisplay()" class="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer text-left">
              <p class="font-medium text-gray-800">Pantalla de Sala (/display)</p>
              <p class="text-sm text-gray-500 mt-1">Abrir en pantalla completa</p>
            </button>
            <button (click)="openKiosk()" class="p-4 bg-gray-50 rounded-lg border border-gray-100 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer text-left">
              <p class="font-medium text-gray-800">Kiosco Público (/kiosk)</p>
              <p class="text-sm text-gray-500 mt-1">Abrir en pantalla completa</p>
            </button>
            <div class="p-4 bg-gray-50 rounded-lg border border-gray-100">
              <p class="font-medium text-gray-800">API Base URL</p>
              <p class="text-sm text-gray-500 mt-1 font-mono">http://localhost:3000</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  user: any = null;

  constructor(private auth: AuthService, private router: Router) {}

  ngOnInit(): void {
    this.user = this.auth.getUser();
  }

  navigate(path: string): void {
    this.router.navigate([path]);
  }

  openDisplay(): void {
    window.open('/display', '_blank');
  }

  openKiosk(): void {
    window.open('/kiosk', '_blank');
  }

  logout(): void {
    this.auth.logout();
  }
}



