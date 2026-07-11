import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { buildApp } from "./app.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

function open(port: number, path: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  return new Promise((r) => ws.once("open", () => r(ws)));
}

// Buffered reader: a single persistent listener queues every message so a
// predicate can match past messages too. Without this, a message that arrives
// between two sequential `next()` calls is dropped and the test hangs.
type Reader = (p: (m: any) => boolean) => Promise<any>;
function reader(ws: WebSocket): Reader {
  const queue: any[] = [];
  const waiters: { p: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on("message", (raw: Buffer) => {
    const m = JSON.parse(raw.toString());
    const idx = waiters.findIndex((w) => w.p(m));
    if (idx >= 0) {
      const [w] = waiters.splice(idx, 1);
      w!.resolve(m);
    } else {
      queue.push(m);
    }
  });
  return (p) =>
    new Promise((resolve) => {
      const idx = queue.findIndex(p);
      if (idx >= 0) {
        const [m] = queue.splice(idx, 1);
        resolve(m);
      } else {
        waiters.push({ p, resolve });
      }
    });
}
function req(method: string, id: string, params: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "request", id, method, params, sentAt: "2026-07-11T10:00:00Z" });
}
function evt(event: string, data: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "event", event, data, sentAt: "2026-07-11T10:00:00Z" });
}
function resp(id: string, result: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "response", id, ok: true, result, sentAt: "2026-07-11T10:00:00Z" });
}

describe("minimum demo contract end to end", () => {
  it("runs register → pair → list → subscribe → output → input → ended", async () => {
    app = buildApp("ws://127.0.0.1/v1/ws/mobile");
    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    if (addr === null || typeof addr === "string") throw new Error("no port");
    const port = addr.port;

    const desktop = await open(port, "/v1/ws/desktop");
    // Desktop auto-answers forwarded requests to keep the harness self-contained.
    desktop.on("message", (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (m.kind === "request" && m.method === "session.list") {
        desktop.send(resp(m.id, { sessions: [{ id: "sess_1", agent: "claude", title: "Claude", command: "claude", argv: [], cwd: "/tmp", status: "running", createdAt: "2026-07-11T09:58:00Z", lastActivityAt: "2026-07-11T10:00:00Z" }] }));
      } else if (m.kind === "request" && m.method === "session.subscribe") {
        desktop.send(resp(m.id, { session: { id: "sess_1", agent: "claude", title: "Claude", command: "claude", argv: [], cwd: "/tmp", status: "running", createdAt: "2026-07-11T09:58:00Z", lastActivityAt: "2026-07-11T10:00:00Z" }, mode: "live" }));
        desktop.send(evt("terminal.output", { sessionId: "sess_1", seq: 1, data: "Running tests...\r\n" }));
      } else if (m.kind === "request" && m.method === "session.input") {
        desktop.send(resp(m.id, { accepted: true }));
        desktop.send(evt("session.ended", { sessionId: "sess_1", exitCode: 0 }));
      }
    });

    const dRead = reader(desktop);
    desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
    await dRead((m) => m.id === "d1");
    desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
    const code = (await dRead((m) => m.id === "d2")).result.pairingCode as string;

    const mobile = await open(port, "/v1/ws/mobile");
    const mRead = reader(mobile);
    mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
    await mRead((m) => m.id === "m1" && m.ok);

    mobile.send(req("session.list", "m2", {}));
    const list = await mRead((m) => m.id === "m2");
    expect(list.result.sessions[0].id).toBe("sess_1");

    mobile.send(req("session.subscribe", "m3", { sessionId: "sess_1" }));
    const sub = await mRead((m) => m.id === "m3");
    expect(sub.result.mode).toBe("live");
    const output = await mRead((m) => m.kind === "event" && m.event === "terminal.output");
    expect(output.data.data).toContain("Running tests");

    mobile.send(req("session.input", "m4", { sessionId: "sess_1", data: "continue\n", inputMode: "text" }));
    const inputAck = await mRead((m) => m.id === "m4");
    expect(inputAck.result.accepted).toBe(true);
    const ended = await mRead((m) => m.kind === "event" && m.event === "session.ended");
    expect(ended.data.exitCode).toBe(0);

    desktop.close();
    mobile.close();
  });
});
