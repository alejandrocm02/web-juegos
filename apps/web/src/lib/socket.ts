import { io, type ManagerOptions, type Socket, type SocketOptions } from 'socket.io-client';

/**
 * El cliente usa el mismo origen: Vite reenvía sockets/API en desarrollo y
 * el servidor sirve ambos en producción. VITE_SERVER_URL permite otro servidor.
 */
const configured = import.meta.env.VITE_SERVER_URL?.trim();
const url = configured || '';

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
