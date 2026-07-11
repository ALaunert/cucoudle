# Relay & Protocol Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Developer 3's slice of Cucoudle — the shared `@cucoudle/protocol` schema package and the `@cucoudle/relay` WebSocket broker that pairs a desktop daemon with mobile clients and forwards session traffic between them.

**Architecture:** A thin in-memory relay. The desktop daemon is the source of truth for CLI sessions; the relay only handles pairing, presence, and message forwarding. Mobile connects to `/v1/ws/mobile`, desktop to `/v1/ws/desktop`. The relay validates pairing, issues a mobile session token, correlates request/response by `id`, and broadcasts desktop events to linked mobile clients. All wire messages use the versioned envelope defined in `docs/protocol-contracts.md`. Both packages are consumed as TypeScript source (no build step for the hackathon).

**Tech Stack:** Node.js 20+, TypeScript (ESM), npm workspaces, Fastify + `@fastify/websocket`, `ws` (test client), zod v3, vitest, tsx.

## Global Constraints

- Protocol version string is exactly `"2026-07-11"` (`ProtocolVersion`). Every side must check `version`; mismatch → `UNSUPPORTED_PROTOCOL`.
- Envelope field names are exact: request `{version,kind:"request",id,method,params?,sentAt}`; response `{version,kind:"response",id,ok,result?,error?,sentAt}`; event `{version,kind:"event",event,data,sentAt}`.
- `id` required on requests and responses; a response MUST reuse the request `id`; events have no `id`.
- `sentAt` is ISO 8601 UTC (`new Date().toISOString()`).
- Error codes are exactly: `INVALID_MESSAGE`, `UNSUPPORTED_PROTOCOL`, `UNSUPPORTED_METHOD`, `UNAUTHORIZED`, `PAIRING_EXPIRED`, `PAIRING_NOT_FOUND`, `DESKTOP_OFFLINE`, `MOBILE_NOT_PAIRED`, `SESSION_NOT_FOUND`, `SESSION_STOPPED`, `TOOL_NOT_FOUND`, `DAEMON_UNAVAILABLE`, `PTY_WRITE_FAILED`, `INTERNAL_ERROR`.
- Unknown methods → `UNSUPPORTED_METHOD` response; unknown events → ignored. Never crash the receiver.
- WebSocket routes exact: `/v1/ws/desktop`, `/v1/ws/mobile`. Health: `GET /healthz` → 200 alive, `GET /readyz` → 200 when WS routes ready.
- Relay state is in-memory for MVP; relay restart loses pairings/tokens. Relay MUST NOT persist terminal transcripts.
- Relay preserves message order within a single connection. Terminal `seq` is assigned by desktop, never by relay.
- Node.js 20+, TypeScript ESM, zod for schemas. Package names `@cucoudle/protocol`, `@cucoudle/relay`.

---

### Task 1: Monorepo scaffold and tooling

**Files:**
- Create: `package.json` (root)
- Create: `tsconfig.base.json`
- Create: `vitest.config.ts`
- Create: `.gitignore` (modify existing)
- Create: `apps/.gitkeep`, `packages/.gitkeep`

**Interfaces:**
- Consumes: nothing.
- Produces: npm workspaces rooted at `apps/*` and `packages/*`; a base tsconfig extended by every package; a root `npm test` that runs vitest across workspaces.

- [ ] **Step 1: Create the root workspace manifest**

`package.json`:

```json
{
  "name": "cucoudle",
  "private": true,
  "type": "module",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "relay": "npm run start -w @cucoudle/relay",
    "typecheck": "tsc -p tsconfig.base.json --noEmit"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "@types/node": "^20.16.0"
  }
}
```

- [ ] **Step 2: Create the base TypeScript config**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["node"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "noEmit": true
  }
}
```

- [ ] **Step 3: Create the vitest config**

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["apps/**/*.test.ts", "packages/**/*.test.ts"],
    environment: "node",
  },
});
```

- [ ] **Step 4: Extend .gitignore for Node**

Append to `.gitignore`:

```gitignore
node_modules/
dist/
*.log
.DS_Store
```

- [ ] **Step 5: Add placeholder dirs so the tree exists**

```bash
mkdir -p apps packages
touch apps/.gitkeep packages/.gitkeep
```

- [ ] **Step 6: Install and verify the workspace resolves**

Run: `npm install`
Expected: completes without error, creates root `node_modules` and `package-lock.json`.

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (no tests yet) — this confirms the runner works.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts .gitignore apps/.gitkeep packages/.gitkeep package-lock.json
git commit -m "chore: scaffold npm workspaces monorepo for relay and protocol"
```

---

### Task 2: Protocol envelope, domain models, and helpers

**Files:**
- Create: `packages/protocol/package.json`
- Create: `packages/protocol/tsconfig.json`
- Create: `packages/protocol/src/envelope.ts`
- Create: `packages/protocol/src/sessions.ts`
- Create: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/envelope.test.ts`

**Interfaces:**
- Consumes: base tsconfig from Task 1.
- Produces:
  - `PROTOCOL_VERSION: "2026-07-11"`
  - Types `WireMessage`, `RequestMessage`, `ResponseMessage`, `EventMessage`, `ProtocolError`, `ErrorCode`.
  - Zod schemas `RequestMessageSchema`, `ResponseMessageSchema`, `EventMessageSchema`, `WireMessageSchema`.
  - Types/schemas `Session`, `SessionStatus`, `AgentKind`, `MobileDevice`, `MobilePlatform`, `TerminalOutput`.
  - Helpers: `parseWireMessage(raw: string): { ok: true; msg: WireMessage } | { ok: false; code: ErrorCode; message: string }`; `makeResponse(id, result)`, `makeError(id, code, message, details?)`, `makeEvent(event, data)`; guards `isRequest`, `isResponse`, `isEvent`.

- [ ] **Step 1: Create the protocol package manifest**

`packages/protocol/package.json`:

```json
{
  "name": "@cucoudle/protocol",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "zod": "^3.23.8"
  }
}
```

- [ ] **Step 2: Create the package tsconfig**

`packages/protocol/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src"]
}
```

- [ ] **Step 3: Write the failing envelope test**

