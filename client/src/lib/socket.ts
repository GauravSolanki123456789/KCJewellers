import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

// Bulletproof URL resolution with fallback logic
function getSocketUrl(): string {
  // First, try to use process.env.NEXT_PUBLIC_API_URL
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL
  }
  
  // If missing, check if process.env.NODE_ENV === 'production'
  if (process.env.NODE_ENV === 'production') {
    return 'https://api.kc.gauravsoftwares.tech'
  }
  
  // Otherwise, default to localhost for local development
  return 'http://localhost:4000'
}

export function getSocket() {
  if (socket) return socket;
  const url = getSocketUrl();
  socket = io(url, { transports: ["websocket"] });
  return socket;
}

export type LiveRatePayload = { rates?: Array<{ metal_type?: string, display_rate?: number, sell_rate?: number }> }
export function subscribeLiveRates(cb: (payload: LiveRatePayload) => void) {
  const s = getSocket();
  s.on("live-rate", cb);
  return () => { s.off("live-rate", cb) };
}
