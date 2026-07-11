# Cucoudle protocol contracts

## Purpose

This document defines the MVP contracts between:

- mobile frontend and relay backend;
- desktop daemon and relay backend;
- mobile frontend and desktop daemon through the relay.

The relay is a transport and pairing broker. The desktop daemon is the source of truth for CLI sessions. The mobile app is a client that renders desktop state and sends user actions.

This document is the target product contract. The currently implemented subset supports terminal output, UTF-8 `text/raw` input, interrupt and resize. The `bytes`, `keys`, and structured interaction additions below are specified but require follow-up changes in `packages/protocol`, desktop adapters, relay allowlists and mobile UI before they are considered implemented.

## Ownership

| Area | Owner | Source of truth |
| --- | --- | --- |
| Session lifecycle | Desktop | Desktop daemon |
| Terminal output and PTY input | Desktop | Desktop daemon |
| Pairing and online presence | Backend | Relay runtime |
| Mobile UI state | Mobile | Mobile local cache |
| Protocol names and schemas | Backend | `packages/protocol` |

The backend owner maintains the shared TypeScript schemas. Desktop mirrors the same payloads with Pydantic models.

## Transport

MVP transport is WebSocket over TLS for remote usage and plain WebSocket for local development.

```text
Desktop daemon -> Relay:  wss://<relay>/v1/ws/desktop
Mobile app     -> Relay:  wss://<relay>/v1/ws/mobile
```

Development may use:

```text
ws://localhost:8787/v1/ws/desktop
ws://localhost:8787/v1/ws/mobile
```

Health endpoints:

```text
GET /healthz -> 200 when process is alive
GET /readyz  -> 200 when WebSocket routes are ready
```

## Wire envelope

Every WebSocket message uses one JSON envelope.

```ts
export type ProtocolVersion = "2026-07-11";

export type WireMessage =
  | RequestMessage
  | ResponseMessage
  | EventMessage;

export type RequestMessage = {
  version: ProtocolVersion;
  kind: "request";
  id: string;
  method: string;
  params?: Record<string, unknown>;
  sentAt: string;
};

export type ResponseMessage = {
  version: ProtocolVersion;
  kind: "response";
  id: string;
  ok: boolean;
  result?: Record<string, unknown>;
  error?: ProtocolError;
  sentAt: string;
};

export type EventMessage = {
  version: ProtocolVersion;
  kind: "event";
  event: string;
  data: Record<string, unknown>;
  sentAt: string;
};

export type ProtocolError = {
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
};
```

Rules:

- `id` is required for requests and responses.
- A response must reuse the request `id`.
- Events do not require `id`.
- `sentAt` is ISO 8601 UTC.
- Unknown methods or events must not crash the receiver. They should produce `UNSUPPORTED_METHOD` for requests or be ignored for events.

## Error codes

```ts
export type ErrorCode =
  | "INVALID_MESSAGE"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_METHOD"
  | "UNSUPPORTED_CAPABILITY"
  | "UNAUTHORIZED"
  | "PAIRING_EXPIRED"
  | "PAIRING_NOT_FOUND"
  | "DESKTOP_OFFLINE"
  | "MOBILE_NOT_PAIRED"
  | "SESSION_NOT_FOUND"
  | "SESSION_STOPPED"
  | "TOOL_NOT_FOUND"
  | "DAEMON_UNAVAILABLE"
  | "PTY_WRITE_FAILED"
  | "INTERACTION_NOT_FOUND"
  | "INTERACTION_STALE"
  | "INTERNAL_ERROR";
```

Errors should be actionable. `message` is safe to show in development UI. Production UI may map `code` to localized copy later.

## Core domain models

```ts
export type MobilePlatform = "ios" | "android" | "unknown";

export type MobileDevice = {
  id: string;
  name: string;
  platform: MobilePlatform;
};

export type SessionStatus =
  | "starting"
  | "running"
  | "waiting"
  | "stopped"
  | "error";

export type AgentKind =
  | "claude"
  | "codex"
  | "cursor"
  | "shell"
  | "unknown";

export type Session = {
  id: string;
  agent: AgentKind;
  title: string;
  command: string;
  argv: string[];
  cwd: string;
  status: SessionStatus;
  createdAt: string;
  lastActivityAt: string;
  exitCode?: number;
};
```