`packages/protocol/src/envelope.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  PROTOCOL_VERSION,
  parseWireMessage,
  makeResponse,
  makeError,
  makeEvent,
  isRequest,
  isEvent,
} from "./index.js";

describe("parseWireMessage", () => {
  it("accepts a valid request envelope", () => {
    const raw = JSON.stringify({
      version: PROTOCOL_VERSION,
      kind: "request",
      id: "req_1",
      method: "session.list",
      params: {},
      sentAt: "2026-07-11T10:00:00Z",
    });
    const res = parseWireMessage(raw);
    expect(res.ok).toBe(true);
    if (res.ok) expect(isRequest(res.msg)).toBe(true);
  });

  it("rejects non-JSON with INVALID_MESSAGE", () => {
    const res = parseWireMessage("not json{");
    expect(res).toEqual({ ok: false, code: "INVALID_MESSAGE", message: expect.any(String) });
  });

  it("rejects a wrong protocol version with UNSUPPORTED_PROTOCOL", () => {
    const raw = JSON.stringify({
      version: "1999-01-01",
      kind: "request",
      id: "req_1",
      method: "session.list",
      sentAt: "2026-07-11T10:00:00Z",
    });
    const res = parseWireMessage(raw);
    expect(res).toMatchObject({ ok: false, code: "UNSUPPORTED_PROTOCOL" });
  });

  it("rejects a structurally invalid envelope with INVALID_MESSAGE", () => {
    const raw = JSON.stringify({ version: PROTOCOL_VERSION, kind: "request" });
    const res = parseWireMessage(raw);
    expect(res).toMatchObject({ ok: false, code: "INVALID_MESSAGE" });
  });
});

describe("builders", () => {
  it("makeResponse reuses id and sets ok true", () => {
    const r = makeResponse("req_9", { sessions: [] });
    expect(r).toMatchObject({ kind: "response", id: "req_9", ok: true, result: { sessions: [] } });
    expect(r.version).toBe(PROTOCOL_VERSION);
  });

  it("makeError sets ok false and carries the code", () => {
    const r = makeError("req_9", "DESKTOP_OFFLINE", "desktop is offline");
    expect(r).toMatchObject({ kind: "response", id: "req_9", ok: false, error: { code: "DESKTOP_OFFLINE" } });
  });

  it("makeEvent has no id and is an event", () => {
    const e = makeEvent("terminal.output", { sessionId: "s1", seq: 1, data: "hi" });
    expect(isEvent(e)).toBe(true);
    expect(e).not.toHaveProperty("id");
  });
});
```

- [ ] **Step 4: Run the test to verify it fails**

Run: `npx vitest run packages/protocol/src/envelope.test.ts`
Expected: FAIL — cannot resolve `./index.js` / exports not defined.

- [ ] **Step 5: Write the session domain models**

`packages/protocol/src/sessions.ts`:

```ts
import { z } from "zod";

export const MobilePlatformSchema = z.enum(["ios", "android", "unknown"]);
export type MobilePlatform = z.infer<typeof MobilePlatformSchema>;

export const MobileDeviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  platform: MobilePlatformSchema,
});
export type MobileDevice = z.infer<typeof MobileDeviceSchema>;

export const SessionStatusSchema = z.enum([
  "starting",
  "running",
  "waiting",
  "stopped",
  "error",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const AgentKindSchema = z.enum([
  "claude",
  "codex",
  "cursor",
  "shell",
  "unknown",
]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  agent: AgentKindSchema,
  title: z.string(),
  command: z.string(),
  argv: z.array(z.string()),
  cwd: z.string(),
  status: SessionStatusSchema,
  createdAt: z.string(),
  lastActivityAt: z.string(),
  exitCode: z.number().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

export const TerminalOutputSchema = z.object({
  sessionId: z.string(),
  seq: z.number(),
  data: z.string(),
});
export type TerminalOutput = z.infer<typeof TerminalOutputSchema>;
```

- [ ] **Step 6: Write the envelope schemas and helpers**

`packages/protocol/src/envelope.ts`:

```ts
import { z } from "zod";

export const PROTOCOL_VERSION = "2026-07-11" as const;
export type ProtocolVersion = typeof PROTOCOL_VERSION;

export const ERROR_CODES = [
  "INVALID_MESSAGE",
  "UNSUPPORTED_PROTOCOL",
  "UNSUPPORTED_METHOD",
  "UNAUTHORIZED",
  "PAIRING_EXPIRED",
  "PAIRING_NOT_FOUND",
  "DESKTOP_OFFLINE",
  "MOBILE_NOT_PAIRED",
  "SESSION_NOT_FOUND",
  "SESSION_STOPPED",
  "TOOL_NOT_FOUND",
  "DAEMON_UNAVAILABLE",
  "PTY_WRITE_FAILED",
  "INTERNAL_ERROR",
] as const;
export const ErrorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const ProtocolErrorSchema = z.object({
  code: ErrorCodeSchema,
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});
export type ProtocolError = z.infer<typeof ProtocolErrorSchema>;

const VersionSchema = z.literal(PROTOCOL_VERSION);

export const RequestMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("request"),
  id: z.string(),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
  sentAt: z.string(),
});
export type RequestMessage = z.infer<typeof RequestMessageSchema>;

export const ResponseMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("response"),
  id: z.string(),
  ok: z.boolean(),
  result: z.record(z.unknown()).optional(),
  error: ProtocolErrorSchema.optional(),
  sentAt: z.string(),
});
export type ResponseMessage = z.infer<typeof ResponseMessageSchema>;

export const EventMessageSchema = z.object({
  version: VersionSchema,
  kind: z.literal("event"),
  event: z.string(),
  data: z.record(z.unknown()),
  sentAt: z.string(),
});
export type EventMessage = z.infer<typeof EventMessageSchema>;

export const WireMessageSchema = z.discriminatedUnion("kind", [
  RequestMessageSchema,
  ResponseMessageSchema,
  EventMessageSchema,
]);
export type WireMessage = z.infer<typeof WireMessageSchema>;

export function isRequest(m: WireMessage): m is RequestMessage {
  return m.kind === "request";
}
export function isResponse(m: WireMessage): m is ResponseMessage {
  return m.kind === "response";
}
export function isEvent(m: WireMessage): m is EventMessage {
  return m.kind === "event";
}

type ParseResult =
  | { ok: true; msg: WireMessage }
  | { ok: false; code: ErrorCode; message: string };

export function parseWireMessage(raw: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, code: "INVALID_MESSAGE", message: "payload is not valid JSON" };
  }
  if (
    typeof json === "object" &&
    json !== null &&
    "version" in json &&
    (json as { version: unknown }).version !== PROTOCOL_VERSION
  ) {
    return {
      ok: false,
      code: "UNSUPPORTED_PROTOCOL",
      message: `expected protocol ${PROTOCOL_VERSION}`,
    };
  }
  const parsed = WireMessageSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, code: "INVALID_MESSAGE", message: parsed.error.message };
  }
  return { ok: true, msg: parsed.data };
}

export function makeResponse(id: string, result: Record<string, unknown>): ResponseMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "response",
    id,
    ok: true,
    result,
    sentAt: new Date().toISOString(),
  };
}

export function makeError(
  id: string,
  code: ErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ResponseMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "response",
    id,
    ok: false,
    error: details ? { code, message, details } : { code, message },
    sentAt: new Date().toISOString(),
  };
}

export function makeEvent(event: string, data: Record<string, unknown>): EventMessage {
  return {
    version: PROTOCOL_VERSION,
    kind: "event",
    event,
    data,
    sentAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 7: Write the barrel export**

`packages/protocol/src/index.ts`:

```ts
export * from "./envelope.js";
export * from "./sessions.js";
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run packages/protocol/src/envelope.test.ts`
Expected: PASS — all cases green.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol package-lock.json
git commit -m "feat(protocol): add envelope, domain models, and parse/build helpers"
```

---

### Task 3: Protocol method and event schemas with JSON examples

