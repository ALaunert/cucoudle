/**
 * Cross-language integration smoke: real relay <-> real Python desktop daemon <-> mobile WS client.
 *
 * Unlike the in-process vitest suites (which fake the desktop), this drives the ACTUAL
 * `cucoudle_desktop` daemon over real sockets, so it catches contract drift between the
 * TypeScript/Zod protocol and the desktop's Pydantic models.
 *
 * Run (against an already-running relay):
 *   CUCOUDLE_PY=/path/to/python RELAY_WS=ws://localhost:8787 npx tsx tests/integration/desktop-relay-smoke.ts
 *
 * Env:
 *   RELAY_WS     base relay ws URL (default ws://localhost:8787) — must already be running
 *   CUCOUDLE_PY  python interpreter with pydantic+websockets installed (default python3)
 *
 * Requires the desktop package importable: PYTHONPATH is set to apps/desktop automatically.
 * Not part of `npm test` — it needs Python and a live relay.
 */
import { spawn } from "node:child_process";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WebSocket } from "ws";

const REPO = path.resolve(import.meta.dirname, "../..");
const RELAY_BASE = process.env.RELAY_WS ?? "ws://localhost:8787";
const PY = process.env.CUCOUDLE_PY ?? "python3";
const CAT = process.env.CUCOUDLE_ECHO_BIN ?? "/usr/bin/cat";

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "cucoudle-it-"));
const DESKTOP_ID = "desk_it_" + Date.now().toString(36);
const SOCK = path.join(HOME, "daemon.sock");

function log(s: string) { console.log(`[harness] ${s}`); }
function fail(s: string): never { throw new Error(s); }

// ---- IPC framing (mirror of apps/desktop/cucoudle_desktop/ipc.py) ----
const HELLO = 0x01, CONTROL_REQUEST = 0x10, READY = 0x81, CONTROL_RESPONSE = 0x90;
function frame(type: number, payload: Buffer): Buffer {
  const h = Buffer.alloc(5);
  h.writeUInt8(type, 0);
  h.writeUInt32BE(payload.length, 1);
  return Buffer.concat([h, payload]);
}
function frameJson(type: number, obj: unknown): Buffer {
  return frame(type, Buffer.from(JSON.stringify(obj), "utf8"));
}
function makeFrameReader(cb: (type: number, payload: Buffer) => void) {
  let buf = Buffer.alloc(0);
  return (chunk: Buffer) => {
    buf = Buffer.concat([buf, chunk]);
    while (buf.length >= 5) {
      const type = buf.readUInt8(0);
      const len = buf.readUInt32BE(1);
      if (buf.length < 5 + len) break;
      const payload = buf.subarray(5, 5 + len);
      buf = buf.subarray(5 + len);
      cb(type, payload);
    }
  };
}

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }

function controlRequest(method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const sock = net.connect(SOCK);
    const read = makeFrameReader((type, payload) => {
      if (type === CONTROL_RESPONSE) { sock.end(); resolve(JSON.parse(payload.toString("utf8"))); }
    });
    sock.on("connect", () => sock.write(frameJson(CONTROL_REQUEST, { method, params })));
    sock.on("data", read);
    sock.on("error", reject);
    sock.on("close", () => reject(new Error("control socket closed without response")));
    setTimeout(() => { sock.destroy(); reject(new Error("control timeout")); }, 8000);
  });
}

type Reader = (p: (m: any) => boolean, timeoutMs?: number) => Promise<any>;
function mobileReader(ws: WebSocket): Reader {
  const queue: any[] = [];
  const waiters: { p: (m: any) => boolean; resolve: (m: any) => void; timer: NodeJS.Timeout }[] = [];
  ws.on("message", (raw: Buffer) => {
    const m = JSON.parse(raw.toString());
    const i = waiters.findIndex((w) => w.p(m));
    if (i >= 0) { clearTimeout(waiters[i]!.timer); waiters.splice(i, 1)[0]!.resolve(m); }
    else queue.push(m);
  });
  return (p, timeoutMs = 8000) => new Promise((resolve, reject) => {
    const i = queue.findIndex(p);
    if (i >= 0) return resolve(queue.splice(i, 1)[0]);
    const timer = setTimeout(() => reject(new Error("mobile read timeout")), timeoutMs);
    waiters.push({ p, resolve, timer });
  });
}
function mReq(ws: WebSocket, method: string, id: string, params: Record<string, unknown>) {
  ws.send(JSON.stringify({ version: "2026-07-11", kind: "request", id, method, params, sentAt: new Date().toISOString() }));
}

