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

function nextMessage(ws: WebSocket, predicate: (m: any) => boolean): Promise<any> {
  return new Promise((resolve) => {
    const onMsg = (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (predicate(m)) {
        ws.off("message", onMsg);
        resolve(m);
      }
    };
    ws.on("message", onMsg);
  });
}

function req(method: string, id: string, params: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "request", id, method, params, sentAt: "2026-07-11T10:00:00Z" });
}

async function pairedPair(port: number): Promise<{ desktop: WebSocket; mobile: WebSocket }> {
  const desktop = await open(port, "/v1/ws/desktop");
  desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
  await nextMessage(desktop, (m) => m.id === "d1");
  desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
  const created = await nextMessage(desktop, (m) => m.id === "d2");
  const code = created.result.pairingCode as string;

  const mobile = await open(port, "/v1/ws/mobile");
  mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
  await nextMessage(mobile, (m) => m.id === "m1" && m.ok === true);
  return { desktop, mobile };
}

describe("pairing flow", () => {
  it("pairs mobile and notifies desktop with mobile.paired", async () => {
    const port = await listen();
    const desktop = await open(port, "/v1/ws/desktop");
    desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
    await nextMessage(desktop, (m) => m.id === "d1");
    desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
    const created = await nextMessage(desktop, (m) => m.id === "d2");
    const code = created.result.pairingCode as string;

    const mobile = await open(port, "/v1/ws/mobile");
    const pairedEvent = nextMessage(desktop, (m) => m.kind === "event" && m.event === "mobile.paired");
    mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));

    const pairResp = await nextMessage(mobile, (m) => m.id === "m1");
    expect(pairResp).toMatchObject({ ok: true, result: { paired: true, desktopName: "Mac" } });
    expect(typeof pairResp.result.mobileSessionToken).toBe("string");

    const evt = await pairedEvent;
    expect(evt.data.mobileDevice.id).toBe("mob_a");
    desktop.close();
    mobile.close();
  });

  it("rejects mobile.pair with a bad code", async () => {
    const port = await listen();
    const desktop = await open(port, "/v1/ws/desktop");
    desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
    await nextMessage(desktop, (m) => m.id === "d1");
    const mobile = await open(port, "/v1/ws/mobile");
    mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: "000000", mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
    const resp = await nextMessage(mobile, (m) => m.id === "m1");
    expect(resp).toMatchObject({ ok: false, error: { code: "PAIRING_NOT_FOUND" } });
    desktop.close();
    mobile.close();
  });
});

describe("forwarding", () => {
  it("forwards session.list to desktop and routes the response back to mobile", async () => {
    const port = await listen();
    const { desktop, mobile } = await pairedPair(port);

    const forwarded = nextMessage(desktop, (m) => m.kind === "request" && m.method === "session.list");
    mobile.send(req("session.list", "m2", {}));
    const got = await forwarded;
    expect(got.id).toBe("m2");

    desktop.send(JSON.stringify({ version: "2026-07-11", kind: "response", id: "m2", ok: true, result: { sessions: [] }, sentAt: "2026-07-11T10:00:01Z" }));
    const back = await nextMessage(mobile, (m) => m.id === "m2");
    expect(back).toMatchObject({ ok: true, result: { sessions: [] } });
    desktop.close();
    mobile.close();
  });

  it("broadcasts a desktop terminal.output event to the paired mobile", async () => {
    const port = await listen();
    const { desktop, mobile } = await pairedPair(port);
    const evt = nextMessage(mobile, (m) => m.kind === "event" && m.event === "terminal.output");
    desktop.send(JSON.stringify({ version: "2026-07-11", kind: "event", event: "terminal.output", data: { sessionId: "s1", seq: 1, data: "hello" }, sentAt: "2026-07-11T10:00:02Z" }));
    const got = await evt;
    expect(got.data).toMatchObject({ sessionId: "s1", seq: 1, data: "hello" });
    desktop.close();
    mobile.close();
  });

  it("rejects a forwarded request from an unpaired mobile with MOBILE_NOT_PAIRED", async () => {
    const port = await listen();
    const mobile = await open(port, "/v1/ws/mobile");
    mobile.send(req("session.list", "m2", {}));
    const resp = await nextMessage(mobile, (m) => m.id === "m2");
    expect(resp).toMatchObject({ ok: false, error: { code: "MOBILE_NOT_PAIRED" } });
    mobile.close();
  });

  it("emits mobile.disconnected to desktop when the mobile socket closes", async () => {
    const port = await listen();
    const { desktop, mobile } = await pairedPair(port);
    const gone = nextMessage(desktop, (m) => m.kind === "event" && m.event === "mobile.disconnected");
    mobile.close();
    const evt = await gone;
    expect(evt.data.mobileDeviceId).toBe("mob_a");
    desktop.close();
  });
});
