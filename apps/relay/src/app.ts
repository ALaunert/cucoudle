import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { RelayState } from "./state.js";
import {
  handleDesktopMessage,
  handleMobileMessage,
  onDesktopClose,
  onMobileClose,
} from "./handlers.js";

export function buildApp(relayMobileUrl = "ws://localhost:8787/v1/ws/mobile"): FastifyInstance {
  const app = Fastify({ logger: false });
  const state = new RelayState();
  app.register(websocket);

  app.get("/healthz", async () => ({ status: "ok" }));

  app.register(async (instance) => {
    instance.get("/readyz", async () => ({ status: "ready" }));

    instance.get("/v1/ws/mobile", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleMobileMessage(state, socket, data.toString()));
      socket.on("close", () => onMobileClose(state, socket));
    });

    instance.get("/v1/ws/desktop", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleDesktopMessage(state, socket, data.toString(), relayMobileUrl));
      socket.on("close", () => onDesktopClose(state, socket));
    });
  });

  return app;
}

export async function startServer(port: number, relayMobileUrl?: string): Promise<FastifyInstance> {
  const app = buildApp(relayMobileUrl);
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}
