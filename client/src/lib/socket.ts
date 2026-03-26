import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

function getSocketUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_API_URL?.trim()
  if (fromEnv) return fromEnv.replace(/\/$/, '')
  if (process.env.NODE_ENV === 'production') {
    console.warn('[KC] NEXT_PUBLIC_API_URL is not set; Socket.IO needs the API origin.')
  }
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
