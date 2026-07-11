import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { RelayState } from "./state.js";
import { JSON_AUDIT_LOGGER, NOOP_AUDIT_LOGGER, type RelayAuditLogger } from "./audit.js";
import {
  DEFAULT_DESKTOP_RESPONSE_TIMEOUT_MS,
  DEFAULT_MOBILE_SESSION_TTL_MS,
  handleDesktopMessage,
  handleMobileMessage,
  onDesktopClose,
  onMobileClose,
} from "./handlers.js";

export type RelayRuntimeOptions = {
  mobileSessionTtlMs?: number;
  desktopResponseTimeoutMs?: number;
  auditLog?: RelayAuditLogger;
  logInputText?: boolean;
  logPayloads?: boolean;
};

export function buildApp(
  relayMobileUrl = "ws://localhost:8787/v1/ws/mobile",
  options: RelayRuntimeOptions = {},
): FastifyInstance {
  const app = Fastify({ logger: false });
  const state = new RelayState();
  const auditLog = options.auditLog ?? NOOP_AUDIT_LOGGER;
  app.register(websocket);

  app.get("/healthz", async () => ({ status: "ok" }));

  app.register(async (instance) => {
    instance.get("/readyz", async () => ({ status: "ready" }));

    instance.get("/v1/ws/mobile", { websocket: true }, (socket) => {
      auditLog("websocket.connected", { role: "mobile" });
      socket.on("message", (data: Buffer) => handleMobileMessage(state, socket, data.toString(), options));
      socket.on("close", () => onMobileClose(state, socket, auditLog));
    });

    instance.get("/v1/ws/desktop", { websocket: true }, (socket) => {
      auditLog("websocket.connected", { role: "desktop" });
      socket.on("message", (data: Buffer) => handleDesktopMessage(
        state,
        socket,
        data.toString(),
        relayMobileUrl,
        auditLog,
        options.logInputText === true,
        options.logPayloads === true,
      ));
      socket.on("close", () => onDesktopClose(state, socket, auditLog));
    });
  });

  return app;
}

export async function startServer(
  port: number,
  relayMobileUrl?: string,
  options: RelayRuntimeOptions = {
    mobileSessionTtlMs: DEFAULT_MOBILE_SESSION_TTL_MS,
    desktopResponseTimeoutMs: DEFAULT_DESKTOP_RESPONSE_TIMEOUT_MS,
  },
  host = "0.0.0.0",
): Promise<FastifyInstance> {
  const app = buildApp(relayMobileUrl, { ...options, auditLog: options.auditLog ?? JSON_AUDIT_LOGGER });
  await app.listen({ port, host });
  return app;
}
