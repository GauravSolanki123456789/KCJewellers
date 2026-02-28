import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export function getSocket() {
  if (socket) return socket;
  const url = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000";
  socket = io(url, { transports: ["websocket"] });
  return socket;
}

export type LiveRatePayload = { rates?: Array<{ metal_type?: string, display_rate?: number, sell_rate?: number }> }
export function subscribeLiveRates(cb: (payload: LiveRatePayload) => void) {
  const s = getSocket();
  s.on("live-rate", cb);
  return () => { s.off("live-rate", cb) };
}
