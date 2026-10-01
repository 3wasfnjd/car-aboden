// Jood multiplayer relay: one Durable Object per room code relays each car's
// pose between up to four phones over WebSockets (hibernation API).
import { DurableObject } from "cloudflare:workers";

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
  ALLOWED_ORIGINS?: string;
  // Optional ntfy.sh topic (Worker secret): the owner gets a push when someone joins.
  NTFY_TOPIC?: string;
}

interface Player {
  id: string;
  name: string;
  car: "gmc" | "van";
  slot: number;
  state: CarState | null;
  lastChat?: number;
}

interface CarState {
  p: number[]; // position (simulation units, relative to the player's stage)
  q: number[]; // orientation quaternion
  v: number[]; // velocity
  s: number; // signed forward speed
  st: number; // front wheel steering angle
  f: boolean; // petals on
}

const MAX_PLAYERS = 4;
const CHAT_MAX = 80; // characters
const CHAT_GAP_MS = 1200; // minimum time between one player's messages
const ROOM = /^\/room\/([A-Z0-9]{4,8})$/;

const finite = (a: unknown, n: number): a is number[] =>
  Array.isArray(a) && a.length === n && a.every((x) => typeof x === "number" && Number.isFinite(x) && Math.abs(x) < 1e4);

function readState(m: Record<string, unknown>): CarState | null {
  if (!finite(m.p, 3) || !finite(m.q, 4) || !finite(m.v, 3)) return null;
  if (typeof m.s !== "number" || !Number.isFinite(m.s) || typeof m.st !== "number" || !Number.isFinite(m.st)) return null;
  return { p: m.p, q: m.q, v: m.v, s: m.s, st: m.st, f: m.f !== false };
}

export class Room extends DurableObject<Env> {
  // Last join notification per name, so reconnects don't spam the owner.
  private notified = new Map<string, number>();

  private notifyJoin(room: string, name: string, players: number) {
    const topic = this.env.NTFY_TOPIC;
    if (!topic) return;
    const now = Date.now();
    if (now - (this.notified.get(name) ?? 0) < 10 * 60 * 1000) return;
    this.notified.set(name, now);
    // JSON publish keeps Arabic text intact (headers must be ASCII).
    this.ctx.waitUntil(
      fetch("https://ntfy.sh/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic,
          title: "جود 🌸",
          message: `${name} دخل اللعبة (${room}) · ${players} ${players === 1 ? "لاعب" : "لاعبين"} الحين`,
          tags: ["cherry_blossom"],
        }),
      })
        .then(async (r) => console.log(`ntfy ${r.status}`, r.ok ? "" : (await r.text()).slice(0, 300)))
        .catch((e) => console.log("ntfy failed", String(e))),
    );
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sockets = this.ctx.getWebSockets();
    if (sockets.length >= MAX_PLAYERS) return new Response("room full", { status: 409 });
    const used = new Set(sockets.map((w) => (w.deserializeAttachment() as Player | null)?.slot));
    let slot = 0;
    while (used.has(slot)) slot++;
    const player: Player = {
      id: crypto.randomUUID().slice(0, 8),
      name: (url.searchParams.get("name") || "").trim().slice(0, 16) || `لاعب ${slot + 1}`,
      car: url.searchParams.get("car") === "van" ? "van" : "gmc",
      slot,
      state: null,
    };
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(player);
    const peers = sockets.map((w) => w.deserializeAttachment() as Player).filter(Boolean);
    server.send(JSON.stringify({ t: "welcome", id: player.id, slot, name: player.name, peers }));
    this.broadcast({ t: "join", id: player.id, name: player.name, car: player.car, slot }, server);
    this.notifyJoin(url.pathname.split("/").pop() || "", player.name, sockets.length + 1);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 1024) return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(message);
    } catch {
      return;
    }
    const player = ws.deserializeAttachment() as Player | null;
    if (!player) return;
    if (m.t === "state") {
      const state = readState(m);
      if (!state) return;
      player.state = state;
      ws.serializeAttachment(player);
      this.broadcast({ t: "state", id: player.id, ...state }, ws);
    } else if (m.t === "chat") {
      // Short chat line: collapse whitespace, cap the length, rate-limit per player.
      const text = String(m.text ?? "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX);
      const now = Date.now();
      if (!text || (player.lastChat && now - player.lastChat < CHAT_GAP_MS)) return;
      player.lastChat = now;
      ws.serializeAttachment(player);
      this.broadcast({ t: "chat", id: player.id, name: player.name, text }, ws);
    } else if (m.t === "ping") {
      ws.send(JSON.stringify({ t: "pong" }));
    }
  }

  async webSocketClose(ws: WebSocket, code: number): Promise<void> {
    this.leave(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {}
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const player = ws.deserializeAttachment() as Player | null;
    if (player) this.broadcast({ t: "leave", id: player.id }, ws);
  }

  private broadcast(message: object, except?: WebSocket) {
    const text = JSON.stringify(message);
    for (const w of this.ctx.getWebSockets()) {
      if (w === except) continue;
      try {
        w.send(text);
      } catch {}
    }
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "jood-multiplayer" });
    const match = url.pathname.match(ROOM);
    if (!match) return new Response("not found", { status: 404 });
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (allowed.length && !allowed.includes(origin)) return new Response("origin not allowed", { status: 403 });
    return env.ROOMS.get(env.ROOMS.idFromName(match[1])).fetch(request);
  },
} satisfies ExportedHandler<Env>;