Terminal output is streamed as UTF-8 text chunks. ANSI escape sequences are allowed and should be preserved by the relay. Chunks are not line-based and may split in the middle of a line.

```ts
export type TerminalOutput = {
  sessionId: string;
  seq: number;
  data: string;
};
```

`seq` is monotonically increasing per desktop daemon connection. Desktop uses it for reconnect and replay decisions.

## Capability negotiation

Protocol version compatibility is not enough to enable optional behavior. Mobile, relay and desktop negotiate additive capabilities during pairing/resume.

```ts
export type KnownProtocolCapability =
  | "terminal.output.stream"
  | "terminal.output.ansi"
  | "terminal.output.alternateScreen"
  | "terminal.input.text"
  | "terminal.input.raw"
  | "terminal.input.bytes"
  | "terminal.input.keys"
  | "terminal.resize"
  | "session.interrupt"
  | "interaction.structured"
  | "interaction.reconnect";

// Wire schemas accept any non-empty string for forward compatibility.
export type ProtocolCapability = KnownProtocolCapability | (string & {});

export type CapabilityOffer = {
  capabilities: ProtocolCapability[];
};
```

Rules:

- Desktop sends its offer in `desktop.register.params.capabilities`.
- Mobile sends its offer in `mobile.pair.params.capabilities` and `mobile.resume.params.capabilities`.
- Relay has its own supported offer. `desktop.register` returns the desktop/relay intersection as `acceptedCapabilities`; pair/resume then returns the mobile/accepted-desktop intersection as `negotiatedCapabilities`.
- Relay includes the same intersection in `mobile.paired` so desktop knows which events and payloads the connected mobile can consume.
- Relay stores the negotiated set per mobile WebSocket connection, not only per desktop, because two paired phones may support different features.
- Relay forwards `interaction.*` events only to mobile connections with `interaction.structured` and accepts `interaction.respond` only from such connections.
- Desktop may keep detecting and storing an active interaction independently of mobile presence. Capability filtering affects delivery and controls, not the PTY state machine.
- A feature must not be used unless it is present in `negotiatedCapabilities`.
- Unknown capability strings are ignored, not rejected. Implementations intersect only capabilities they understand.
- Missing capability fields mean baseline only: `terminal.output.stream`, `terminal.input.text`, `terminal.input.raw`, `terminal.resize`, and `session.interrupt`.
- `interaction.structured` requires support from all three participants because relay must forward the method/events, desktop must own bindings, and mobile must render/respond safely.

Capability names are additive. Removing or changing the meaning of a capability requires a protocol version bump.

## Backend <-> Mobile contract

### Mobile connect

Mobile opens `/v1/ws/mobile`, then sends `mobile.pair`.

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_1",
  "method": "mobile.pair",
  "params": {
    "desktopId": "desk_123",
    "pairingCode": "123456",
    "mobileDevice": {
      "id": "mob_abc",
      "name": "Sasha iPhone",
      "platform": "ios"
    },
    "capabilities": [
      "terminal.output.stream",
      "terminal.output.ansi",
      "terminal.input.text",
      "terminal.input.raw",
      "terminal.input.keys",
      "interaction.structured",
      "interaction.reconnect"
    ]
  },
  "sentAt": "2026-07-11T10:00:00Z"
}
```

Success response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_1",
  "ok": true,
  "result": {
    "desktopId": "desk_123",
    "desktopName": "MacBook Pro",
    "paired": true,
    "mobileSessionToken": "mst_dev_abc123",
    "mobileSessionExpiresAt": "2026-07-11T18:00:01Z",
    "negotiatedCapabilities": [
      "terminal.output.stream",
      "terminal.input.text",
      "terminal.input.raw"
    ]
  },
  "sentAt": "2026-07-11T10:00:01Z"
}
```

Failure cases:

- `PAIRING_NOT_FOUND`
- `PAIRING_EXPIRED`
- `DESKTOP_OFFLINE`
- `UNSUPPORTED_PROTOCOL`

### Mobile resume

