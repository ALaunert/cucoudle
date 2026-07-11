# Cucoudle CLI remote control MVP design

## Purpose

Cucoudle lets a developer continue local CLI agent sessions from a phone without changing their normal terminal habit. After desktop setup, the user still runs `claude`, `codex`, `agent`, or `cursor` in a terminal. Cucoudle intercepts those commands through shell shims, launches the real CLI inside a desktop-managed PTY, mirrors terminal output to the mobile app, and forwards mobile input back to the local process.

The hackathon MVP proves the core loop across macOS, Linux, iOS, and Android:

- desktop app configures CLI integration automatically;
- ordinary CLI commands create managed sessions;
- phone pairs with desktop through a relay;
- mobile app lists active sessions;
- user can read the same terminal state, send text or terminal keys, answer approvals and choices, interrupt, and switch between sessions.

## Scope

This design covers the first CLI-only implementation. It includes three cooperating subsystems:

- desktop daemon and shell integration;
- backend relay and pairing;
- mobile application UI and WebSocket client.

The feature is intentionally scoped to CLI processes. Sessions launched inside Claude Desktop, Cursor Desktop, Codex desktop surfaces, or IDE extensions are out of scope for this MVP unless they are started through the CLI shims.

## Non-goals

- No control of Claude Desktop, Cursor Desktop, IDE extension sessions, or arbitrary GUI windows.
- No Accessibility, Screen Recording, or GUI automation permissions.
- No production-grade App Store or Play Store distribution.
- No requirement to finish every ANSI/alternate-screen edge case in the first demo; raw terminal data and full input fallback must still be preserved.
- No semantic parsing of every agent-specific TUI state.
- No native Codex app-server, Claude SDK, or Cursor cloud adapter in the MVP.
- No durable multi-server relay persistence.

## Chosen approach

The selected approach is a managed PTY bridge with transparent command shims.

The desktop app installs executable shims in `~/.cucoudle/bin` and puts that directory before the real CLI binaries in `PATH`. When the user runs `claude`, `codex`, `agent`, or `cursor`, the shim asks the local daemon to launch the real binary in a PTY. The daemon attaches the local terminal to that PTY, streams the same output to the relay, and accepts input from the mobile app.

This gives the desired user experience: the command remains familiar, while Cucoudle owns enough of the process boundary to mirror and steer the session.

## Alternatives considered

### Direct use of official remote-control products

Claude and Cursor both have their own remote-control/mobile stories. Those products are useful as external fallbacks, but they do not provide one unified Cucoudle app across Claude, Codex, Cursor, and generic CLI sessions.

### Attaching to already-running arbitrary terminal processes

Attaching to a process that was started directly in Terminal.app, iTerm, or a Linux terminal without a wrapper is not reliable. A daemon can inspect PIDs and TTYs, but it cannot safely reconstruct stdin/stdout ownership, scrollback, prompt state, and terminal control. The MVP does not promise this.

### Native provider APIs first

Codex app-server and Claude SDK-style integrations can produce better structured UI later. They are postponed because the hackathon goal is a universal CLI flow across all agents.

## Architecture

```text
local terminal
  -> ~/.cucoudle/bin/<tool> shim
  -> desktop daemon local API
  -> real CLI process in PTY
  -> output mirrored to terminal and relay

mobile app
  -> relay WebSocket
  -> desktop daemon
  -> PTY input
  -> real CLI process
```

The production MVP path is always mobile app -> relay backend -> desktop daemon. Direct mobile-to-desktop connection is only a local development shortcut for early smoke tests. The desktop daemon is the source of truth for sessions. The relay routes messages between paired devices but does not own session state in the MVP. The mobile app caches what it receives for display, but it re-syncs from the desktop daemon after reconnect.

## Desktop component

The desktop component is a Python application for macOS and Linux.

Responsibilities:

