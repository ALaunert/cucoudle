import { WebSocket } from "ws";

const RELAY = process.env.RELAY_URL ?? "ws://localhost:8787/v1/ws/mobile";
const DESKTOP_ID = process.env.DESKTOP_ID ?? "desk_demo";
const CODE = process.env.PAIRING_CODE;
if (!CODE) {
  console.error("Set PAIRING_CODE=<code printed by fake-desktop>");
  process.exit(1);
}
const ws = new WebSocket(RELAY);

function send(msg: Record<string, unknown>) {
  ws.send(JSON.stringify({ version: "2026-07-11", sentAt: new Date().toISOString(), ...msg }));
}

ws.on("open", () => {
  send({ kind: "request", id: "m1", method: "mobile.pair", params: { desktopId: DESKTOP_ID, pairingCode: CODE, mobileDevice: { id: "mob_demo", name: "Fake iPhone", platform: "ios" } } });
});

ws.on("message", (raw: Buffer) => {
  const m = JSON.parse(raw.toString());
  if (m.id === "m1") {
    if (!m.ok) { console.error("pair failed:", m.error); process.exit(1); }
    console.log("paired with", m.result.desktopName);
    send({ kind: "request", id: "m2", method: "session.list", params: {} });
  }
  if (m.id === "m2" && m.ok) {
    console.log("sessions:", m.result.sessions.map((s: { id: string; title: string }) => `${s.id} (${s.title})`));
    send({ kind: "request", id: "m3", method: "session.subscribe", params: { sessionId: m.result.sessions[0].id } });
    setTimeout(() => send({ kind: "request", id: "m4", method: "session.input", params: { sessionId: "sess_1", data: "hello from phone\n", inputMode: "text" } }), 2500);
  }
  if (m.kind === "event" && m.event === "terminal.output") process.stdout.write(m.data.data);
  if (m.kind === "event" && m.event === "interaction.requested") {
    const it = m.data.interaction;
    console.log(`\n[interaction ${it.id}] ${it.prompt}`);
    console.log("options:", it.options.map((o: { id: string; label: string }) => `${o.id} (${o.label})`).join(" | "));
    const choice = process.env.INTERACTION_CHOICE ?? "approve_once";
    console.log(`auto-responding with "${choice}"`);
    send({ kind: "request", id: "ir1", method: "interaction.respond", params: { sessionId: it.sessionId, interactionId: it.id, response: { type: "options", optionIds: [choice] } } });
  }
  if (m.kind === "event" && m.event === "interaction.resolved") console.log("interaction resolved:", m.data.resolution, m.data.optionIds ?? "");
  if (m.kind === "event" && m.event === "session.ended") console.log("\nsession ended:", m.data.exitCode);
});