After a short network drop, mobile may reconnect without scanning QR again while the relay still recognizes the session token.

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_resume_1",
  "method": "mobile.resume",
  "params": {
    "desktopId": "desk_123",
    "mobileDeviceId": "mob_abc",
    "mobileSessionToken": "mst_dev_abc123",
    "capabilities": [
      "terminal.output.stream",
      "terminal.input.text",
      "terminal.input.raw",
      "terminal.input.keys",
      "interaction.structured",
      "interaction.reconnect"
    ]
  },
  "sentAt": "2026-07-11T10:10:00Z"
}
```

Success response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_resume_1",
  "ok": true,
  "result": {
    "desktopId": "desk_123",
    "desktopName": "MacBook Pro",
    "resumed": true,
    "negotiatedCapabilities": [
      "terminal.output.stream",
      "terminal.input.text",
      "terminal.input.raw"
    ]
  },
  "sentAt": "2026-07-11T10:10:00Z"
}
```

If `mobile.resume` fails with `UNAUTHORIZED`, `DESKTOP_OFFLINE`, or `PAIRING_EXPIRED`, the mobile app returns to the pairing screen.

### Mobile session list

After pairing, mobile sends `session.list`. Relay forwards it to desktop and returns the desktop response.

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_2",
  "method": "session.list",
  "params": {},
  "sentAt": "2026-07-11T10:00:05Z"
}
```

Response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_2",
  "ok": true,
  "result": {
    "sessions": [
      {
        "id": "sess_1",
        "agent": "claude",
        "title": "Claude · cucoudle",
        "command": "claude",
        "argv": [],
        "cwd": "/Users/sasha/server/cucoudle",
        "status": "running",
        "createdAt": "2026-07-11T09:58:00Z",
        "lastActivityAt": "2026-07-11T10:00:04Z"
      }
    ]
  },
  "sentAt": "2026-07-11T10:00:05Z"
}
```

### Mobile subscribe to session

Mobile subscribes before rendering a session detail screen.

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_3",
  "method": "session.subscribe",
  "params": {
    "sessionId": "sess_1",
    "afterSeq": 120
  },
  "sentAt": "2026-07-11T10:00:10Z"
}
```

Response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_3",
  "ok": true,
  "result": {
    "session": {
      "id": "sess_1",
      "agent": "claude",
      "title": "Claude · cucoudle",
      "command": "claude",
      "argv": [],
      "cwd": "/Users/sasha/server/cucoudle",
      "status": "running",
      "createdAt": "2026-07-11T09:58:00Z",
      "lastActivityAt": "2026-07-11T10:00:09Z"
    },
    "mode": "replay",
    "events": []
  },
  "sentAt": "2026-07-11T10:00:10Z"
}
```

`mode` values:

- `replay`: response includes missed events after `afterSeq`;
- `snapshot`: desktop could not replay from `afterSeq`, so response includes `terminalBuffer`;
- `live`: no replay is needed.

Snapshot response shape:

```ts
export type SessionSubscribeResult = {
  session: Session;
  mode: "replay" | "snapshot" | "live";
  events?: EventMessage[];
  terminalBuffer?: string;
  lastSeq?: number;
  activeInteraction?: InteractionRequest;
};
```

### Events mobile receives

Relay forwards these desktop events to paired mobile clients:

```ts
export type DesktopEventName =
  | "session.created"
  | "session.updated"
  | "session.removed"
  | "terminal.output"
  | "interaction.requested"
  | "interaction.updated"
  | "interaction.resolved"
  | "session.ended";
```

Session event payloads:

```ts
export type SessionCreatedData = {
  session: Session;
};

export type SessionUpdatedData = {
  session: Session;
};

export type SessionRemovedData = {
  sessionId: string;
};

export type SessionEndedData = {
  sessionId: string;
  exitCode?: number;
};
```

Terminal output event:

```json
{
  "version": "2026-07-11",
  "kind": "event",
  "event": "terminal.output",
  "data": {
    "sessionId": "sess_1",
    "seq": 121,
    "data": "Running tests...\\r\\n"
  },
  "sentAt": "2026-07-11T10:00:12Z"
}
```

## Desktop <-> Backend contract

### Desktop register

