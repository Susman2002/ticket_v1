import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div class="w-full max-w-md bg-white rounded-xl shadow-md p-8">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold text-gray-800">Sistema de Turnos</h1>
          <p class="text-gray-500 mt-2">Iniciar sesión</p>
        </div>

        <form (ngSubmit)="onSubmit()" #loginForm="ngForm" class="space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
            <input
              type="text"
              name="username"
              [(ngModel)]="username"
              required
              #usernameInput="ngModel"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Ingrese su usuario"
            />
            <div *ngIf="usernameInput.invalid && usernameInput.touched" class="text-red-500 text-sm mt-1">
              El usuario es requerido
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
            <input
              type="password"
              name="password"
              [(ngModel)]="password"
              required
              #passwordInput="ngModel"
              class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="Ingrese su contraseña"
            />
            <div *ngIf="passwordInput.invalid && passwordInput.touched" class="text-red-500 text-sm mt-1">
              La contraseña es requerida
            </div>
          </div>

          <div *ngIf="error" class="bg-red-50 text-red-600 p-3 rounded-lg text-sm">
            {{ error }}
          </div>

          <button
            type="submit"
            [disabled]="loading || loginForm.invalid"
            class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <span *ngIf="loading" class="flex items-center justify-center gap-2">
              <svg class="animate-spin h-5 w-5" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>
              Iniciando sesión...
            </span>
            <span *ngIf="!loading">Iniciar sesión</span>
          </button>
        </form>

        <div class="mt-6 text-center text-sm text-gray-500">
          <p>Demo: admin / admin123</p>
          <p>Demo: operador1 / operador123</p>
        </div>
      </div>
    </div>
  `
})
export class LoginComponent {
  username = '';
  password = '';
  loading = false;
  error = '';

  constructor(private auth: AuthService, private router: Router) {}

  async onSubmit(): Promise<void> {
    this.loading = true;
    this.error = '';

    try {
      await this.auth.login(this.username, this.password);
      const user = this.auth.getUser();
      if (user?.role === 'admin') {
        this.router.navigate(['/admin']);
      } else {
        this.router.navigate(['/operator']);
      }
    } catch (err: any) {
      this.error = err.error?.error || 'Credenciales inválidas';
    } finally {
      this.loading = false;
    }
  }
}



