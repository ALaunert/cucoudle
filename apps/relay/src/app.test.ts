import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { buildApp } from "./app.js";

let app: FastifyInstance | undefined;

afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

async function listen(): Promise<{ app: FastifyInstance; port: number }> {
  const instance = buildApp();
  await instance.listen({ port: 0, host: "127.0.0.1" });
  const address = instance.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return { app: instance, port: address.port };
}

function once(ws: WebSocket, event: "message" | "open"): Promise<unknown> {
  return new Promise((resolve) => ws.once(event, resolve));
}

describe("relay app", () => {
  it("answers /healthz with 200", async () => {
    const started = await listen();
    app = started.app;
    const res = await app.inject({ method: "GET", url: "/healthz" });
    expect(res.statusCode).toBe(200);
  });

  it("answers /readyz with 200", async () => {
    const started = await listen();
    app = started.app;
    const res = await app.inject({ method: "GET", url: "/readyz" });
    expect(res.statusCode).toBe(200);
  });

  it("replies UNSUPPORTED_METHOD for an unknown mobile request method", async () => {
    const started = await listen();
    app = started.app;
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/v1/ws/mobile`);
    await once(ws, "open");
    ws.send(
      JSON.stringify({
        version: "2026-07-11",
        kind: "request",
        id: "req_x",
        method: "does.not.exist",
        sentAt: "2026-07-11T10:00:00Z",
      }),
    );
    const raw = (await once(ws, "message")) as Buffer;
    const msg = JSON.parse(raw.toString());
    expect(msg).toMatchObject({ kind: "response", id: "req_x", ok: false, error: { code: "UNSUPPORTED_METHOD" } });
    ws.close();
  });

  it("replies INVALID_MESSAGE for a non-JSON frame", async () => {
    const started = await listen();
    app = started.app;
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/v1/ws/mobile`);
    await once(ws, "open");
    ws.send("garbage{");
    const raw = (await once(ws, "message")) as Buffer;
    const msg = JSON.parse(raw.toString());
    expect(msg).toMatchObject({ ok: false, error: { code: "INVALID_MESSAGE" } });
    ws.close();
  });

  it("preserves the request id in an unsupported protocol response", async () => {
    const started = await listen();
    app = started.app;
    const ws = new WebSocket(`ws://127.0.0.1:${started.port}/v1/ws/mobile`);
    await once(ws, "open");
    ws.send(JSON.stringify({
      version: "2025-01-01",
      kind: "request",
      id: "old_req",
      method: "session.list",
      sentAt: "2026-07-11T10:00:00Z",
    }));

    const raw = (await once(ws, "message")) as Buffer;
    expect(JSON.parse(raw.toString())).toMatchObject({
      id: "old_req",
      ok: false,
      error: { code: "UNSUPPORTED_PROTOCOL" },
    });
    ws.close();
  });
});