Desktop opens `/v1/ws/desktop`, then sends `desktop.register`.

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_d1",
  "method": "desktop.register",
  "params": {
    "desktopId": "desk_123",
    "desktopName": "MacBook Pro",
    "platform": "macos",
    "appVersion": "0.1.0",
    "capabilities": [
      "terminal.output.stream",
      "terminal.output.ansi",
      "terminal.input.text",
      "terminal.input.raw",
      "terminal.input.bytes",
      "terminal.input.keys",
      "terminal.resize",
      "session.interrupt",
      "interaction.structured",
      "interaction.reconnect"
    ]
  },
  "sentAt": "2026-07-11T09:59:00Z"
}
```

Response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_d1",
  "ok": true,
  "result": {
    "registered": true,
    "acceptedCapabilities": [
      "terminal.output.stream",
      "terminal.input.text",
      "terminal.input.raw",
      "terminal.resize",
      "session.interrupt"
    ]
  },
  "sentAt": "2026-07-11T09:59:00Z"
}
```

### Desktop asks relay to create pairing code

Request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_d2",
  "method": "desktop.pairing.create",
  "params": {
    "ttlSeconds": 300
  },
  "sentAt": "2026-07-11T09:59:05Z"
}
```

Response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_d2",
  "ok": true,
  "result": {
    "desktopId": "desk_123",
    "pairingCode": "123456",
    "expiresAt": "2026-07-11T10:04:05Z",
    "qrPayload": {
      "relayUrl": "wss://relay.example.test/v1/ws/mobile",
      "desktopId": "desk_123",
      "pairingCode": "123456",
      "expiresAt": "2026-07-11T10:04:05Z"
    }
  },
  "sentAt": "2026-07-11T09:59:05Z"
}
```

### Relay notifies desktop about paired mobile

When `mobile.pair` succeeds, relay sends this event to the desktop connection. Desktop uses it for the settings UI and connected-device list.

```json
{
  "version": "2026-07-11",
  "kind": "event",
  "event": "mobile.paired",
  "data": {
    "mobileDevice": {
      "id": "mob_abc",
      "name": "Sasha iPhone",
      "platform": "ios"
    },
    "mobileSessionExpiresAt": "2026-07-11T18:00:01Z",
    "negotiatedCapabilities": [
      "terminal.output.stream",
      "terminal.input.text",
      "terminal.input.raw"
    ]
  },
  "sentAt": "2026-07-11T10:00:01Z"
}
```

If a paired mobile socket disconnects, relay may send:

```json
{
  "version": "2026-07-11",
  "kind": "event",
  "event": "mobile.disconnected",
  "data": {
    "mobileDeviceId": "mob_abc"
  },
  "sentAt": "2026-07-11T10:30:00Z"
}
```

`mobile.disconnected` is advisory. Desktop must not stop local CLI sessions because a phone disconnected.

### Relay forwards mobile requests to desktop

After pairing, relay forwards mobile session requests to desktop unchanged except for adding relay metadata if needed.

Forwarding rule:

- Preserve `version`, `kind`, `id`, `method`, `params`, and `sentAt`.
- Desktop response uses the same `id`.
- Relay forwards desktop response back to the originating mobile connection.

Relay may reject before forwarding when desktop is offline or mobile is not paired.

Forwarded mobile methods include session methods and `interaction.respond`. The relay does not inspect, translate, approve, reject, or persist interaction content.

## Desktop <-> Mobile logical contract

The mobile app does not talk directly to desktop in the remote MVP. The logical contract still belongs to desktop and mobile; relay only forwards it.

### Session input

`session.input` is the universal PTY write method. It has four additive modes so the phone can reproduce every input available in the local CLI while existing `text` and `raw` clients remain compatible.