async function main() {
  fs.writeFileSync(path.join(HOME, "config.json"), JSON.stringify({
    desktopId: DESKTOP_ID, desktopName: "IT Desktop", platform: "linux", appVersion: "0.1.0",
    relayUrl: RELAY_BASE, realBinaries: { claude: CAT },
  }, null, 2));
  log(`home=${HOME} desktopId=${DESKTOP_ID} relay=${RELAY_BASE}`);

  const daemon = spawn(PY, ["-m", "cucoudle_desktop", "daemon"], {
    cwd: REPO,
    env: { ...process.env, CUCOUDLE_HOME: HOME, CUCOUDLE_RELAY_URL: RELAY_BASE, PYTHONPATH: path.join(REPO, "apps/desktop") },
  });
  daemon.stderr.on("data", (d) => process.stderr.write(`[daemon] ${d}`));
  daemon.on("exit", (c) => log(`daemon exited code=${c}`));

  const cleanup = () => { try { daemon.kill("SIGINT"); } catch {} try { fs.rmSync(HOME, { recursive: true, force: true }); } catch {} };

  try {
    for (let i = 0; i < 50 && !fs.existsSync(SOCK); i++) await sleep(200);
    if (!fs.existsSync(SOCK)) fail("daemon socket never appeared");
    log("daemon socket up");

    let pairing: any;
    for (let i = 0; i < 20; i++) {
      const resp = await controlRequest("pairing.create", { ttlSeconds: 300 }).catch((e) => ({ ok: false, error: { message: String(e) } }));
      if (resp.ok) { pairing = resp.result; break; }
      await sleep(500);
    }
    if (!pairing) fail("pairing.create never succeeded (daemon did not register with relay?)");
    log(`STAGE 1 OK — desktop registered + pairing code=${pairing.pairingCode}`);

    const ws = new WebSocket(`${RELAY_BASE}/v1/ws/mobile`);
    await new Promise<void>((res, rej) => { ws.once("open", () => res()); ws.once("error", rej); });
    const read = mobileReader(ws);
    mReq(ws, "mobile.pair", "m1", { desktopId: DESKTOP_ID, pairingCode: pairing.pairingCode, mobileDevice: { id: "mob_it", name: "IT phone", platform: "android" } });
    const pair = await read((m) => m.id === "m1");
    if (!pair.ok) fail(`mobile.pair failed: ${JSON.stringify(pair.error)}`);
    log(`STAGE 2 OK — mobile paired with ${pair.result.desktopName}`);

    mReq(ws, "session.list", "m2", {});
    const list0 = await read((m) => m.id === "m2");
    if (!list0.ok || !Array.isArray(list0.result.sessions)) fail(`session.list bad shape: ${JSON.stringify(list0)}`);
    log(`STAGE 3 OK — session.list round-trip (sessions=${list0.result.sessions.length})`);

    const shim = net.connect(SOCK);
    let sessionId = "";
    const gotReady = new Promise<void>((res) => {
      shim.on("data", makeFrameReader((type, payload) => {
        if (type === READY) { sessionId = JSON.parse(payload.toString()).sessionId; res(); }
      }));
    });
    await new Promise<void>((res, rej) => { shim.on("connect", () => res()); shim.on("error", rej); });
    shim.write(frameJson(HELLO, { tool: "claude", argv: [], cwd: HOME, env: {}, cols: 80, rows: 24 }));
    await Promise.race([gotReady, sleep(5000)]);
    if (!sessionId) fail("no READY/sessionId from daemon after HELLO");
    log(`STAGE 4 OK — managed session spawned: ${sessionId}`);

    mReq(ws, "session.list", "m3", {});
    const list1 = await read((m) => m.id === "m3");
    const found = list1.result.sessions.find((s: any) => s.id === sessionId);
    if (!found) fail(`spawned session ${sessionId} not in mobile session.list`);
    log(`STAGE 5 OK — mobile sees session (agent=${found.agent}, status=${found.status})`);

    mReq(ws, "session.subscribe", "m4", { sessionId });
    const sub = await read((m) => m.id === "m4");
    if (!sub.ok) fail(`session.subscribe failed: ${JSON.stringify(sub.error)}`);
    log(`STAGE 6 OK — subscribe mode=${sub.result.mode}`);

    const marker = "ping-" + Math.floor(Math.random() * 1e6);
    const gotOutput = read((m) => m.kind === "event" && m.event === "terminal.output" && m.data.sessionId === sessionId && String(m.data.data).includes(marker), 8000);
    mReq(ws, "session.input", "m5", { sessionId, data: marker + "\n", inputMode: "text" });
    const ack = await read((m) => m.id === "m5");
    if (!ack.ok) fail(`session.input failed: ${JSON.stringify(ack.error)}`);
    const out = await gotOutput;
    log(`STAGE 7 OK — input echoed back via terminal.output: ${JSON.stringify(out.data.data)}`);

    shim.end();
    ws.close();
    log("ALL STAGES PASSED — real desktop <-> relay <-> mobile round-trip works");
  } finally {
    cleanup();
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(`[FAIL] ${e.message ?? e}`); process.exit(1); });