- find real CLI binaries before installing shims;
- install and uninstall shims for supported commands;
- update shell config with a marked `PATH` block;
- start a long-running daemon;
- expose local launch/control APIs to shims;
- create and manage PTY-backed sessions;
- mirror terminal output to both the local terminal and mobile transport;
- forward text, raw bytes, named keys, interrupts, and resize events into the PTY;
- detect supported Claude/Codex/Cursor prompts and bind structured interactions to exact PTY responses;
- reject stale interaction responses rather than sending input to a newer prompt;
- advertise desktop protocol capabilities during registration;
- keep local session metadata and recent events in SQLite;
- connect to the relay as the paired desktop device.

Required shim behavior:

- pass through `argv`, `cwd`, environment, and terminal size;
- use stored real binary paths rather than resolving itself through `PATH`;
- fallback to `exec real_binary "$@"` when the daemon is unavailable;
- preserve normal exit codes as closely as practical.

## Backend relay component

The relay is a centrally hosted, always-on TypeScript service using Fastify and WebSockets. It is product infrastructure, not an end-user application: desktop/mobile installers never install, start, stop, update, or uninstall the relay. Cucoudle operators deploy and update one shared service behind TLS, health checks, monitoring and an automatic restart policy. Local `npm run relay` exists only for development and tests.

Responsibilities:

- accept desktop connections;
- accept mobile connections;
- validate pairing codes;
- route messages between a mobile device and a desktop device;
- track ephemeral presence;
- emit clear errors for offline desktop, invalid pairing, and expired pairing.
- negotiate the intersection of mobile, relay and desktop capabilities during pair/resume.

For MVP, relay state can be in memory. If the process restarts, active pairings and connections may be lost and clients reconnect. This is acceptable for the hackathon but not sufficient for production reliability; durable credentials/revocation and multi-instance routing are operator-side follow-up work.

## Mobile component

The mobile app is an Expo React Native app for iOS and Android.

Responsibilities:

- pair with desktop by scanning QR or entering a code;
- maintain relay WebSocket connection;
- offer mobile capabilities and enable controls only from `negotiatedCapabilities`;
- show a sessions list with agent, title, cwd, status, and last activity;
- show a session detail screen with streaming terminal output;
- render structured approvals, confirmations, choice lists and text prompts when desktop emits them;
- send text, named terminal keys, arbitrary raw input and structured interaction responses;
- send interrupt commands;
- switch between multiple active sessions;
- show offline, reconnecting, and ended states.

The session screen is a terminal/timeline hybrid. It always shows the terminal stream and composer, adds a terminal keyboard accessory for Escape, Tab, Ctrl, arrows and Enter, and overlays native interaction controls when a safe desktop binding exists. Structured controls never replace terminal access.

Terminal parity and semantic UI are separate guarantees:

- terminal parity is universal and provider-independent: UTF-8 text, exact raw bytes, named keys/modifiers, terminal resize and ANSI/VT output;
- semantic UI is adapter-driven: Approve/Reject, allow once/session, options and text prompts are shown only for recognized prompt states;
- unknown prompts remain fully operable through terminal input, so a parser gap cannot block the user.

## Shared protocol

All subsystems exchange typed JSON messages. The shared TypeScript protocol package owns event names and field names; the desktop side mirrors those models with Pydantic. `session.input` covers text/raw/bytes/keys. `interaction.requested`, `interaction.updated`, `interaction.respond`, and `interaction.resolved` cover native approval, choice and text UI. Pair/resume returns the intersection of mobile, relay and desktop feature offers; unsupported controls remain hidden. Detailed contracts are defined in `docs/protocol-contracts.md`.

Core session model:

