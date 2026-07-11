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
import { NOOP_AUDIT_LOGGER, type RelayAuditLogger } from "./audit.js";

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
  auditLog: RelayAuditLogger = NOOP_AUDIT_LOGGER,
  logTerminalText = false,
): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    auditLog("message.rejected", {
      role: "desktop",
      code: parsed.code,
      requestId: parsed.id,
      messageBytes: Buffer.byteLength(raw),
    });
    send(socket, makeError(parsed.id, parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;

  if (isRequest(msg)) {
    if (msg.method === "desktop.register") {
      const p = DesktopRegisterParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      state.registerDesktop(p.data, socket);
      auditLog("desktop.registered", {
        desktopId: p.data.desktopId,
        platform: p.data.platform,
        appVersion: p.data.appVersion,
        requestId: msg.id,
      });
      return send(socket, makeResponse(msg.id, { registered: true }));
    }
    if (msg.method === "desktop.pairing.create") {
      const p = DesktopPairingCreateParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      const desktopId = findDesktopId(state, socket);
      if (!desktopId) return send(socket, makeError(msg.id, "DAEMON_UNAVAILABLE", "desktop not registered"));
      const created = state.createPairing(desktopId, p.data.ttlSeconds, relayMobileUrl, Date.now());
      auditLog("desktop.pairing.created", { desktopId, requestId: msg.id, ttlSeconds: p.data.ttlSeconds });
      return send(socket, makeResponse(msg.id, { desktopId, ...created }));
    }
    return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
  }

  if (isResponse(msg)) {
    const desktopId = findDesktopId(state, socket);
    if (!desktopId) return;
    const mobile = state.takePending(desktopId, msg.id);
    if (mobile) {
      auditLog("desktop.response.forwarded", {
        desktopId,
        mobileDeviceId: mobile.mobileDeviceId,
        requestId: msg.id,
        ok: msg.ok,
        messageBytes: Buffer.byteLength(raw),
      });
      send(mobile.socket, msg);
    }
    return;
  }

  if (isEvent(msg) && DESKTOP_EVENT_SET.has(msg.event)) {
    const desktopId = findDesktopId(state, socket);
    if (!desktopId) return;
    const mobiles = state.mobilesForDesktop(desktopId);
    auditLog("desktop.event.forwarded", {
      desktopId,
      eventName: msg.event,
      sessionId: sessionIdFrom(msg.data),
      mobileCount: mobiles.length,
      messageBytes: Buffer.byteLength(raw),
      outputText: terminalOutputTextFrom(msg.event, msg.data, logTerminalText),
    });
    for (const mobile of mobiles) {
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
    auditLog?: RelayAuditLogger;
    logInputText?: boolean;
  } = {},
): void {
  const auditLog = options.auditLog ?? NOOP_AUDIT_LOGGER;
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    auditLog("message.rejected", {
      role: "mobile",
      code: parsed.code,
      requestId: parsed.id,
      messageBytes: Buffer.byteLength(raw),
    });
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
    auditLog("mobile.paired", {
      desktopId: p.data.desktopId,
      mobileDeviceId: p.data.mobileDevice.id,
      platform: p.data.mobileDevice.platform,
      requestId: msg.id,
    });
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
    auditLog("mobile.resumed", {
      desktopId: p.data.desktopId,
      mobileDeviceId: p.data.mobileDeviceId,
      requestId: msg.id,
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
      (pendingMobile) => {
        auditLog("mobile.request.timed_out", {
          desktopId: desktop.desktopId,
          mobileDeviceId: pendingMobile.mobileDeviceId,
          method: msg.method,
          requestId: msg.id,
          sessionId: sessionIdFrom(msg.params),
        });
        send(pendingMobile.socket, makeError(msg.id, "INTERNAL_ERROR", "desktop response timed out"));
      },
    );
    if (!added) {
      return send(socket, makeError(msg.id, "INVALID_MESSAGE", "request id is already in flight"));
    }
    auditLog("mobile.request.forwarded", {
      desktopId: desktop.desktopId,
      mobileDeviceId: conn.mobileDeviceId,
      method: msg.method,
      requestId: msg.id,
      sessionId: sessionIdFrom(msg.params),
      messageBytes: Buffer.byteLength(raw),
      inputText: inputTextFrom(msg.method, msg.params, options.logInputText === true),
    });
    send(desktop.socket, msg);
    return;
  }

  return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
}

export function onDesktopClose(
  state: RelayState,
  socket: WebSocket,
  auditLog: RelayAuditLogger = NOOP_AUDIT_LOGGER,
): void {
  const desktopId = state.removeDesktopBySocket(socket);
  if (!desktopId) return;
  auditLog("websocket.disconnected", { role: "desktop", desktopId });
  for (const pending of state.removePendingForDesktop(desktopId)) {
    send(pending.mobile.socket, makeError(pending.requestId, "DESKTOP_OFFLINE", "desktop disconnected"));
  }
}

export function onMobileClose(
  state: RelayState,
  socket: WebSocket,
  auditLog: RelayAuditLogger = NOOP_AUDIT_LOGGER,
): void {
  const removed = state.unlinkMobileBySocket(socket);
  if (!removed) return;
  auditLog("websocket.disconnected", {
    role: "mobile",
    desktopId: removed.desktopId,
    mobileDeviceId: removed.mobileDeviceId,
  });
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

function sessionIdFrom(value: unknown): string | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  if ("sessionId" in value && typeof value.sessionId === "string") return value.sessionId;
  if ("session" in value && typeof value.session === "object" && value.session !== null
    && "id" in value.session && typeof value.session.id === "string") return value.session.id;
  return undefined;
}

function inputTextFrom(method: string, params: unknown, enabled: boolean): string | undefined {
  if (!enabled || typeof params !== "object" || params === null) return undefined;
  if (method === "session.input" && "data" in params && typeof params.data === "string") {
    return params.data;
  }
  if (method === "interaction.respond" && "response" in params
    && typeof params.response === "object" && params.response !== null
    && "text" in params.response && typeof params.response.text === "string") {
    return params.response.text;
  }
  return undefined;
}

function terminalOutputTextFrom(event: string, data: unknown, enabled: boolean): string | undefined {
  if (!enabled || event !== "terminal.output" || typeof data !== "object" || data === null) return undefined;
  return "data" in data && typeof data.data === "string" ? data.data : undefined;
}