**Files:**
- Create: `packages/protocol/src/methods.ts`
- Create: `packages/protocol/src/events.ts`
- Modify: `packages/protocol/src/index.ts`
- Test: `packages/protocol/src/methods.test.ts`
- Create: `packages/protocol/examples/mobile.pair.request.json`
- Create: `packages/protocol/examples/session.subscribe.response.json`
- Create: `packages/protocol/examples/terminal.output.event.json`

**Interfaces:**
- Consumes: `Session`, `MobileDevice`, `TerminalOutput` schemas from Task 2; envelope helpers.
- Produces:
  - `MOBILE_METHODS`, `DESKTOP_METHODS` name constants and `MethodName` type.
  - `DESKTOP_EVENTS` name constants and `DesktopEventName` type.
  - Per-method params/result zod schemas keyed for validation: `MobilePairParamsSchema`, `MobilePairResultSchema`, `MobileResumeParamsSchema`, `SessionSubscribeParamsSchema`, `SessionSubscribeResultSchema`, `SessionInputParamsSchema`, `SessionInterruptParamsSchema`, `TerminalResizeParamsSchema`, `SessionListResultSchema`, `DesktopRegisterParamsSchema`, `DesktopPairingCreateParamsSchema`, `DesktopPairingCreateResultSchema`.
  - Event data schemas: `SessionCreatedDataSchema`, `SessionUpdatedDataSchema`, `SessionRemovedDataSchema`, `SessionEndedDataSchema`, `MobilePairedDataSchema`, `MobileDisconnectedDataSchema`, `TerminalOutputSchema` (re-export).
  - `MOBILE_FORWARDED_METHODS: readonly string[]` — the methods the relay forwards to desktop unchanged (`session.list`, `session.subscribe`, `session.input`, `session.interrupt`, `terminal.resize`).

- [ ] **Step 1: Write the failing method-schema test**

`packages/protocol/src/methods.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  MobilePairParamsSchema,
  SessionSubscribeResultSchema,
  DesktopPairingCreateResultSchema,
  MOBILE_FORWARDED_METHODS,
  DESKTOP_EVENTS,
} from "./index.js";

describe("method schemas", () => {
  it("accepts a valid mobile.pair params object", () => {
    const parsed = MobilePairParamsSchema.safeParse({
      desktopId: "desk_123",
      pairingCode: "123456",
      mobileDevice: { id: "mob_abc", name: "Sasha iPhone", platform: "ios" },
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects mobile.pair params missing pairingCode", () => {
    const parsed = MobilePairParamsSchema.safeParse({
      desktopId: "desk_123",
      mobileDevice: { id: "m", name: "n", platform: "ios" },
    });
    expect(parsed.success).toBe(false);
  });

  it("accepts a session.subscribe replay result", () => {
    const parsed = SessionSubscribeResultSchema.safeParse({
      session: {
        id: "sess_1",
        agent: "claude",
        title: "Claude",
        command: "claude",
        argv: [],
        cwd: "/tmp",
        status: "running",
        createdAt: "2026-07-11T09:58:00Z",
        lastActivityAt: "2026-07-11T10:00:09Z",
      },
      mode: "replay",
      events: [],
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a desktop.pairing.create result with qrPayload", () => {
    const parsed = DesktopPairingCreateResultSchema.safeParse({
      desktopId: "desk_123",
      pairingCode: "123456",
      expiresAt: "2026-07-11T10:04:05Z",
      qrPayload: {
        relayUrl: "wss://relay.example.test/v1/ws/mobile",
        desktopId: "desk_123",
        pairingCode: "123456",
        expiresAt: "2026-07-11T10:04:05Z",
      },
    });
    expect(parsed.success).toBe(true);
  });
});

describe("routing constants", () => {
  it("forwards the expected mobile methods", () => {
    expect(MOBILE_FORWARDED_METHODS).toContain("session.list");
    expect(MOBILE_FORWARDED_METHODS).toContain("session.input");
    expect(MOBILE_FORWARDED_METHODS).not.toContain("mobile.pair");
  });

  it("lists the desktop events relay forwards to mobile", () => {
    expect(DESKTOP_EVENTS).toContain("terminal.output");
    expect(DESKTOP_EVENTS).toContain("session.ended");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/protocol/src/methods.test.ts`
Expected: FAIL — exports not defined.

- [ ] **Step 3: Write the method schemas**

`packages/protocol/src/methods.ts`:

```ts
import { z } from "zod";
import { MobileDeviceSchema, SessionSchema } from "./sessions.js";
import { EventMessageSchema } from "./envelope.js";

export const MOBILE_METHODS = [
  "mobile.pair",
  "mobile.resume",
  "session.list",
  "session.subscribe",
  "session.input",
  "session.interrupt",
  "terminal.resize",
] as const;

export const DESKTOP_METHODS = [
  "desktop.register",
  "desktop.pairing.create",
] as const;

export type MethodName = (typeof MOBILE_METHODS)[number] | (typeof DESKTOP_METHODS)[number];

export const MOBILE_FORWARDED_METHODS = [
  "session.list",
  "session.subscribe",
  "session.input",
  "session.interrupt",
  "terminal.resize",
] as const;

export const QrPayloadSchema = z.object({
  relayUrl: z.string(),
  desktopId: z.string(),
  pairingCode: z.string(),
  expiresAt: z.string(),
});
export type QrPayload = z.infer<typeof QrPayloadSchema>;

export const MobilePairParamsSchema = z.object({
  desktopId: z.string(),
  pairingCode: z.string(),
  mobileDevice: MobileDeviceSchema,
});
export const MobilePairResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  paired: z.literal(true),
  mobileSessionToken: z.string(),
  mobileSessionExpiresAt: z.string(),
});

export const MobileResumeParamsSchema = z.object({
  desktopId: z.string(),
  mobileDeviceId: z.string(),
  mobileSessionToken: z.string(),
});
export const MobileResumeResultSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  resumed: z.literal(true),
});

export const SessionListResultSchema = z.object({
  sessions: z.array(SessionSchema),
});

export const SessionSubscribeParamsSchema = z.object({
  sessionId: z.string(),
  afterSeq: z.number().optional(),
});
export const SessionSubscribeResultSchema = z.object({
  session: SessionSchema,
  mode: z.enum(["replay", "snapshot", "live"]),
  events: z.array(EventMessageSchema).optional(),
  terminalBuffer: z.string().optional(),
  lastSeq: z.number().optional(),
});

export const SessionInputParamsSchema = z.object({
  sessionId: z.string(),
  data: z.string(),
  inputMode: z.enum(["text", "raw"]),
});

export const SessionInterruptParamsSchema = z.object({
  sessionId: z.string(),
});

export const TerminalResizeParamsSchema = z.object({
  sessionId: z.string(),
  cols: z.number(),
  rows: z.number(),
});

export const DesktopRegisterParamsSchema = z.object({
  desktopId: z.string(),
  desktopName: z.string(),
  platform: z.string(),
  appVersion: z.string(),
});

export const DesktopPairingCreateParamsSchema = z.object({
  ttlSeconds: z.number(),
});
export const DesktopPairingCreateResultSchema = z.object({
  desktopId: z.string(),
  pairingCode: z.string(),
  expiresAt: z.string(),
  qrPayload: QrPayloadSchema,
});
```

