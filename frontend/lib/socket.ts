'use client';

/**
 * One WebSocket per tab, shared by the whole app.
 *
 * Auth happens in the first frame (never in the URL). On an auth failure we
 * refresh the access token and reconnect; other drops reconnect with backoff.
 */
import { create } from 'zustand';
import { getAccessToken, refreshSession } from './api';
import { WS_URL } from './config';

export type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'replaced' | 'closed';

type Event = { type: string; [key: string]: unknown };
type Handler = (event: Event) => void;

export const useSocketStatus = create<{ status: SocketStatus }>(() => ({ status: 'idle' }));

class ChatSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private queue: string[] = [];
  private backoff = 1000;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private wanted = false;
  private authed = false;

  private setStatus(status: SocketStatus) {
    useSocketStatus.setState({ status });
  }

  start() {
    this.wanted = true;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) return;
    this.open();
  }

  stop() {
    this.wanted = false;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close(1000);
    this.ws = null;
    this.queue = [];
    this.setStatus('closed');
  }

  on(type: string, handler: Handler) {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => {
      this.handlers.get(type)?.delete(handler);
    };
  }

  /** Send now if connected; otherwise queue until the socket is authenticated. */
  send(data: Event) {
    const frame = JSON.stringify(data);
    if (this.ws && this.authed && this.ws.readyState === WebSocket.OPEN) this.ws.send(frame);
    else if (this.queue.length < 50) this.queue.push(frame);
  }

  private emit(event: Event) {
    this.handlers.get(event.type)?.forEach((h) => h(event));
    this.handlers.get('*')?.forEach((h) => h(event));
  }

  private open() {
    const token = getAccessToken();
    if (!token) {
      void refreshSession().then((t) => (t ? this.open() : this.setStatus('closed')));
      return;
    }
    this.setStatus(this.backoff > 1000 ? 'reconnecting' : 'connecting');
    this.authed = false;
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));

    ws.onmessage = (msg) => {
      let event: Event;
      try {
        event = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (event.type === 'auth.ok') {
        this.authed = true;
        this.backoff = 1000;
        this.setStatus('open');
        this.queue.splice(0).forEach((f) => ws.send(f));
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25_000);
      }
      this.emit(event);
    };

    ws.onclose = async (e) => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.authed = false;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.emit({ type: 'socket.closed', code: e.code });

      if (!this.wanted) return;
      if (e.code === 4000) return this.setStatus('replaced'); // opened in another tab
      if (e.code === 4003) return this.setStatus('closed'); // suspended
      if (e.code === 4001) {
        const fresh = await refreshSession();
        if (!fresh) return this.setStatus('closed');
      }
      this.setStatus('reconnecting');
      this.retryTimer = setTimeout(() => this.open(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 20_000);
    };
  }
}

export const socket = new ChatSocket();
