# Cucoudle protocol contracts

## Purpose

This document defines the MVP contracts between:

- mobile frontend and relay backend;
- desktop daemon and relay backend;
- mobile frontend and desktop daemon through the relay.

The relay is a transport and pairing broker. The desktop daemon is the source of truth for CLI sessions. The mobile app is a client that renders desktop state and sends user actions.

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
    }
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
    "mobileSessionExpiresAt": "2026-07-11T18:00:01Z"
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
    "mobileSessionToken": "mst_dev_abc123"
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
    "resumed": true
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
    "appVersion": "0.1.0"
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
    "registered": true
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
    "mobileSessionExpiresAt": "2026-07-11T18:00:01Z"
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

## Desktop <-> Mobile logical contract

The mobile app does not talk directly to desktop in the remote MVP. The logical contract still belongs to desktop and mobile; relay only forwards it.

### Session input

Mobile request:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_4",
  "method": "session.input",
  "params": {
    "sessionId": "sess_1",
    "data": "continue with the minimal implementation\\n",
    "inputMode": "text"
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

`inputMode` values:

- `text`: app composer input; mobile should append `\n` when sending a submitted message;
- `raw`: terminal-mode input; mobile sends exact bytes represented as a string.

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
5. Desktop responds with replay, snapshot, or live mode.

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
- `session.ended` event;
- structured errors for input failure.

Mobile may display raw terminal output as plain monospaced text for MVP. ANSI rendering is a frontend enhancement, not a protocol requirement.

## Compatibility rules

- Every side must check `version`.
- Minor MVP changes should add optional fields rather than renaming fields.
- Removing fields or changing event names requires a protocol version bump.
- Receivers should ignore unknown optional fields.
- Senders should not require clients to understand fields that are not in this document.

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
- `session.interrupt`
- `session.ended`

Reconnect polish is covered by `mobile.resume`, but it is not required for the first end-to-end demo.
