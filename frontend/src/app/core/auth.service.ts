import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService, LoginResponse, User } from './api.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private tokenKey = 'turnos_token';
  private userKey = 'turnos_user';

  user = signal<User | null>(null);
  isAuthenticated = signal(false);

  constructor(private api: ApiService, private router: Router) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    const token = localStorage.getItem(this.tokenKey);
    const userStr = localStorage.getItem(this.userKey);
    if (token && userStr) {
      this.user.set(JSON.parse(userStr));
      this.isAuthenticated.set(true);
    }
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  getUser(): User | null {
    return this.user();
  }

  login(username: string, password: string): Promise<LoginResponse> {
    return new Promise((resolve, reject) => {
      this.api.login(username, password).subscribe({
        next: (res) => {
          localStorage.setItem(this.tokenKey, res.token);
          localStorage.setItem(this.userKey, JSON.stringify(res.user));
          this.user.set(res.user);
          this.isAuthenticated.set(true);
          resolve(res);
        },
        error: (err) => reject(err)
      });
    });
  }

  logout(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.userKey);
    this.user.set(null);
    this.isAuthenticated.set(false);
    this.router.navigate(['/login']);
  }

  hasRole(role: string): boolean {
    return this.user()?.role === role;
  }
}