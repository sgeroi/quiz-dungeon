import { io, Socket } from 'socket.io-client';
import type { ClientEvents, ServerEvents } from './types';

const URL = import.meta.env.DEV ? 'http://localhost:3340' : window.location.origin;

export const socket: Socket<ServerEvents, ClientEvents> = io(URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
});