- [ ] **Step 4: Write the event schemas**

`packages/protocol/src/events.ts`:

```ts
import { z } from "zod";
import { SessionSchema, MobileDeviceSchema, TerminalOutputSchema } from "./sessions.js";

export const DESKTOP_EVENTS = [
  "session.created",
  "session.updated",
  "session.removed",
  "terminal.output",
  "session.ended",
] as const;
export type DesktopEventName = (typeof DESKTOP_EVENTS)[number];

export const RELAY_EVENTS = ["mobile.paired", "mobile.disconnected"] as const;
export type RelayEventName = (typeof RELAY_EVENTS)[number];

export const SessionCreatedDataSchema = z.object({ session: SessionSchema });
export const SessionUpdatedDataSchema = z.object({ session: SessionSchema });
export const SessionRemovedDataSchema = z.object({ sessionId: z.string() });
export const SessionEndedDataSchema = z.object({
  sessionId: z.string(),
  exitCode: z.number().optional(),
});

export const MobilePairedDataSchema = z.object({
  mobileDevice: MobileDeviceSchema,
  mobileSessionExpiresAt: z.string(),
});
export const MobileDisconnectedDataSchema = z.object({
  mobileDeviceId: z.string(),
});

export { TerminalOutputSchema };
```

- [ ] **Step 5: Extend the barrel export**

Replace `packages/protocol/src/index.ts` with:

```ts
export * from "./envelope.js";
export * from "./sessions.js";
export * from "./methods.js";
export * from "./events.js";
```

- [ ] **Step 6: Write the JSON examples**

`packages/protocol/examples/mobile.pair.request.json`:

```json
{
  "version": "2026-07-11",
  "kind": "request",
  "id": "req_1",
  "method": "mobile.pair",
  "params": {
    "desktopId": "desk_123",
    "pairingCode": "123456",
    "mobileDevice": { "id": "mob_abc", "name": "Sasha iPhone", "platform": "ios" }
  },
  "sentAt": "2026-07-11T10:00:00Z"
}
```

`packages/protocol/examples/session.subscribe.response.json`:

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

`packages/protocol/examples/terminal.output.event.json`:

```json
{
  "version": "2026-07-11",
  "kind": "event",
  "event": "terminal.output",
  "data": { "sessionId": "sess_1", "seq": 121, "data": "Running tests...\r\n" },
  "sentAt": "2026-07-11T10:00:12Z"
}
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `npx vitest run packages/protocol/src/methods.test.ts`
Expected: PASS.

- [ ] **Step 8: Verify the whole protocol package is green**

Run: `npx vitest run packages/protocol`
Expected: PASS — both test files.

- [ ] **Step 9: Commit**

```bash
git add packages/protocol
git commit -m "feat(protocol): add method/event schemas, routing constants, and JSON examples"
```

---

### Task 4: Relay server skeleton, health, and envelope handling

**Files:**
- Create: `apps/relay/package.json`
- Create: `apps/relay/tsconfig.json`
- Create: `apps/relay/src/server.ts`
- Create: `apps/relay/src/app.ts`
- Test: `apps/relay/src/app.test.ts`

**Interfaces:**
- Consumes: `@cucoudle/protocol` (`parseWireMessage`, `makeError`, `isRequest`).
- Produces:
  - `buildApp(): FastifyInstance` — registers `@fastify/websocket`, `GET /healthz`, `GET /readyz`, and WS routes `/v1/ws/desktop`, `/v1/ws/mobile`. Malformed frames get an `INVALID_MESSAGE`/`UNSUPPORTED_PROTOCOL` response; unknown request methods get `UNSUPPORTED_METHOD`; unknown events are ignored. Routes are wired to no-op connection handlers replaced in later tasks.
  - `startServer(port: number): Promise<FastifyInstance>` used by `server.ts`.

- [ ] **Step 1: Create the relay package manifest**

`apps/relay/package.json`:

```json
{
  "name": "@cucoudle/relay",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "tsx src/server.ts",
    "dev": "tsx watch src/server.ts"
  },
  "dependencies": {
    "@cucoudle/protocol": "*",
    "@fastify/websocket": "^11.0.0",
    "fastify": "^5.0.0"
  },
  "devDependencies": {
    "ws": "^8.18.0",
    "@types/ws": "^8.5.12"
  }
}
```

- [ ] **Step 2: Create the relay tsconfig**

`apps/relay/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "verbatimModuleSyntax": false
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install the new dependencies**

Run: `npm install`
Expected: installs fastify, @fastify/websocket, ws; links `@cucoudle/protocol` into `apps/relay/node_modules`.

- [ ] **Step 4: Write the failing app test**

`apps/relay/src/app.test.ts`:

```ts
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
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npx vitest run apps/relay/src/app.test.ts`
Expected: FAIL — `./app.js` has no `buildApp`.

- [ ] **Step 6: Write the app**

`apps/relay/src/app.ts`:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import type { WebSocket } from "@fastify/websocket";
import {
  parseWireMessage,
  makeError,
  isRequest,
  MOBILE_METHODS,
  DESKTOP_METHODS,
} from "@cucoudle/protocol";

function send(socket: WebSocket, msg: unknown): void {
  socket.send(JSON.stringify(msg));
}

const KNOWN_MOBILE = new Set<string>(MOBILE_METHODS);
const KNOWN_DESKTOP = new Set<string>(DESKTOP_METHODS);

function handleFrame(socket: WebSocket, raw: string, known: Set<string>): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    send(socket, makeError("", parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;
  if (isRequest(msg)) {
    if (!known.has(msg.method)) {
      send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
      return;
    }
    // Real handlers are wired in later tasks; skeleton acknowledges known methods
    // by doing nothing here so tests for unknown methods stay deterministic.
  }
  // Events are ignored by the skeleton.
}

export function buildApp(): FastifyInstance {
  const app = Fastify({ logger: false });
  app.register(websocket);

  app.get("/healthz", async () => ({ status: "ok" }));

  app.register(async (instance) => {
    instance.get("/readyz", async () => ({ status: "ready" }));

    instance.get("/v1/ws/mobile", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleFrame(socket, data.toString(), KNOWN_MOBILE));
    });

    instance.get("/v1/ws/desktop", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleFrame(socket, data.toString(), KNOWN_DESKTOP));
    });
  });

  return app;
}

export async function startServer(port: number): Promise<FastifyInstance> {
  const app = buildApp();
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}
```

- [ ] **Step 7: Write the server entrypoint**

`apps/relay/src/server.ts`:

```ts
import { startServer } from "./app.js";

const port = Number(process.env.PORT ?? 8787);

