import type { WebSocket } from "@fastify/websocket";
import {
  parseWireMessage,
  makeResponse,
  makeError,
  makeEvent,
  isRequest,
  isResponse,
  isEvent,
  MobilePairParamsSchema,
  MobileResumeParamsSchema,
  DesktopRegisterParamsSchema,
  DesktopPairingCreateParamsSchema,
  DESKTOP_EVENTS,
  MOBILE_FORWARDED_METHODS,
} from "@cucoudle/protocol";
import { RelayState, type MobileConn } from "./state.js";

export const DEFAULT_MOBILE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
export const DEFAULT_DESKTOP_RESPONSE_TIMEOUT_MS = 15_000;
const FORWARDED = new Set<string>(MOBILE_FORWARDED_METHODS);
const DESKTOP_EVENT_SET = new Set<string>(DESKTOP_EVENTS);

function send(socket: WebSocket, msg: unknown): void {
  if ("readyState" in socket && socket.readyState !== 1) return;
  socket.send(JSON.stringify(msg));
}

export function handleDesktopMessage(
  state: RelayState,
  socket: WebSocket,
  raw: string,
  relayMobileUrl: string,
): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    send(socket, makeError(parsed.id, parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;

  if (isRequest(msg)) {
    if (msg.method === "desktop.register") {
      const p = DesktopRegisterParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      state.registerDesktop(p.data, socket);
      return send(socket, makeResponse(msg.id, { registered: true }));
    }
    if (msg.method === "desktop.pairing.create") {
      const p = DesktopPairingCreateParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      const desktopId = findDesktopId(state, socket);
      if (!desktopId) return send(socket, makeError(msg.id, "DAEMON_UNAVAILABLE", "desktop not registered"));
      const created = state.createPairing(desktopId, p.data.ttlSeconds, relayMobileUrl, Date.now());
      return send(socket, makeResponse(msg.id, { desktopId, ...created }));
    }
    return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
  }

  if (isResponse(msg)) {
    const desktopId = findDesktopId(state, socket);
    if (!desktopId) return;
    const mobile = state.takePending(desktopId, msg.id);
    if (mobile) {
      send(mobile.socket, msg);
    }
    return;
  }

  if (isEvent(msg) && DESKTOP_EVENT_SET.has(msg.event)) {
    const desktopId = findDesktopId(state, socket);
    if (!desktopId) return;
    for (const mobile of state.mobilesForDesktop(desktopId)) {
      send(mobile.socket, msg);
    }
  }
}

export function handleMobileMessage(
  state: RelayState,
  socket: WebSocket,
  raw: string,
  options: {
    mobileSessionTtlMs?: number;
    desktopResponseTimeoutMs?: number;
  } = {},
): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    send(socket, makeError(parsed.id, parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;
  if (!isRequest(msg)) return; // mobile only sends requests in MVP

  if (msg.method === "mobile.pair") {
    const p = MobilePairParamsSchema.safeParse(msg.params);
    if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
    const desktop = state.getDesktop(p.data.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    const consumed = state.consumePairing(p.data.desktopId, p.data.pairingCode, Date.now());
    if (!consumed.ok) return send(socket, makeError(msg.id, consumed.code, "pairing failed"));

    const issued = state.issueMobileSession(
      p.data.desktopId,
      p.data.mobileDevice.id,
      options.mobileSessionTtlMs ?? DEFAULT_MOBILE_SESSION_TTL_MS,
      Date.now(),
    );
    const conn: MobileConn = {
      mobileDeviceId: p.data.mobileDevice.id,
      mobileDevice: p.data.mobileDevice,
      desktopId: p.data.desktopId,
      token: issued.token,
      socket,
    };
    state.linkMobile(conn);
    send(socket, makeResponse(msg.id, {
      desktopId: desktop.desktopId,
      desktopName: desktop.name,
      paired: true,
      mobileSessionToken: issued.token,
      mobileSessionExpiresAt: issued.expiresAt,
    }));
    send(desktop.socket, makeEvent("mobile.paired", {
      mobileDevice: p.data.mobileDevice,
      mobileSessionExpiresAt: issued.expiresAt,
    }));
    return;
  }

  if (msg.method === "mobile.resume") {
    const p = MobileResumeParamsSchema.safeParse(msg.params);
    if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
    const desktop = state.getDesktop(p.data.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    const resumed = state.resumeMobile(p.data.desktopId, p.data.mobileDeviceId, p.data.mobileSessionToken, Date.now());
    if (!resumed.ok) return send(socket, makeError(msg.id, resumed.code, "resume failed"));
    state.linkMobile({
      mobileDeviceId: p.data.mobileDeviceId,
      mobileDevice: { id: p.data.mobileDeviceId, name: "resumed", platform: "unknown" },
      desktopId: p.data.desktopId,
      token: p.data.mobileSessionToken,
      socket,
    });
    return send(socket, makeResponse(msg.id, { desktopId: desktop.desktopId, desktopName: desktop.name, resumed: true }));
  }

  if (FORWARDED.has(msg.method)) {
    const conn = findMobileConn(state, socket);
    if (!conn) return send(socket, makeError(msg.id, "MOBILE_NOT_PAIRED", "pair before sending session commands"));
    const desktop = state.getDesktop(conn.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    const added = state.addPending(
      desktop.desktopId,
      msg.id,
      conn,
      options.desktopResponseTimeoutMs ?? DEFAULT_DESKTOP_RESPONSE_TIMEOUT_MS,
      (pendingMobile) => send(
        pendingMobile.socket,
        makeError(msg.id, "INTERNAL_ERROR", "desktop response timed out"),
      ),
    );
    if (!added) {
      return send(socket, makeError(msg.id, "INVALID_MESSAGE", "request id is already in flight"));
    }
    send(desktop.socket, msg);
    return;
  }

  return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
}

export function onDesktopClose(state: RelayState, socket: WebSocket): void {
  const desktopId = state.removeDesktopBySocket(socket);
  if (!desktopId) return;
  for (const pending of state.removePendingForDesktop(desktopId)) {
    send(pending.mobile.socket, makeError(pending.requestId, "DESKTOP_OFFLINE", "desktop disconnected"));
  }
}

export function onMobileClose(state: RelayState, socket: WebSocket): void {
  const removed = state.unlinkMobileBySocket(socket);
  if (!removed) return;
  const desktop = state.getDesktop(removed.desktopId);
  if (desktop) {
    send(desktop.socket, makeEvent("mobile.disconnected", { mobileDeviceId: removed.mobileDeviceId }));
  }
}

function findDesktopId(state: RelayState, socket: WebSocket): string {
  for (const [id, conn] of state.desktops) {
    if (conn.socket === socket) return id;
  }
  return "";
}

function findMobileConn(state: RelayState, socket: WebSocket): MobileConn | undefined {
  for (const set of state.links.values()) {
    for (const conn of set) {
      if (conn.socket === socket) return conn;
    }
  }
  return undefined;
}
