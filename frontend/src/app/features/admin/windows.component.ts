import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ApiService, Window } from '../../core/api.service';

@Component({
  selector: 'app-windows',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <a routerLink="/admin" class="text-blue-600 hover:text-blue-700">← Admin</a>
            <h1 class="text-xl font-bold text-gray-800">Gestión de Ventanillas</h1>
          </div>
          <button (click)="logout()" class="text-sm text-red-600 hover:text-red-700">Cerrar sesión</button>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">{{ editingWindow ? 'Editar Ventanilla' : 'Crear Ventanilla' }}</h2>
          <form (ngSubmit)="saveWindow()" #winForm="ngForm" class="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-md">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Número</label>
              <input type="number" name="number" [(ngModel)]="form.number" required min="1" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div class="flex items-center gap-2 pt-6">
              <input type="checkbox" name="active" id="active" [(ngModel)]="form.active" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <label for="active" class="text-sm text-gray-700">Activo</label>
            </div>
            <div class="md:col-span-3 flex gap-3">
              <button type="submit" [disabled]="winForm.invalid || saving" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <span *ngIf="saving" class="flex items-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Guardando...</span>
                <span *ngIf="!saving">{{ editingWindow ? 'Actualizar' : 'Crear' }}</span>
              </button>
              <button *ngIf="editingWindow" type="button" (click)="cancelEdit()" class="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancelar</button>
            </div>
          </form>
          <div *ngIf="saveError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ saveError }}</div>
          <div *ngIf="saveSuccess" class="mt-3 p-3 bg-green-50 text-green-600 rounded-lg text-sm">{{ saveSuccess }}</div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Número</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let w of windows" class="hover:bg-gray-50">
                  <td class="px-6 py-4 text-sm text-gray-500">{{ w.id }}</td>
                  <td class="px-6 py-4 text-sm font-medium text-gray-800">{{ w.number }}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="w.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                      {{ w.active ? 'Activa' : 'Inactiva' }}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <button (click)="editWindow(w)" class="text-blue-600 hover:text-blue-700 text-sm font-medium mr-3">Editar</button>
                    <button (click)="toggleWindow(w)" class="text-gray-600 hover:text-gray-700 text-sm font-medium mr-3">{{ w.active ? 'Desactivar' : 'Activar' }}</button>
                    <button (click)="deleteWindow(w.id)" class="text-red-600 hover:text-red-700 text-sm font-medium">Eliminar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div *ngIf="windows.length === 0" class="p-8 text-center text-gray-500">No hay ventanillas</div>
        </div>
      </main>
    </div>
  `
})
export class WindowsComponent implements OnInit {
  windows: Window[] = [];
  form: Partial<Window> & { active: number } = { number: 1, active: 1 };
  editingWindow: Window | null = null;
  saving = false;
  saveError = '';
  saveSuccess = '';

  constructor(private auth: AuthService, private api: ApiService) {}

  ngOnInit(): void { this.loadWindows(); }

  loadWindows(): void {
    this.api['http'].get<Window[]>('http://localhost:3000/windows/all').subscribe({
      next: (w) => this.windows = w,
      error: () => { this.windows = []; alert('Error al cargar ventanillas'); }
    });
  }

  saveWindow(): void {
    this.saving = true;
    this.saveError = '';
    this.saveSuccess = '';
    const payload = { number: this.form.number, active: this.form.active };
    if (this.editingWindow) {
      this.api['http'].put(`http://localhost:3000/windows/${this.editingWindow.id}`, payload).subscribe({
        next: () => { this.saveSuccess = 'Ventanilla actualizada'; this.cancelEdit(); this.loadWindows(); this.saving = false; },
        error: (e) => { this.saveError = e.error?.error || 'Error'; this.saving = false; }
      });
    } else {
      this.api['http'].post('http://localhost:3000/windows', payload).subscribe({
        next: () => { this.saveSuccess = 'Ventanilla creada'; this.form = { number: 1, active: 1 }; this.loadWindows(); this.saving = false; },
        error: (e) => { this.saveError = e.error?.error || 'Error'; this.saving = false; }
      });
    }
  }

  editWindow(w: Window): void {
    this.editingWindow = w;
    this.form = { number: w.number, active: w.active };
  }

  cancelEdit(): void {
    this.editingWindow = null;
    this.form = { number: 1, active: 1 };
  }

  toggleWindow(w: Window): void {
    this.api['http'].put(`http://localhost:3000/windows/${w.id}`, { active: w.active ? 0 : 1 }).subscribe({
      next: () => this.loadWindows(),
      error: () => alert('Error al cambiar estado')
    });
  }

  deleteWindow(id: number): void {
    if (!confirm('¿Eliminar esta ventanilla?')) return;
    this.api['http'].delete(`http://localhost:3000/windows/${id}`).subscribe({
      next: () => this.loadWindows(),
      error: (e) => alert(e.error?.error || 'Error al eliminar')
    });
  }

  logout(): void { this.auth.logout(); }
}