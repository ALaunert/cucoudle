import { WebSocket } from "ws";

const RELAY = process.env.RELAY_URL ?? "ws://localhost:8787/v1/ws/desktop";
const DESKTOP_ID = process.env.DESKTOP_ID ?? "desk_demo";
const ws = new WebSocket(RELAY);

function send(msg: Record<string, unknown>) {
  ws.send(JSON.stringify({ version: "2026-07-11", sentAt: new Date().toISOString(), ...msg }));
}

let seq = 0;
ws.on("open", () => {
  send({ kind: "request", id: "d1", method: "desktop.register", params: { desktopId: DESKTOP_ID, desktopName: "Fake Desktop", platform: process.platform, appVersion: "0.1.0" } });
  send({ kind: "request", id: "d2", method: "desktop.pairing.create", params: { ttlSeconds: 300 } });
});

ws.on("message", (raw: Buffer) => {
  const m = JSON.parse(raw.toString());
  if (m.id === "d2" && m.ok) {
    console.log("PAIRING CODE:", m.result.pairingCode);
    console.log("QR PAYLOAD:", JSON.stringify(m.result.qrPayload));
  }
  if (m.kind === "event" && m.event === "mobile.paired") console.log("mobile paired:", m.data.mobileDevice.name);
  if (m.kind === "request" && m.method === "session.list") {
    send({ kind: "response", id: m.id, ok: true, result: { sessions: [{ id: "sess_1", agent: "claude", title: "Claude · demo", command: "claude", argv: [], cwd: process.cwd(), status: "running", createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }] } });
  }
  if (m.kind === "request" && m.method === "session.subscribe") {
    send({ kind: "response", id: m.id, ok: true, result: { session: { id: "sess_1", agent: "claude", title: "Claude · demo", command: "claude", argv: [], cwd: process.cwd(), status: "running", createdAt: new Date().toISOString(), lastActivityAt: new Date().toISOString() }, mode: "live" } });
    const timer = setInterval(() => {
      seq += 1;
      send({ kind: "event", event: "terminal.output", data: { sessionId: "sess_1", seq, data: `tick ${seq}\r\n` } });
      if (seq >= 5) clearInterval(timer);
    }, 1000);
    // Simulate a Claude approval prompt so the interaction flow is testable without a real CLI.
    setTimeout(() => {
      seq += 1;
      send({ kind: "event", event: "terminal.output", data: { sessionId: "sess_1", seq, data: "Allow Claude to run `npm test`? [y/n]\r\n" } });
      send({ kind: "event", event: "interaction.requested", data: { interaction: {
        id: "int_demo", sessionId: "sess_1", kind: "approval", prompt: "Allow Claude to run npm test?", details: "npm test",
        options: [
          { id: "approve_once", label: "Allow once", intent: "approveOnce" },
          { id: "approve_session", label: "Allow for session", intent: "approveSession" },
          { id: "reject", label: "Reject", intent: "reject" },
        ],
        allowsText: true, allowsTerminalInput: true, createdAt: new Date().toISOString(), terminalSeq: seq } } });
    }, 2500);
  }
  if (m.kind === "request" && m.method === "interaction.respond") {
    const r = m.params.response;
    const picked = r.type === "options" ? r.optionIds.join(",") : r.type;
    console.log("interaction response from mobile:", JSON.stringify(r));
    send({ kind: "response", id: m.id, ok: true, result: { accepted: true } });
    seq += 1;
    send({ kind: "event", event: "terminal.output", data: { sessionId: "sess_1", seq, data: `> ${picked}\r\n` } });
    send({ kind: "event", event: "interaction.resolved", data: { interactionId: m.params.interactionId, sessionId: m.params.sessionId, resolution: r.type === "cancel" ? "cancelled" : "answered", optionIds: r.type === "options" ? r.optionIds : undefined, resolvedAt: new Date().toISOString() } });
  }
  if (m.kind === "request" && m.method === "session.input") {
    console.log("input from mobile:", JSON.stringify(m.params.data));
    send({ kind: "response", id: m.id, ok: true, result: { accepted: true } });
    seq += 1;
    send({ kind: "event", event: "terminal.output", data: { sessionId: "sess_1", seq, data: `echo: ${m.params.data}` } });
  }
  if (m.kind === "request" && m.method === "session.interrupt") {
    send({ kind: "response", id: m.id, ok: true, result: { interrupted: true } });
  }
});

ws.on("close", () => console.log("desktop socket closed"));