startServer(port)
  .then((app) => {
    app.log.info(`relay listening on ${port}`);
    console.log(`cucoudle relay listening on ws://localhost:${port}`);
  })
  .catch((err) => {
    console.error("relay failed to start", err);
    process.exit(1);
  });
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npx vitest run apps/relay/src/app.test.ts`
Expected: PASS — health + envelope handling green.

- [ ] **Step 9: Commit**

```bash
git add apps/relay package-lock.json
git commit -m "feat(relay): add Fastify + websocket skeleton with health and envelope handling"
```

---

### Task 5: Relay state and pairing

**Files:**
- Create: `apps/relay/src/state.ts`
- Create: `apps/relay/src/pairing.ts`
- Test: `apps/relay/src/pairing.test.ts`

**Interfaces:**
- Consumes: protocol schemas/types.
- Produces:
  - `RelayState` class holding: `desktops: Map<desktopId, DesktopConn>`, `pairings: Map<pairingCode, Pairing>`, `mobileSessions: Map<token, MobileSession>`, `links: Map<desktopId, Set<MobileConn>>`, `pending: Map<requestId, MobileConn>`. `DesktopConn = { desktopId, name, platform, appVersion, socket }`. `MobileConn = { mobileDeviceId, desktopId, token, socket }`.
  - Methods: `registerDesktop(params, socket)`, `getDesktop(id)`, `removeDesktopBySocket(socket)`, `createPairing(desktopId, ttlSeconds, relayMobileUrl)` → `{pairingCode, expiresAt, qrPayload}`, `consumePairing(desktopId, code, now)` → `{ ok: true } | { ok: false; code: ErrorCode }`, `issueMobileSession(desktopId, mobileDeviceId, ttlMs, now)` → `{token, expiresAt}`, `linkMobile(conn)`, `unlinkMobileBySocket(socket)` → `{ mobileDeviceId; desktopId } | null`, `resumeMobile(desktopId, mobileDeviceId, token, now)` → ok/err.
  - `generatePairingCode(): string` (6 digits), `newId(prefix): string`.

- [ ] **Step 1: Write the failing pairing test**

`apps/relay/src/pairing.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RelayState, generatePairingCode } from "./state.js";

const RELAY_URL = "ws://localhost:8787/v1/ws/mobile";
const fakeSocket = () => ({ send: () => {}, close: () => {} }) as unknown as import("@fastify/websocket").WebSocket;