```ts
export type TerminalModifier = "ctrl" | "alt" | "shift" | "meta";

export type TerminalKeyName =
  | "enter" | "escape" | "tab" | "backspace" | "delete" | "insert"
  | "arrowUp" | "arrowDown" | "arrowLeft" | "arrowRight"
  | "home" | "end" | "pageUp" | "pageDown" | "space"
  | "f1" | "f2" | "f3" | "f4" | "f5" | "f6"
  | "f7" | "f8" | "f9" | "f10" | "f11" | "f12";

export type TerminalKeyStroke = {
  key: TerminalKeyName | { character: string };
  modifiers?: TerminalModifier[];
};

export type SessionInputParams =
  | { sessionId: string; inputMode: "text"; data: string; submit?: boolean }
  | { sessionId: string; inputMode: "raw"; data: string }
  | { sessionId: string; inputMode: "bytes"; dataBase64: string }
  | { sessionId: string; inputMode: "keys"; keys: TerminalKeyStroke[] };
```

Mode rules:

- `text` is composer input. With `submit: true`, desktop appends the PTY Enter sequence if needed. `submit` defaults to `false` for compatibility with clients that already append a newline.
- `raw` writes the UTF-8 bytes of `data` exactly. Control and escape characters may be represented with JSON Unicode escapes.
- `bytes` base64-decodes and writes arbitrary bytes exactly. This is the terminal-parity fallback when UTF-8 is insufficient.
- `keys` maps named keys and modifiers to the sequence appropriate for the desktop PTY. It covers navigation, function keys, Ctrl/Alt/Shift/Meta combinations, Enter, Escape, Tab, Backspace and Delete.

The normal composer uses `text`; a terminal keyboard accessory uses `keys`; provider adapters and advanced terminal mode may use `raw` or `bytes`. Mobile must not automatically retry input because duplicate bytes are user-visible.

Mobile request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_4",
  "method": "session.input",
  "params": {
    "sessionId": "sess_1",
    "data": "continue with the minimal implementation",
    "inputMode": "text",
    "submit": true
  },
  "sentAt": "2026-07-11T10:01:00Z"
}
```

Desktop response:

```json
{
  "version": "2026-07-11",
  "kind": "response",
  "id": "req_4",
  "ok": true,
  "result": {
    "accepted": true
  },
  "sentAt": "2026-07-11T10:01:00Z"
}
```

Legacy `inputMode` behavior:

- `text`: app composer input; mobile should append `\n` when sending a submitted message;
- `raw`: terminal-mode input; mobile sends exact bytes represented as a string.

Those two bullets describe the legacy payload shown above. New clients should use `submit: true` for composer submission and may also use `bytes` and `keys`. Successful responses may include `bytesWritten`. `accepted: true` only means input reached the active PTY; it does not mean the CLI accepted the semantic answer.

Named-key example:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_keys_1",
  "method": "session.input",
  "params": {
    "sessionId": "sess_1",
    "inputMode": "keys",
    "keys": [
      { "key": "arrowDown" },
      { "key": "enter" }
    ]
  },
  "sentAt": "2026-07-11T10:01:10Z"
}
```

### Structured CLI interactions

Raw terminal parity is always available. Known CLI prompts should additionally render as native mobile controls. Desktop provider adapters or high-confidence prompt detectors emit an interaction only when they can deterministically map a response back to the current PTY prompt.

```ts
export type InteractionKind =
  | "approval"
  | "confirmation"
  | "singleSelect"
  | "multiSelect"
  | "text";

export type InteractionOptionIntent =
  | "approve"
  | "approveOnce"
  | "approveSession"
  | "reject"
  | "cancel"
  | "neutral";

export type InteractionOption = {
  id: string;
  label: string;
  description?: string;
  intent: InteractionOptionIntent;
  shortcut?: string;
  disabled?: boolean;
};

export type InteractionRequest = {
  id: string;
  sessionId: string;
  kind: InteractionKind;
  prompt: string;
  details?: string;
  options?: InteractionOption[];
  allowsText: boolean;
  allowsTerminalInput: true;
  sensitive?: boolean;
  createdAt: string;
  terminalSeq?: number;
};
```

Desktop event example:

```json
{
  "version": "2026-07-11",
  "kind": "event",
  "event": "interaction.requested",
  "data": {
    "interaction": {
      "id": "int_42",
      "sessionId": "sess_1",
      "kind": "approval",
      "prompt": "Allow Claude to run npm test?",
      "details": "npm test",
      "options": [
        { "id": "approve_once", "label": "Allow once", "intent": "approveOnce" },
        { "id": "approve_session", "label": "Allow for session", "intent": "approveSession" },
        { "id": "reject", "label": "Reject", "intent": "reject" }
      ],
      "allowsText": true,
      "allowsTerminalInput": true,
      "createdAt": "2026-07-11T10:02:00Z",
      "terminalSeq": 130
    }
  },
  "sentAt": "2026-07-11T10:02:00Z"
}
```

