import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface WsEvent<T = any> {
  event: string;
  data: T;
}

export type WsChannel = 'display' | 'operator' | 'ticket';

@Injectable({ providedIn: 'root' })
export class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectTimeout: any = null;
  private messageHandlers: Map<string, Set<(data: any) => void>> = new Map();
  private connectionHandlers: Set<(connected: boolean) => void> = new Set();

  constructor(private auth: AuthService) {}

  connect(channel: WsChannel, ticketToken?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.switchChannel(channel, ticketToken);
        resolve();
        return;
      }

      let url = `${environment.wsUrl}?channel=${channel}`;
      if (ticketToken) url += `&ticketToken=${ticketToken}`;
      if (channel === 'operator') {
        const token = this.auth.getToken();
        if (token) url += `&token=${encodeURIComponent(token)}`;
      }

      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.notifyConnection(true);
        resolve();
      };

      this.ws.onmessage = (event) => {
        try {
          const msg: WsEvent = JSON.parse(event.data);
          this.handleMessage(msg);
        } catch (e) {
          console.error('WS parse error', e);
        }
      };

      this.ws.onclose = () => {
        this.notifyConnection(false);
        this.scheduleReconnect(channel, ticketToken);
      };

      this.ws.onerror = (err) => {
        reject(err);
      };
    });
  }

  private switchChannel(channel: WsChannel, ticketToken?: string): void {
    if (!this.ws) return;
    const action = channel === 'ticket' && ticketToken
      ? { action: 'subscribe_ticket', ticketToken }
      : { action: `subscribe_${channel}` };
    if (channel === 'operator') {
      const token = this.auth.getToken();
      if (token) (action as any).token = token;
    }
    this.ws.send(JSON.stringify(action));
  }

  private handleMessage(msg: WsEvent): void {
    const handlers = this.messageHandlers.get(msg.event);
    if (handlers) {
      handlers.forEach(fn => fn(msg.data));
    }
  }

  private notifyConnection(connected: boolean): void {
    this.connectionHandlers.forEach(fn => fn(connected));
  }

  private scheduleReconnect(channel: WsChannel, ticketToken?: string): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(() => {
      this.connect(channel, ticketToken).catch(() => {});
    }, 3000);
  }

  on(event: string, handler: (data: any) => void): () => void {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, new Set());
    }
    this.messageHandlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: (data: any) => void): void {
    this.messageHandlers.get(event)?.delete(handler);
  }

  onConnectionChange(handler: (connected: boolean) => void): () => void {
    this.connectionHandlers.add(handler);
    return () => this.connectionHandlers.delete(handler);
  }

  send(action: string, payload?: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, ...payload }));
    }
  }

  ping(): void {
    this.send('ping');
  }

  disconnect(): void {
    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.notifyConnection(false);
  }
}