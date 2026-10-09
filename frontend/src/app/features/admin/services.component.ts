import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ApiService, Service } from '../../core/api.service';

@Component({
  selector: 'app-services',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <a routerLink="/admin" class="text-blue-600 hover:text-blue-700">← Admin</a>
            <h1 class="text-xl font-bold text-gray-800">Gestión de Servicios</h1>
          </div>
          <button (click)="logout()" class="text-sm text-red-600 hover:text-red-700">Cerrar sesión</button>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">{{ editingService ? 'Editar Servicio' : 'Crear Servicio' }}</h2>
          <form (ngSubmit)="saveService()" #svcForm="ngForm" class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Nombre</label>
              <input type="text" name="name" [(ngModel)]="form.name" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Prefijo</label>
              <input type="text" name="prefix" [(ngModel)]="form.prefix" required maxlength="5" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none uppercase" />
            </div>
            <div class="flex items-center gap-2 pt-6">
              <input type="checkbox" name="active" id="active" [(ngModel)]="form.active" class="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
              <label for="active" class="text-sm text-gray-700">Activo</label>
            </div>
            <div class="md:col-span-3 flex gap-3">
              <button type="submit" [disabled]="svcForm.invalid || saving" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <span *ngIf="saving" class="flex items-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Guardando...</span>
                <span *ngIf="!saving">{{ editingService ? 'Actualizar' : 'Crear' }}</span>
              </button>
              <button *ngIf="editingService" type="button" (click)="cancelEdit()" class="bg-gray-100 text-gray-700 px-6 py-2 rounded-lg font-medium hover:bg-gray-200 transition-colors">Cancelar</button>
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
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Nombre</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Prefijo</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Estado</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let s of services" class="hover:bg-gray-50">
                  <td class="px-6 py-4 text-sm text-gray-500">{{ s.id }}</td>
                  <td class="px-6 py-4 text-sm font-medium text-gray-800">{{ s.name }}</td>
                  <td class="px-6 py-4 text-sm font-mono text-blue-600">{{ s.prefix }}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="s.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'">
                      {{ s.active ? 'Activo' : 'Inactivo' }}
                    </span>
                  </td>
                  <td class="px-6 py-4">
                    <button (click)="editService(s)" class="text-blue-600 hover:text-blue-700 text-sm font-medium mr-3">Editar</button>
                    <button (click)="toggleService(s)" class="text-gray-600 hover:text-gray-700 text-sm font-medium mr-3">{{ s.active ? 'Desactivar' : 'Activar' }}</button>
                    <button (click)="deleteService(s.id)" class="text-red-600 hover:text-red-700 text-sm font-medium">Eliminar</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div *ngIf="services.length === 0" class="p-8 text-center text-gray-500">No hay servicios</div>
        </div>
      </main>
    </div>
  `
})
export class ServicesComponent implements OnInit {
  services: Service[] = [];
  form: Partial<Service> & { active: number } = { name: '', prefix: '', active: 1 };
  editingService: Service | null = null;
  saving = false;
  saveError = '';
  saveSuccess = '';

  constructor(private auth: AuthService, private api: ApiService) {}

  ngOnInit(): void { this.loadServices(); }

  loadServices(): void {
    this.api['http'].get<Service[]>('http://localhost:3000/services/all').subscribe({
      next: (s) => this.services = s,
      error: () => { this.services = []; alert('Error al cargar servicios'); }
    });
  }

  saveService(): void {
    this.saving = true;
    this.saveError = '';
    this.saveSuccess = '';
    const payload = { name: this.form.name, prefix: this.form.prefix, active: this.form.active };
    if (this.editingService) {
      this.api['http'].put(`http://localhost:3000/services/${this.editingService.id}`, payload).subscribe({
        next: () => { this.saveSuccess = 'Servicio actualizado'; this.cancelEdit(); this.loadServices(); this.saving = false; },
        error: (e) => { this.saveError = e.error?.error || 'Error'; this.saving = false; }
      });
    } else {
      this.api['http'].post('http://localhost:3000/services', payload).subscribe({
        next: () => { this.saveSuccess = 'Servicio creado'; this.form = { name: '', prefix: '', active: 1 }; this.loadServices(); this.saving = false; },
        error: (e) => { this.saveError = e.error?.error || 'Error'; this.saving = false; }
      });
    }
  }

  editService(s: Service): void {
    this.editingService = s;
    this.form = { name: s.name, prefix: s.prefix, active: s.active };
  }

  cancelEdit(): void {
    this.editingService = null;
    this.form = { name: '', prefix: '', active: 1 };
  }

  toggleService(s: Service): void {
    this.api['http'].put(`http://localhost:3000/services/${s.id}`, { active: s.active ? 0 : 1 }).subscribe({
      next: () => this.loadServices(),
      error: () => alert('Error al cambiar estado')
    });
  }

  deleteService(id: number): void {
    if (!confirm('¿Eliminar este servicio?')) return;
    this.api['http'].delete(`http://localhost:3000/services/${id}`).subscribe({
      next: () => this.loadServices(),
      error: (e) => alert(e.error?.error || 'Error al eliminar')
    });
  }

  logout(): void { this.auth.logout(); }
}