```ts
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

The wire format is the versioned request/response/event envelope from `docs/protocol-contracts.md`. Design docs may mention method and event names such as `session.list` or `terminal.output`, but implementation must use the envelope contract.

## Pairing flow

Desktop pairing starts from the desktop app settings screen:

1. Desktop app connects to relay.
2. Desktop app asks relay to create a short-lived pairing code with `desktop.pairing.create`.
3. Desktop app displays a QR payload containing relay URL, desktop id, pairing code, and expiry.
4. Mobile scans the QR and connects to the relay.
5. Relay validates the pairing code and joins the mobile connection to the matching desktop connection.
6. Relay notifies desktop with `mobile.paired`.
7. Desktop records the paired mobile device for the settings UI.

Minimum QR payload:

```json
{
  "relayUrl": "wss://relay.example.test/v1/ws/mobile",
  "desktopId": "desk_123",
  "pairingCode": "123456",
  "expiresAt": "2026-07-11T12:00:00Z"
}
```

## Error handling

Desktop daemon unavailable:

- shim falls back to the real CLI binary;
- mobile sees no managed session for that process.

Real CLI binary missing:

- desktop setup marks that tool as unavailable;
- no shim is installed for the missing tool unless the user explicitly enables a custom path.

Relay disconnected:

- existing local terminal session continues;
- mobile shows reconnecting/offline;
- desktop re-registers active sessions after reconnect.

Mobile sends input to a stopped session:

- desktop rejects the command with a structured error;
- mobile disables the composer for that session.

Interaction is no longer current:

- desktop rejects the response with `INTERACTION_STALE` or `INTERACTION_NOT_FOUND`;
- mobile refreshes the active interaction from `session.subscribe` and does not retry automatically.

PTY exits:

- desktop emits `session.ended`;
- mobile keeps the transcript visible and marks the session stopped.

## Security and permissions

The MVP avoids GUI permissions. It does not need Accessibility or Screen Recording.

Expected permissions:

- desktop app may need login item/autostart permission;
- desktop app may need Keychain or Secret Service access for device secrets;
- macOS Full Disk Access may be needed when daemon-launched agents work in protected folders such as Documents, Desktop, Downloads, or iCloud Drive.

Relay messages are authenticated by pairing code in the MVP. Production encryption and device key management are deferred, but the protocol should not assume relay storage of plaintext transcripts is required.

## Team ownership

Desktop owner:

- `apps/desktop`;
- daemon, PTY bridge, shims, installer, session registry, desktop relay client.

Mobile frontend owner:

- `apps/mobile`;
- Expo app, pairing UI, sessions list, session view, terminal output renderer, composer.

Backend and integration owner:

- `apps/relay`;
- `packages/protocol`;
- WebSocket relay, pairing, shared schemas, Android smoke tests, Linux smoke tests.

These write areas are intentionally separate so the three hackathon developers can work in parallel with low merge conflict risk.

## Testing strategy

Desktop:

- unit-test binary discovery and shim config generation;
- integration-test PTY launch with `bash`;
- contract-test text/raw/bytes/named-key input and modifier mappings;
- fixture-test each provider approval/choice detector and stale interaction rejection;
- verify fallback when daemon is stopped;
- smoke-test `claude`, `codex`, and Cursor command names where installed.

Relay:

- unit-test pairing code lifecycle;
- integration-test message routing between fake desktop and fake mobile clients;
- verify offline desktop and expired pairing errors.

Mobile:

- component-test sessions list and session detail with mocked events;
- component-test approval, reject, single/multi choice, text response and terminal fallback states;
- verify interaction actions are disabled after send and restored correctly after reconnect;
- manual iOS and Android test with relay;
- verify reconnect and stopped-session UI states.

End-to-end demo:

- start relay;
- start desktop daemon;
- pair mobile;
- run a CLI command through shim;
- see the session on mobile;
- send text and terminal keys from mobile;
- answer one Approve/Reject or option prompt with native controls, with terminal fallback visible;
- verify the answer reaches the intended current PTY prompt exactly once;
- switch between two active sessions.

## Implementation plan pointer

The operational task breakdown for the hackathon lives in `docs/hackathon-implementation-plan.md`. This spec defines the design and boundaries; the plan defines sequencing, per-developer responsibilities, and demo criteria.