Mobile renders approval intents as Approve/Reject actions, select options as a list, and `allowsText` as a composer. Labels come from desktop because Claude, Codex and Cursor may offer different choices such as allow once, allow for session, deny, or provide feedback.

```ts
export type InteractionResponse =
  | { type: "options"; optionIds: string[] }
  | { type: "text"; text: string; submit?: boolean }
  | { type: "cancel" };

export type InteractionRespondParams = {
  sessionId: string;
  interactionId: string;
  response: InteractionResponse;
};
```

Mobile response example:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_interaction_1",
  "method": "interaction.respond",
  "params": {
    "sessionId": "sess_1",
    "interactionId": "int_42",
    "response": {
      "type": "options",
      "optionIds": ["approve_once"]
    }
  },
  "sentAt": "2026-07-11T10:02:05Z"
}
```

Desktop validates that the interaction is current, translates the response using a binding stored only on desktop, writes the exact PTY input, and returns `{ "accepted": true }`. It then emits `interaction.resolved` with `interactionId`, `sessionId`, `resolution` and optional selected option IDs. `interaction.updated` replaces prompt/options without changing the interaction ID.

```ts
export type InteractionUpdatedData = {
  interaction: InteractionRequest;
};

export type InteractionResolvedData = {
  interactionId: string;
  sessionId: string;
  resolution: "answered" | "cancelled" | "superseded" | "sessionEnded";
  optionIds?: string[];
  resolvedAt: string;
};
```

Rules:

- Relay never guesses or generates an interaction response; it only forwards messages.
- Desktop rejects unknown interactions with `INTERACTION_NOT_FOUND` and prompts superseded by terminal state with `INTERACTION_STALE`.
- Mobile disables actions immediately after sending and never automatically retries them.
- Raw terminal controls and `session.input` remain available while a structured interaction is visible.
- Unknown or low-confidence prompts stay terminal-only. An unverified text match must never produce an approval button.
- For `sensitive: true`, mobile must not persist, log, notify, or preview the answer. Until end-to-end encryption exists, adapters should avoid exposing password or secret prompts as structured remote interactions.

### Session interrupt

Mobile request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_5",
  "method": "session.interrupt",
  "params": {
    "sessionId": "sess_1"
  },
  "sentAt": "2026-07-11T10:01:30Z"
}
```

Desktop maps this to Ctrl+C or platform-specific PTY interrupt behavior.

### Terminal resize

