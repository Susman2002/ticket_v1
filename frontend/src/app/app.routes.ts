import { Routes } from '@angular/router';
import { AuthGuard } from './core/auth.guard';
import { RoleGuard } from './core/role.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/kiosk', pathMatch: 'full' },
  { path: 'login', loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'kiosk', loadComponent: () => import('./features/kiosk/kiosk.component').then(m => m.KioskComponent) },
  { path: 'kiosk/:token', loadComponent: () => import('./features/kiosk/kiosk.component').then(m => m.KioskComponent) },
  { path: 'ticket/:token', loadComponent: () => import('./features/mobile/ticket-tracking.component').then(m => m.TicketTrackingComponent) },
  { path: 'display', loadComponent: () => import('./features/display/display.component').then(m => m.DisplayComponent) },
  {
    path: 'operator',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['operador', 'admin'] },
    children: [
      { path: '', loadComponent: () => import('./features/operator/operator-dashboard.component').then(m => m.OperatorDashboardComponent) },
      { path: 'panel', loadComponent: () => import('./features/operator/operator-panel.component').then(m => m.OperatorPanelComponent) }
    ]
  },
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['admin'] },
    children: [
      { path: '', loadComponent: () => import('./features/admin/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
      { path: 'users', loadComponent: () => import('./features/admin/users.component').then(m => m.UsersComponent) },
      { path: 'services', loadComponent: () => import('./features/admin/services.component').then(m => m.ServicesComponent) },
      { path: 'windows', loadComponent: () => import('./features/admin/windows.component').then(m => m.WindowsComponent) }
    ]
  },
  { path: '**', redirectTo: '/kiosk' }
];