describe("generatePairingCode", () => {
  it("produces a 6-digit string", () => {
    for (let i = 0; i < 50; i++) {
      expect(generatePairingCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe("RelayState pairing", () => {
  it("consumes a valid, unexpired pairing code once", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const p = s.createPairing("desk_1", 300, RELAY_URL, now);
    const first = s.consumePairing("desk_1", p.pairingCode, now + 1000);
    expect(first).toEqual({ ok: true });
    const second = s.consumePairing("desk_1", p.pairingCode, now + 2000);
    expect(second).toMatchObject({ ok: false, code: "PAIRING_NOT_FOUND" });
  });

  it("rejects an expired pairing code with PAIRING_EXPIRED", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const p = s.createPairing("desk_1", 300, RELAY_URL, now);
    const res = s.consumePairing("desk_1", p.pairingCode, now + 301_000);
    expect(res).toMatchObject({ ok: false, code: "PAIRING_EXPIRED" });
  });

  it("rejects an unknown code with PAIRING_NOT_FOUND", () => {
    const s = new RelayState();
    const res = s.consumePairing("desk_1", "000000", Date.now());
    expect(res).toMatchObject({ ok: false, code: "PAIRING_NOT_FOUND" });
  });

  it("resumes with a valid token and rejects a bad token", () => {
    const s = new RelayState();
    s.registerDesktop({ desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }, fakeSocket());
    const now = Date.parse("2026-07-11T10:00:00Z");
    const issued = s.issueMobileSession("desk_1", "mob_a", 3_600_000, now);
    expect(s.resumeMobile("desk_1", "mob_a", issued.token, now + 1000)).toEqual({ ok: true });
    expect(s.resumeMobile("desk_1", "mob_a", "wrong", now + 1000)).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/relay/src/pairing.test.ts`
Expected: FAIL — `./state.js` missing.

- [ ] **Step 3: Write the relay state**

`apps/relay/src/state.ts`:

```ts
import { randomInt, randomUUID } from "node:crypto";
import type { WebSocket } from "@fastify/websocket";
import type { ErrorCode, MobileDevice, QrPayload } from "@cucoudle/protocol";

export type DesktopConn = {
  desktopId: string;
  name: string;
  platform: string;
  appVersion: string;
  socket: WebSocket;
};

export type MobileConn = {
  mobileDeviceId: string;
  mobileDevice: MobileDevice;
  desktopId: string;
  token: string;
  socket: WebSocket;
};

type Pairing = { desktopId: string; expiresAt: number };
type MobileSession = { desktopId: string; mobileDeviceId: string; expiresAt: number };

export function generatePairingCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

type Ok = { ok: true };
type Err = { ok: false; code: ErrorCode };

export class RelayState {
  readonly desktops = new Map<string, DesktopConn>();
  private readonly pairings = new Map<string, Pairing>();
  private readonly mobileSessions = new Map<string, MobileSession>();
  readonly links = new Map<string, Set<MobileConn>>();
  readonly pending = new Map<string, MobileConn>();

  registerDesktop(
    params: { desktopId: string; desktopName: string; platform: string; appVersion: string },
    socket: WebSocket,
  ): void {
    this.desktops.set(params.desktopId, {
      desktopId: params.desktopId,
      name: params.desktopName,
      platform: params.platform,
      appVersion: params.appVersion,
      socket,
    });
  }

  getDesktop(desktopId: string): DesktopConn | undefined {
    return this.desktops.get(desktopId);
  }

  removeDesktopBySocket(socket: WebSocket): string | null {
    for (const [id, conn] of this.desktops) {
      if (conn.socket === socket) {
        this.desktops.delete(id);
        return id;
      }
    }
    return null;
  }

  createPairing(
    desktopId: string,
    ttlSeconds: number,
    relayMobileUrl: string,
    now: number,
  ): { pairingCode: string; expiresAt: string; qrPayload: QrPayload } {
    const pairingCode = generatePairingCode();
    const expiresAtMs = now + ttlSeconds * 1000;
    this.pairings.set(pairingCode, { desktopId, expiresAt: expiresAtMs });
    const expiresAt = new Date(expiresAtMs).toISOString();
    return {
      pairingCode,
      expiresAt,
      qrPayload: { relayUrl: relayMobileUrl, desktopId, pairingCode, expiresAt },
    };
  }

  consumePairing(desktopId: string, code: string, now: number): Ok | Err {
    const pairing = this.pairings.get(code);
    if (!pairing || pairing.desktopId !== desktopId) {
      return { ok: false, code: "PAIRING_NOT_FOUND" };
    }
    if (now > pairing.expiresAt) {
      this.pairings.delete(code);
      return { ok: false, code: "PAIRING_EXPIRED" };
    }
    this.pairings.delete(code);
    return { ok: true };
  }

  issueMobileSession(
    desktopId: string,
    mobileDeviceId: string,
    ttlMs: number,
    now: number,
  ): { token: string; expiresAt: string } {
    const token = `mst_${randomUUID().replace(/-/g, "")}`;
    const expiresAtMs = now + ttlMs;
    this.mobileSessions.set(token, { desktopId, mobileDeviceId, expiresAt: expiresAtMs });
    return { token, expiresAt: new Date(expiresAtMs).toISOString() };
  }

  resumeMobile(desktopId: string, mobileDeviceId: string, token: string, now: number): Ok | Err {
    const session = this.mobileSessions.get(token);
    if (!session || session.desktopId !== desktopId || session.mobileDeviceId !== mobileDeviceId) {
      return { ok: false, code: "UNAUTHORIZED" };
    }
    if (now > session.expiresAt) {
      this.mobileSessions.delete(token);
      return { ok: false, code: "PAIRING_EXPIRED" };
    }
    return { ok: true };
  }

  linkMobile(conn: MobileConn): void {
    let set = this.links.get(conn.desktopId);
    if (!set) {
      set = new Set();
      this.links.set(conn.desktopId, set);
    }
    set.add(conn);
  }

  unlinkMobileBySocket(socket: WebSocket): { mobileDeviceId: string; desktopId: string } | null {
    for (const [desktopId, set] of this.links) {
      for (const conn of set) {
        if (conn.socket === socket) {
          set.delete(conn);
          if (set.size === 0) this.links.delete(desktopId);
          for (const [id, mob] of this.pending) {
            if (mob.socket === socket) this.pending.delete(id);
          }
          return { mobileDeviceId: conn.mobileDeviceId, desktopId };
        }
      }
    }
    return null;
  }

  mobilesForDesktop(desktopId: string): MobileConn[] {
    return [...(this.links.get(desktopId) ?? [])];
  }
}
```

- [ ] **Step 4: Add a re-export so handlers import from one place**

Create `apps/relay/src/pairing.ts`:

```ts
// Pairing helpers currently live in state.ts; this module re-exports the
// pairing-facing surface so handlers have a stable import path if the
// implementation is split later.
export { generatePairingCode, newId } from "./state.js";
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx vitest run apps/relay/src/pairing.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/relay/src/state.ts apps/relay/src/pairing.ts apps/relay/src/pairing.test.ts
git commit -m "feat(relay): add in-memory state, pairing codes, and mobile session tokens"
```

---

### Task 6: Relay handlers — register, pair, forward, and events

**Files:**
- Create: `apps/relay/src/handlers.ts`
- Modify: `apps/relay/src/app.ts`
- Test: `apps/relay/src/handlers.test.ts`

**Interfaces:**
- Consumes: `RelayState`, protocol builders/schemas, `MOBILE_FORWARDED_METHODS`.
- Produces:
  - `handleDesktopMessage(state, socket, raw, relayMobileUrl)` — processes `desktop.register`, `desktop.pairing.create`, and desktop responses/events (routes responses to `pending` mobile, broadcasts events to linked mobiles).
  - `handleMobileMessage(state, socket, raw)` — processes `mobile.pair`, `mobile.resume`, forwards `MOBILE_FORWARDED_METHODS` to the linked desktop (recording `pending[id] = mobileConn`), rejects with `DESKTOP_OFFLINE`/`MOBILE_NOT_PAIRED` as appropriate.
  - `onDesktopClose(state, socket)`, `onMobileClose(state, socket)` — presence cleanup + `mobile.disconnected` emission.
  - `buildApp(relayMobileUrl?)` now wires these handlers and passes `state`.

- [ ] **Step 1: Write the failing handler integration test**

`apps/relay/src/handlers.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run apps/relay/src/handlers.test.ts`
Expected: FAIL — `buildApp` takes no arg / handlers absent.

- [ ] **Step 3: Write the handlers**

`apps/relay/src/handlers.ts`:

```ts
import type { WebSocket } from "@fastify/websocket";
import {
  parseWireMessage,
  makeResponse,
  makeError,
  makeEvent,
  isRequest,
  isResponse,
  isEvent,
  MobilePairParamsSchema,
  MobileResumeParamsSchema,
  DesktopRegisterParamsSchema,
  DesktopPairingCreateParamsSchema,
  DESKTOP_EVENTS,
  MOBILE_FORWARDED_METHODS,
} from "@cucoudle/protocol";
import { RelayState, type MobileConn } from "./state.js";

const MOBILE_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const FORWARDED = new Set<string>(MOBILE_FORWARDED_METHODS);
const DESKTOP_EVENT_SET = new Set<string>(DESKTOP_EVENTS);

function send(socket: WebSocket, msg: unknown): void {
  socket.send(JSON.stringify(msg));
}

export function handleDesktopMessage(
  state: RelayState,
  socket: WebSocket,
  raw: string,
  relayMobileUrl: string,
): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    send(socket, makeError("", parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;

  if (isRequest(msg)) {
    if (msg.method === "desktop.register") {
      const p = DesktopRegisterParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      state.registerDesktop(p.data, socket);
      return send(socket, makeResponse(msg.id, { registered: true }));
    }
    if (msg.method === "desktop.pairing.create") {
      const p = DesktopPairingCreateParamsSchema.safeParse(msg.params);
      if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
      const desktopId = state.removeDesktopBySocket === undefined ? "" : findDesktopId(state, socket);
      if (!desktopId) return send(socket, makeError(msg.id, "DAEMON_UNAVAILABLE", "desktop not registered"));
      const created = state.createPairing(desktopId, p.data.ttlSeconds, relayMobileUrl, Date.now());
      return send(socket, makeResponse(msg.id, { desktopId, ...created }));
    }
    return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
  }

  if (isResponse(msg)) {
    const mobile = state.pending.get(msg.id);
    if (mobile) {
      state.pending.delete(msg.id);
      send(mobile.socket, msg);
    }
    return;
  }

  if (isEvent(msg) && DESKTOP_EVENT_SET.has(msg.event)) {
    const desktopId = findDesktopId(state, socket);
    if (!desktopId) return;
    for (const mobile of state.mobilesForDesktop(desktopId)) {
      send(mobile.socket, msg);
    }
  }
}

export function handleMobileMessage(state: RelayState, socket: WebSocket, raw: string): void {
  const parsed = parseWireMessage(raw);
  if (!parsed.ok) {
    send(socket, makeError("", parsed.code, parsed.message));
    return;
  }
  const msg = parsed.msg;
  if (!isRequest(msg)) return; // mobile only sends requests in MVP

  if (msg.method === "mobile.pair") {
    const p = MobilePairParamsSchema.safeParse(msg.params);
    if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
    const desktop = state.getDesktop(p.data.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    const consumed = state.consumePairing(p.data.desktopId, p.data.pairingCode, Date.now());
    if (!consumed.ok) return send(socket, makeError(msg.id, consumed.code, "pairing failed"));

    const issued = state.issueMobileSession(p.data.desktopId, p.data.mobileDevice.id, MOBILE_SESSION_TTL_MS, Date.now());
    const conn: MobileConn = {
      mobileDeviceId: p.data.mobileDevice.id,
      mobileDevice: p.data.mobileDevice,
      desktopId: p.data.desktopId,
      token: issued.token,
      socket,
    };
    state.linkMobile(conn);
    send(socket, makeResponse(msg.id, {
      desktopId: desktop.desktopId,
      desktopName: desktop.name,
      paired: true,
      mobileSessionToken: issued.token,
      mobileSessionExpiresAt: issued.expiresAt,
    }));
    send(desktop.socket, makeEvent("mobile.paired", {
      mobileDevice: p.data.mobileDevice,
      mobileSessionExpiresAt: issued.expiresAt,
    }));
    return;
  }

  if (msg.method === "mobile.resume") {
    const p = MobileResumeParamsSchema.safeParse(msg.params);
    if (!p.success) return send(socket, makeError(msg.id, "INVALID_MESSAGE", p.error.message));
    const desktop = state.getDesktop(p.data.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    const resumed = state.resumeMobile(p.data.desktopId, p.data.mobileDeviceId, p.data.mobileSessionToken, Date.now());
    if (!resumed.ok) return send(socket, makeError(msg.id, resumed.code, "resume failed"));
    state.linkMobile({
      mobileDeviceId: p.data.mobileDeviceId,
      mobileDevice: { id: p.data.mobileDeviceId, name: "resumed", platform: "unknown" },
      desktopId: p.data.desktopId,
      token: p.data.mobileSessionToken,
      socket,
    });
    return send(socket, makeResponse(msg.id, { desktopId: desktop.desktopId, desktopName: desktop.name, resumed: true }));
  }

  if (FORWARDED.has(msg.method)) {
    const conn = findMobileConn(state, socket);
    if (!conn) return send(socket, makeError(msg.id, "MOBILE_NOT_PAIRED", "pair before sending session commands"));
    const desktop = state.getDesktop(conn.desktopId);
    if (!desktop) return send(socket, makeError(msg.id, "DESKTOP_OFFLINE", "desktop is offline"));
    state.pending.set(msg.id, conn);
    send(desktop.socket, msg);
    return;
  }

  return send(socket, makeError(msg.id, "UNSUPPORTED_METHOD", `unknown method ${msg.method}`));
}

export function onDesktopClose(state: RelayState, socket: WebSocket): void {
  state.removeDesktopBySocket(socket);
}

export function onMobileClose(state: RelayState, socket: WebSocket): void {
  const removed = state.unlinkMobileBySocket(socket);
  if (!removed) return;
  const desktop = state.getDesktop(removed.desktopId);
  if (desktop) {
    send(desktop.socket, makeEvent("mobile.disconnected", { mobileDeviceId: removed.mobileDeviceId }));
  }
}

function findDesktopId(state: RelayState, socket: WebSocket): string {
  for (const [id, conn] of state.desktops) {
    if (conn.socket === socket) return id;
  }
  return "";
}

function findMobileConn(state: RelayState, socket: WebSocket): MobileConn | undefined {
  for (const set of state.links.values()) {
    for (const conn of set) {
      if (conn.socket === socket) return conn;
    }
  }
  return undefined;
}
```

- [ ] **Step 4: Rewrite the app to wire handlers and shared state**

Replace `apps/relay/src/app.ts` with:

```ts
import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { RelayState } from "./state.js";
import {
  handleDesktopMessage,
  handleMobileMessage,
  onDesktopClose,
  onMobileClose,
} from "./handlers.js";

export function buildApp(relayMobileUrl = "ws://localhost:8787/v1/ws/mobile"): FastifyInstance {
  const app = Fastify({ logger: false });
  const state = new RelayState();
  app.register(websocket);

  app.get("/healthz", async () => ({ status: "ok" }));

  app.register(async (instance) => {
    instance.get("/readyz", async () => ({ status: "ready" }));

    instance.get("/v1/ws/mobile", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleMobileMessage(state, socket, data.toString()));
      socket.on("close", () => onMobileClose(state, socket));
    });

    instance.get("/v1/ws/desktop", { websocket: true }, (socket) => {
      socket.on("message", (data: Buffer) => handleDesktopMessage(state, socket, data.toString(), relayMobileUrl));
      socket.on("close", () => onDesktopClose(state, socket));
    });
  });

  return app;
}

export async function startServer(port: number, relayMobileUrl?: string): Promise<FastifyInstance> {
  const app = buildApp(relayMobileUrl);
  await app.listen({ port, host: "0.0.0.0" });
  return app;
}
```

- [ ] **Step 5: Simplify the desktop.pairing.create desktop-id lookup**

In `apps/relay/src/handlers.ts`, replace the `desktop.pairing.create` branch's id lookup line:

```ts
      const desktopId = state.removeDesktopBySocket === undefined ? "" : findDesktopId(state, socket);
```

with:

```ts
      const desktopId = findDesktopId(state, socket);
```

- [ ] **Step 6: Run the handler test to verify it passes**

Run: `npx vitest run apps/relay/src/handlers.test.ts`
Expected: PASS — pairing, forwarding, events, disconnect all green.

- [ ] **Step 7: Run the full relay + protocol suite**

Run: `npx vitest run`
Expected: PASS — all protocol and relay tests.

- [ ] **Step 8: Commit**

```bash
git add apps/relay/src/handlers.ts apps/relay/src/app.ts apps/relay/src/handlers.test.ts
git commit -m "feat(relay): implement register, pairing, forwarding, and event fan-out"
```

---

### Task 7: End-to-end smoke harness (fake desktop + fake mobile)

**Files:**
- Create: `apps/relay/scripts/fake-desktop.ts`
- Create: `apps/relay/scripts/fake-mobile.ts`
- Test: `apps/relay/src/e2e.test.ts`
- Modify: `apps/relay/package.json` (scripts)
- Modify: `README.md`

**Interfaces:**
- Consumes: the running relay (`buildApp`), `ws` client.
- Produces: an executable smoke path proving the minimum demo contract (`desktop.register` → `desktop.pairing.create` → `mobile.pair` → `session.list` → `session.subscribe` → `terminal.output` → `session.input` → `session.ended`) end-to-end through the relay, plus two standalone scripts (`npm run fake:desktop`, `npm run fake:mobile`) for manual demos against a real relay.

- [ ] **Step 1: Write the failing end-to-end test**

`apps/relay/src/e2e.test.ts`:

```ts
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
function next(ws: WebSocket, p: (m: any) => boolean): Promise<any> {
  return new Promise((resolve) => {
    const on = (raw: Buffer) => {
      const m = JSON.parse(raw.toString());
      if (p(m)) { ws.off("message", on); resolve(m); }
    };
    ws.on("message", on);
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

    desktop.send(req("desktop.register", "d1", { desktopId: "desk_1", desktopName: "Mac", platform: "macos", appVersion: "0.1.0" }));
    await next(desktop, (m) => m.id === "d1");
    desktop.send(req("desktop.pairing.create", "d2", { ttlSeconds: 300 }));
    const code = (await next(desktop, (m) => m.id === "d2")).result.pairingCode as string;

    const mobile = await open(port, "/v1/ws/mobile");
    mobile.send(req("mobile.pair", "m1", { desktopId: "desk_1", pairingCode: code, mobileDevice: { id: "mob_a", name: "iPhone", platform: "ios" } }));
    await next(mobile, (m) => m.id === "m1" && m.ok);

    mobile.send(req("session.list", "m2", {}));
    const list = await next(mobile, (m) => m.id === "m2");
    expect(list.result.sessions[0].id).toBe("sess_1");

    mobile.send(req("session.subscribe", "m3", { sessionId: "sess_1" }));
    const sub = await next(mobile, (m) => m.id === "m3");
    expect(sub.result.mode).toBe("live");
    const output = await next(mobile, (m) => m.kind === "event" && m.event === "terminal.output");
    expect(output.data.data).toContain("Running tests");

    mobile.send(req("session.input", "m4", { sessionId: "sess_1", data: "continue\n", inputMode: "text" }));
    const inputAck = await next(mobile, (m) => m.id === "m4");
    expect(inputAck.result.accepted).toBe(true);
    const ended = await next(mobile, (m) => m.kind === "event" && m.event === "session.ended");
    expect(ended.data.exitCode).toBe(0);

    desktop.close();
    mobile.close();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails, then passes**

Run: `npx vitest run apps/relay/src/e2e.test.ts`
Expected: PASS immediately if Task 6 is complete (it exercises only shipped behavior). If it fails, the failure localizes a routing bug — fix in `handlers.ts` before continuing.

- [ ] **Step 3: Write the standalone fake desktop script**

`apps/relay/scripts/fake-desktop.ts`:

```ts
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
```

- [ ] **Step 4: Write the standalone fake mobile script**

`apps/relay/scripts/fake-mobile.ts`:

```ts
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
  if (m.kind === "event" && m.event === "session.ended") console.log("\nsession ended:", m.data.exitCode);
});
```

- [ ] **Step 5: Add npm scripts for the fakes**

In `apps/relay/package.json`, add to `scripts`:

```json
    "fake:desktop": "tsx scripts/fake-desktop.ts",
    "fake:mobile": "tsx scripts/fake-mobile.ts"
```

- [ ] **Step 6: Document how to run the relay and the smoke demo**

Append to `README.md`:

```markdown
## Relay (Developer 3 slice)

Requires Node.js 20+.

```bash
npm install
npm run relay              # starts the relay on ws://localhost:8787
```

Health: `curl localhost:8787/healthz` and `curl localhost:8787/readyz`.

### End-to-end smoke without the real apps

Three terminals:

```bash
npm run relay                                   # terminal 1
npm run fake:desktop -w @cucoudle/relay         # terminal 2 — prints a PAIRING CODE
PAIRING_CODE=<code> npm run fake:mobile -w @cucoudle/relay   # terminal 3
```

The mobile fake pairs, lists the fake session, streams terminal output, and sends input back to the fake desktop.

Run the automated suite with `npm test`.
```

- [ ] **Step 7: Run the full suite once more**

Run: `npx vitest run`
Expected: PASS — protocol + relay unit/integration + e2e.

- [ ] **Step 8: Manually verify the standalone fakes (optional but recommended)**

Run each in its own terminal per the README block. Confirm the mobile terminal prints `tick N` lines and `echo: hello from phone`, and the desktop terminal logs `input from mobile`.

- [ ] **Step 9: Commit**

```bash
git add apps/relay/scripts apps/relay/src/e2e.test.ts apps/relay/package.json README.md package-lock.json
git commit -m "test(relay): add end-to-end smoke harness and demo scripts"
```

---

### Task 8: Project documentation update

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

**Interfaces:**
- Consumes: verified state from Tasks 1–7.
- Produces: the mandatory increment record and the refreshed implementation snapshot required by `AGENTS.md` before this work is considered complete.

- [ ] **Step 1: Append a PROGRESS.md entry**

Add to the end of `docs/PROGRESS.md`, filling `Проверки` with the actual `npx vitest run` result observed in Task 7:

```markdown
## 2026-07-11 — Relay и shared protocol (Dev 3)

**Цель:** Реализовать канал десктоп↔мобила: shared-схемы протокола и WebSocket relay-брокер.

**Сделано:** Создан монорепо на npm workspaces. Пакет `@cucoudle/protocol` (zod-схемы envelope, домена, методов и событий + JSON examples). Сервис `@cucoudle/relay` (Fastify + `@fastify/websocket`): pairing по коду/QR, выдача `mobileSessionToken`, presence, прозрачный форвардинг mobile↔desktop с корреляцией по `id`, fan-out событий desktop→mobile. Добавлены fake-desktop/fake-mobile скрипты и сквозной smoke-тест минимального demo-контракта.

**Затронутые компоненты:** `package.json`, `tsconfig.base.json`, `vitest.config.ts`, `packages/protocol/*`, `apps/relay/*`, `README.md`.

**Проверки:** `npx vitest run` — <вставить фактический результат: N passed>.

**Решения, ограничения и проблемы:** Relay in-memory; при рестарте pairing и токены теряются (допустимо для MVP). Relay не хранит transcript. Пакеты потребляются как TS-исходники без build-шага. `session.subscribe` replay/snapshot — ответственность десктопа; relay только форвардит.

**Следующий шаг:** Подключить настоящий desktop-daemon и mobile-app к relay; проверить Android/Linux; при необходимости добавить статичный tunnel-URL для удалённого demo.
```

- [ ] **Step 2: Update FINAL_IMPLEMENTATION.md**

In `docs/FINAL_IMPLEMENTATION.md`, move relay/protocol items into "Реализовано и подтверждено" and keep desktop/mobile apps under limitations. Add under the implemented section:

```markdown
- реализован shared-протокол `@cucoudle/protocol` (versioned envelope, домен сессий, схемы методов и событий) с проверкой схем через zod;
- реализован WebSocket relay `@cucoudle/relay`: pairing по коду/QR, presence, форвардинг сообщений mobile↔desktop и fan-out событий, покрытый юнит-, интеграционными и сквозным smoke-тестами;
- есть fake-desktop/fake-mobile харнесс для демонстрации канала без готовых desktop/mobile приложений.
```

Update the limitations section to state desktop daemon, shell shims, and the mobile UI are not yet implemented, and remote transport (tunnel/relay hosting) is not yet configured.

- [ ] **Step 3: Verify docs formatting**

Run: `git diff --check`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md
git commit -m "docs: record relay and protocol increment"
```

---

## Self-Review Notes

- **Spec coverage:** envelope, error codes, domain models, all MVP methods (`mobile.pair`, `mobile.resume`, `session.list`, `session.subscribe`, `session.input`, `session.interrupt`, `terminal.resize`, `desktop.register`, `desktop.pairing.create`), all desktop events, pairing flow, forwarding rule, presence events, health endpoints, and the minimum demo contract each map to a task. `terminal.resize` rides the generic forwarding path (Task 6) and needs no special handling.
- **Relay boundary:** relay never assigns `seq`, never stores transcripts, and forwards `session.subscribe` untouched — replay/snapshot is the desktop's responsibility, matching the contract.
- **Out of scope (owned by other devs):** desktop daemon/PTY/shims (`apps/desktop`), mobile UI (`apps/mobile`). This plan creates only the workspace root plus `packages/protocol` and `apps/relay`.
- **Deferred by MVP:** durable relay persistence, end-to-end encryption, and native Claude/Codex SDK adapters are explicit non-goals.
