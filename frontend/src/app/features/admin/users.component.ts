import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { ApiService } from '../../core/api.service';

interface User {
  id: number;
  username: string;
  role: string;
  created_at?: string;
}

interface Role { id: number; name: string; }

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow-sm border-b">
        <div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div class="flex items-center gap-4">
            <a routerLink="/admin" class="text-blue-600 hover:text-blue-700">← Admin</a>
            <h1 class="text-xl font-bold text-gray-800">Gestión de Usuarios</h1>
          </div>
          <button (click)="logout()" class="text-sm text-red-600 hover:text-red-700">Cerrar sesión</button>
        </div>
      </header>

      <main class="max-w-6xl mx-auto px-4 py-8">
        <div class="bg-white rounded-xl shadow-sm border p-6 mb-6">
          <h2 class="text-lg font-semibold text-gray-800 mb-4">Crear Usuario</h2>
          <form (ngSubmit)="createUser()" #userForm="ngForm" class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Usuario</label>
              <input type="text" name="username" [(ngModel)]="newUser.username" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
              <input type="password" name="password" [(ngModel)]="newUser.password" required minlength="4" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none" />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select name="role_id" [(ngModel)]="newUser.role_id" required class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none">
                <option *ngFor="let r of roles" [value]="r.id">{{ r.name }}</option>
              </select>
            </div>
            <div class="flex items-end">
              <button type="submit" [disabled]="userForm.invalid || creating" class="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
                <span *ngIf="creating" class="flex items-center gap-2"><svg class="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Creando...</span>
                <span *ngIf="!creating">Crear Usuario</span>
              </button>
            </div>
          </form>
          <div *ngIf="createError" class="mt-3 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{{ createError }}</div>
          <div *ngIf="createSuccess" class="mt-3 p-3 bg-green-50 text-green-600 rounded-lg text-sm">{{ createSuccess }}</div>
        </div>

        <div class="bg-white rounded-xl shadow-sm border">
          <div class="overflow-x-auto">
            <table class="w-full">
              <thead class="bg-gray-50 border-b">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Usuario</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Rol</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Creado</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Acciones</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr *ngFor="let u of users" class="hover:bg-gray-50">
                  <td class="px-6 py-4 text-sm text-gray-500">{{ u.id }}</td>
                  <td class="px-6 py-4 text-sm font-medium text-gray-800">{{ u.username }}</td>
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full" [ngClass]="u.role === 'admin' ? 'bg-purple-100 text-purple-800' : 'bg-blue-100 text-blue-800'">
                      {{ u.role }}
                    </span>
                  </td>
                  <td class="px-6 py-4 text-sm text-gray-500">{{ u.created_at ? formatDate(u.created_at) : '-' }}</td>
                  <td class="px-6 py-4">
                    <button *ngIf="u.id !== currentUserId" (click)="deleteUser(u.id)" class="text-red-600 hover:text-red-700 text-sm font-medium">Eliminar</button>
                    <span *ngIf="u.id === currentUserId" class="text-gray-400 text-sm">Usuario actual</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div *ngIf="users.length === 0" class="p-8 text-center text-gray-500">
            No hay usuarios registrados
          </div>
        </div>
      </main>
    </div>
  `
})
export class UsersComponent implements OnInit {
  users: User[] = [];
  roles: Role[] = [];
  newUser = { username: '', password: '', role_id: 2 };
  creating = false;
  createError = '';
  createSuccess = '';
  currentUserId: number | null = null;

  constructor(private auth: AuthService, private api: ApiService) {}

  ngOnInit(): void {
    this.currentUserId = this.auth.getUser()?.id || null;
    this.loadUsers();
    this.loadRoles();
  }

  loadUsers(): void {
    this.api['http'].get<User[]>('http://localhost:3000/auth/users').subscribe({
      next: (data) => this.users = data,
      error: () => { this.users = []; alert('Error al cargar usuarios'); }
    });
  }

  loadRoles(): void {
    this.api['http'].get<Role[]>('http://localhost:3000/roles').subscribe({
      next: (data) => this.roles = data,
      error: () => this.roles = [{ id: 1, name: 'admin' }, { id: 2, name: 'operador' }]
    });
  }

  createUser(): void {
    this.creating = true;
    this.createError = '';
    this.createSuccess = '';
    this.api['http'].post('http://localhost:3000/auth/users', this.newUser).subscribe({
      next: () => { 
        this.createSuccess = 'Usuario creado correctamente'; 
        this.newUser = { username: '', password: '', role_id: 2 }; 
        this.loadUsers(); 
        this.creating = false; 
      },
      error: (err) => { 
        this.createError = err.error?.error || 'Error al crear usuario'; 
        this.creating = false; 
      }
    });
  }

  deleteUser(id: number): void {
    if (!confirm('¿Eliminar este usuario?')) return;
    this.api['http'].delete(`http://localhost:3000/auth/users/${id}`).subscribe({
      next: () => this.loadUsers(),
      error: (err) => alert(err.error?.error || 'Error al eliminar usuario')
    });
  }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return iso;
    }
  }

  logout(): void { this.auth.logout(); }
}