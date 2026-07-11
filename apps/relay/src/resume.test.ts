import { describe, it, expect, afterEach } from "vitest";
import type { FastifyInstance } from "fastify";
import { WebSocket } from "ws";
import { buildApp } from "./app.js";

let app: FastifyInstance | undefined;
afterEach(async () => {
  if (app) await app.close();
  app = undefined;
});

async function listen(): Promise<number> {
  app = buildApp("ws://127.0.0.1/v1/ws/mobile");
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") throw new Error("no port");
  return address.port;
}

function open(port: number, path: string): Promise<WebSocket> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  return new Promise((resolve) => ws.once("open", () => resolve(ws)));
}

type Reader = (p: (m: any) => boolean) => Promise<any>;
function reader(ws: WebSocket): Reader {
  const queue: any[] = [];
  const waiters: { p: (m: any) => boolean; resolve: (m: any) => void }[] = [];
  ws.on("message", (raw: Buffer) => {
    const m = JSON.parse(raw.toString());
    const idx = waiters.findIndex((w) => w.p(m));
    if (idx >= 0) waiters.splice(idx, 1)[0]!.resolve(m);
    else queue.push(m);
  });
  return (p) =>
    new Promise((resolve) => {
      const idx = queue.findIndex(p);
      if (idx >= 0) resolve(queue.splice(idx, 1)[0]);
      else waiters.push({ p, resolve });
    });
}

function closed(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => ws.once("close", () => resolve()));
}

function req(method: string, id: string, params: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "request", id, method, params, sentAt: "2026-07-11T10:00:00Z" });
}

async function pairAndToken(port: number): Promise<{ desktop: WebSocket; dRead: Reader; token: string }> {
  const desktop = await open(port, "/v1/ws/desktop");
  const dRead = reader(desktop);
  desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
  await dRead((m) => m.id === "d1");
  desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
  const code = (await dRead((m) => m.id === "d2")).result.pairingCode as string;

  const mobile = await open(port, "/v1/ws/mobile");
  const mRead = reader(mobile);
  mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
  const pairResp = await mRead((m) => m.id === "m1");
  const token = pairResp.result.mobileSessionToken as string;
  mobile.close();
  await closed(mobile);
  return { desktop, dRead, token };
}

describe("mobile.resume reconnect", () => {
  it("re-links after a drop and forwards session commands again", async () => {
    const port = await listen();
    const { desktop, dRead, token } = await pairAndToken(port);
    // Desktop had a mobile.disconnected already; drain it if present.
    await dRead((m) => m.kind === "event" && m.event === "mobile.disconnected");

    const mobile2 = await open(port, "/v1/ws/mobile");
    const m2Read = reader(mobile2);
    mobile2.send(req("mobile.resume", "r1", { desktopId: "desk_1", mobileDeviceId: "mob_a", mobileSessionToken: token }));
    const resumeResp = await m2Read((m) => m.id === "r1");
    expect(resumeResp).toMatchObject({ ok: true, result: { resumed: true, desktopName: "Mac" } });

    // After resume the mobile is linked again, so a forwarded request reaches desktop.
    const forwarded = dRead((m) => m.kind === "request" && m.method === "session.list");
    mobile2.send(req("session.list", "r2", {}));
    const got = await forwarded;
    expect(got.id).toBe("r2");
    desktop.send(JSON.stringify({ version: "2026-07-11", kind: "response", id: "r2", ok: true, result: { sessions: [] }, sentAt: "2026-07-11T10:00:01Z" }));
    const back = await m2Read((m) => m.id === "r2");
    expect(back).toMatchObject({ ok: true, result: { sessions: [] } });

    desktop.close();
    mobile2.close();
  });

  it("rejects resume with a bad token so the app returns to pairing", async () => {
    const port = await listen();
    const { desktop, token } = await pairAndToken(port);
    void token;
    const mobile2 = await open(port, "/v1/ws/mobile");
    const m2Read = reader(mobile2);
    mobile2.send(req("mobile.resume", "r1", { desktopId: "desk_1", mobileDeviceId: "mob_a", mobileSessionToken: "mst_wrong" }));
    const resp = await m2Read((m) => m.id === "r1");
    expect(resp).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED" } });
    desktop.close();
    mobile2.close();
  });
});