Mobile request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_6",
  "method": "terminal.resize",
  "params": {
    "sessionId": "sess_1",
    "cols": 100,
    "rows": 32
  },
  "sentAt": "2026-07-11T10:01:35Z"
}
```

For MVP, resize may be best-effort. Desktop returns success if the resize signal was sent to the PTY.

## Session state transitions

```text
starting -> running
running  -> waiting
waiting  -> running
running  -> stopped
waiting  -> stopped
starting -> error
running  -> error
waiting  -> error
```

`waiting` is optional in MVP because generic terminal output may not reliably expose when an agent is waiting. Desktop may keep generic sessions in `running` and only use `waiting` once provider-specific detection exists.

## Reconnect behavior

Mobile reconnect:

1. Mobile reconnects to relay.
2. Mobile sends `mobile.resume` with the stored `mobileSessionToken`.
3. Mobile sends `session.list`.
4. For open session detail screens, mobile sends `session.subscribe` with the last seen `seq`.
5. Desktop responds with replay, snapshot, or live mode and the current `activeInteraction`, if one still exists.

Desktop reconnect:

1. Desktop reconnects to relay.
2. Desktop sends `desktop.register`.
3. Desktop sends `session.updated` events for currently active sessions or responds to the next `session.list`.
4. Mobile sees stale sessions as offline until desktop returns.

Relay restart:

- Active WebSocket connections are lost.
- Pairing codes and `mobileSessionToken` values are lost in MVP.
- Desktop and mobile must reconnect and pair again.

## Message ordering

Relay preserves message order within a single WebSocket connection. It does not guarantee global ordering across reconnects.

Desktop assigns `seq` to terminal events. Mobile uses `seq` only for display recovery, not for command de-duplication.

Request `id` should be unique per client process. If a response is lost, mobile may retry idempotent requests such as `session.list` and `session.subscribe`. Mobile should not blindly retry `session.input` because duplicate input would be user-visible.

`interaction.respond` is also non-idempotent. A lost response is resolved by re-subscribing and checking `activeInteraction`, never by automatically resending the approval or choice.

The MVP relay preserves request IDs when forwarding. It allows only one in-flight request with a given `id` per desktop. A concurrent duplicate is rejected with `INVALID_MESSAGE`; this prevents a response from being routed to the wrong mobile connection without rewriting the desktop/mobile envelope.

## Relay runtime behavior

The implemented hackathon relay uses in-memory state:

- pairing codes are six digits, single-use and scoped to one desktop;
- creating a new pairing code invalidates the previous code for that desktop;
- mobile resume tokens expire after eight hours by default;
- forwarded desktop requests time out after 15 seconds by default;
- desktop disconnect rejects its pending mobile requests with `DESKTOP_OFFLINE`;
- relay restart invalidates pairing codes and mobile resume tokens.

The timeout and token lifetime are configurable through relay environment variables. Persistent device identity, desktop device-secret authentication, token revocation and multi-instance state are post-hackathon security work, not implemented MVP behavior.

## Frontend rendering contract

Mobile sessions list requires:

- `session.id`
- `session.agent`
- `session.title`
- `session.cwd`
- `session.status`
- `session.lastActivityAt`

Mobile session detail requires:

- current `Session`;
- live `terminal.output` events;
- current `activeInteraction` plus `interaction.requested`, `interaction.updated`, and `interaction.resolved` events;
- `session.ended` event;
- structured errors for input failure.

The product terminal view must preserve the information available in the CLI: ANSI/VT styling, carriage returns, cursor movement, alternate-screen redraws and terminal dimensions. The mobile implementation may initially ship a simpler renderer, but it must always keep the raw stream and expose terminal input controls; plain line-oriented text is not considered full CLI parity.

When an active interaction exists, mobile renders it above the composer as native controls:

- approval/confirmation: intent-colored Approve, Reject, Allow once, Allow for session, Cancel actions as provided by `options`;
- single/multi select: option list with descriptions and disabled state;
- text: composer with a clear submit command;
- terminal fallback: keyboard accessory with Escape, Tab, Ctrl, arrows and Enter, plus access to the full software keyboard.

Structured controls must not hide or replace the terminal transcript. The user can always inspect the exact CLI prompt and switch to raw terminal input.

## Compatibility rules

- Every side must check `version`.
- Minor MVP changes should add optional fields rather than renaming fields.
- Removing fields or changing event names requires a protocol version bump.
- Receivers should ignore unknown optional fields.
- Senders should not require clients to understand fields that are not in this document.
- Mobile renders only controls present in `negotiatedCapabilities`; unsupported structured interactions and key modes stay hidden while baseline text/raw terminal input remains available.
- Relay or desktop returns `UNSUPPORTED_CAPABILITY` when a valid method/mode was not negotiated. Unknown method names still use `UNSUPPORTED_METHOD`.
- Reconnect performs negotiation again. Mobile replaces, rather than unions, its previous capability set.

## Minimum demo contract

The hackathon demo is complete when these messages work end to end:

- `desktop.register`
- `desktop.pairing.create`
- `mobile.pair`
- `mobile.paired`
- `session.created`
- `session.list`
- `session.subscribe`
- `terminal.output`
- `session.input`
- `interaction.requested`
- `interaction.respond`
- `interaction.resolved`
- `session.interrupt`
- `session.ended`

The `session.input` demo must cover composer submit, named navigation/control keys and exact raw or base64 bytes. The structured interaction demo must cover at least one approval and one choice/text response while the terminal fallback remains usable.

Reconnect polish is covered by `mobile.resume`, but it is not required for the first end-to-end demo.
