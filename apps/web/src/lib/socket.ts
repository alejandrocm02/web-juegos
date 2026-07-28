import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

/**
 * En desarrollo el servidor vive en otro puerto (VITE_SERVER_URL).
 * En produccion el mismo servicio sirve cliente y sockets, asi que se usa el
 * mismo origen y no hace falta configurar nada.
 */
const configured = import.meta.env.VITE_SERVER_URL?.trim();
const fallback = import.meta.env.DEV ? 'http://localhost:3001' : '';
const url = configured || fallback;

const options: Partial<ManagerOptions & SocketOptions> = {
  autoConnect: true,
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionDelay: 600,
  reconnectionDelayMax: 4000,
  timeout: 8000,
};

export const socket: Socket = url ? io(url, options) : io(options);

export const serverUrl = url || (typeof window !== 'undefined' ? window.location.origin : '');
