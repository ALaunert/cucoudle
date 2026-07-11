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

function req(method: string, id: string, params: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "request", id, method, params, sentAt: "2026-07-11T10:00:00Z" });
}
function evt(event: string, data: Record<string, unknown>) {
  return JSON.stringify({ version: "2026-07-11", kind: "event", event, data, sentAt: "2026-07-11T10:00:00Z" });
}

async function pairedPair(port: number): Promise<{ desktop: WebSocket; dRead: Reader; mobile: WebSocket; mRead: Reader }> {
  const desktop = await open(port, "/v1/ws/desktop");
  const dRead = reader(desktop);
  desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
  await dRead((m) => m.id === "d1");
  desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
  const code = (await dRead((m) => m.id === "d2")).result.pairingCode as string;

  const mobile = await open(port, "/v1/ws/mobile");
  const mRead = reader(mobile);
  mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
  await mRead((m) => m.id === "m1" && m.ok);
  return { desktop, dRead, mobile, mRead };
}

describe("structured interactions over the relay", () => {
  it("fans out interaction.requested from desktop to mobile", async () => {
    const port = await listen();
    const { desktop, mobile, mRead } = await pairedPair(port);
    const seen = mRead((m) => m.kind === "event" && m.event === "interaction.requested");
    desktop.send(evt("interaction.requested", {
      interaction: {
        id: "int_1", sessionId: "sess_1", kind: "approval", prompt: "Allow npm test?",
        options: [{ id: "approve_once", label: "Allow once", intent: "approveOnce" }, { id: "reject", label: "Reject", intent: "reject" }],
        allowsText: true, allowsTerminalInput: true, createdAt: "2026-07-11T10:02:00Z", terminalSeq: 130,
      },
    }));
    const got = await seen;
    expect(got.data.interaction.id).toBe("int_1");
    expect(got.data.interaction.options[0].intent).toBe("approveOnce");
    desktop.close();
    mobile.close();
  });

  it("forwards interaction.respond from mobile to desktop and routes the ack back", async () => {
    const port = await listen();
    const { desktop, dRead, mobile, mRead } = await pairedPair(port);

    const forwarded = dRead((m) => m.kind === "request" && m.method === "interaction.respond");
    mobile.send(req("interaction.respond", "ir1", {
      sessionId: "sess_1", interactionId: "int_1", response: { type: "options", optionIds: ["approve_once"] },
    }));
    const got = await forwarded;
    expect(got.id).toBe("ir1");
    expect(got.params.response.optionIds).toEqual(["approve_once"]);

    desktop.send(JSON.stringify({ version: "2026-07-11", kind: "response", id: "ir1", ok: true, result: { accepted: true }, sentAt: "2026-07-11T10:02:05Z" }));
    const ack = await mRead((m) => m.id === "ir1");
    expect(ack).toMatchObject({ ok: true, result: { accepted: true } });

    const resolved = mRead((m) => m.kind === "event" && m.event === "interaction.resolved");
    desktop.send(evt("interaction.resolved", { interactionId: "int_1", sessionId: "sess_1", resolution: "answered", optionIds: ["approve_once"], resolvedAt: "2026-07-11T10:02:06Z" }));
    const res = await resolved;
    expect(res.data.resolution).toBe("answered");
    desktop.close();
    mobile.close();
  });
});
