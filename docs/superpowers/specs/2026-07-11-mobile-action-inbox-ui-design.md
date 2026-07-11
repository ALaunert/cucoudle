# Cucoudle mobile Action Inbox UI design

## Status

Approved in the interactive design session on 2026-07-11. This document defines the mobile UI and mobile-side behavior for implementation planning. It does not claim that `apps/mobile` is already implemented.

## Purpose

Cucoudle gives a developer a mobile control surface for CLI sessions managed on a paired computer. The mobile home screen should answer one question first: **where does the user need to act?**

The selected direction is **Action Inbox**. Sessions that require attention appear before ordinary activity, while the complete session list and live terminal remain first-class parts of the app.

## Confirmed constraints

- Mobile stack: Expo, React Native, TypeScript, Expo Router, npm.
- Primary demo device: iPhone through Expo Go; Android remains a compatibility target.
- The mobile app consumes `@cucoudle/protocol` and connects to the implemented WebSocket relay.
- Desktop is the source of truth for sessions. Relay only handles pairing, presence, forwarding, and request correlation.
- Runtime TS/Zod schemas and relay routing now support structured interactions and full input modes. Capability negotiation, desktop Pydantic/bindings, and mobile controls are not implemented yet, so baseline clients must continue to use raw terminal fallback.
- The MVP controls one active paired computer at a time.
- The MVP does not launch a new CLI session from the phone.

## Product goals

- Put blocked, failed, and completed sessions that need review ahead of passive activity.
- Make it possible to enter a live session with one tap, read terminal output, send input, and interrupt the process.
- Preserve context during network loss without pretending that stale data is live.
- Reserve stable UI space for capability-gated direct `Allow` / `Reject` actions while keeping baseline raw terminal fallback.
- Keep the hackathon MVP small enough to implement and demonstrate on a real iPhone.

## Non-goals

- Provider-specific semantic parsing of Claude, Codex, or Cursor terminal output.
- Direct permission approval/rejection unless `interaction.structured` is present in `negotiatedCapabilities`.
- Starting a remote CLI session from mobile before a session-launch contract exists.
- Beautiful ANSI styling, rich code blocks, link detection, or full TUI/terminal emulation.
- Simultaneous control of multiple paired computers.
- Push notifications, production end-to-end encryption, or App Store distribution.

## Information architecture

### First-run route

An unpaired installation opens the pairing flow:

1. scan the desktop QR code;
2. alternatively enter the full relay mobile WebSocket URL, desktop id, and pairing code shown by the desktop;
3. send `mobile.pair` with the local mobile device identity;
4. store an active pairing profile containing the exact full `relayWsUrl` (`ws(s)://…/v1/ws/mobile`), desktop id/name, mobile device id, token, and token expiry securely;
5. enter the main tab shell and request `session.list`.

Pairing errors remain on the pairing screen and explain whether the code is invalid, expired, or the desktop is offline.

### Main navigation

The bottom navigation has four destinations:

1. **Inbox** — the default screen and attention queue;
2. **Sessions** — all active and completed sessions;
3. **New** — a central action that opens a sheet;
4. **Settings** — connection state, device details, security notes, and diagnostics.

The `New` action sheet contains:

- **Connect computer** — active in the MVP and opens QR/manual pairing;
- **Start session** — visible as planned but unavailable until a launch contract is defined.

Because the MVP supports one active computer, pairing another computer requires confirmation and replaces the active connection profile. Multi-computer switching is deferred.

## Screens

### Inbox

The screen contains, in order:

1. title and actionable-card count;
2. cards requiring attention;
3. recent generic session activity;
4. persistent bottom navigation.

The MVP derives cards only from protocol-supported session state:

- `waiting` → “Agent is waiting for your input” and `Open session`;
- `error` → “Session stopped with an error” and `View terminal`;
- `stopped` → “Session completed” and `View result` until locally dismissed;
- `starting` and `running` remain in recent activity and the Sessions tab.

`waiting` is optional in the current desktop contract. If the desktop cannot detect it reliably, the Inbox must not infer it by parsing terminal text. In that case, the user still reaches the session from recent activity or Sessions.

The recent activity feed uses only lifecycle facts available from `session.created`, `session.updated`, and `session.ended`. It may say “Session started,” “Status changed,” or “Session ended.” Semantic items such as “Added four files” are reserved for a future structured event contract.

Dismissal is mobile-local. A dismissible card key is exactly `sessionId:status:lastActivityAt`, with `exitCode` appended when present. The same key stays dismissed; a later `session.updated`, `session.ended`, or refreshed `session.list` value that changes any key field creates a new card key and makes the card eligible to appear again.

### Sessions

The Sessions screen shows agent, title, project/cwd, status, and last activity. A simple local filter switches between all, active (`starting`, `running`, `waiting`), and completed (`stopped`, `error`) sessions. Selecting a row opens the same Session detail screen used by Inbox cards.

Empty states distinguish:

- connected computer with no managed sessions;
- reconnecting or offline computer;
- paired computer whose daemon has not returned a session list yet.

### Session detail

The detail screen contains:

- agent, title, status, project/cwd, and connection state; the displayed project label is derived from the basename of `cwd` because `Session` has no separate project field;
- scrollable monospaced terminal output;
- a text composer that sends `session.input` in `text` mode with a trailing newline;
- an interrupt control that sends `session.interrupt`;
- a reserved action area above the composer;
- reconnect, stopped, and error banners.

The MVP receives raw `terminal.output` chunks and renders readable plain monospaced text. It may minimally filter non-printing control sequences for legibility, but it does not interpret ANSI styling or emulate a full-screen TUI. Rich terminal rendering is explicitly deferred.

The composer and interrupt control are disabled when the desktop is offline, the session is stopped, or an input request is awaiting its response. User input is never retried automatically because duplicate terminal input is visible and potentially destructive.

### New action sheet

The sheet preserves the central-plus interaction from the approved visual direction:

- `Connect computer` opens pairing;
- `Start session` is visibly planned and explains that desktop launch support is coming later.

### Settings

The MVP settings surface shows:

- paired computer name and current connection state;
- mobile device name/id used for pairing;
- reconnect or re-pair action;
- replace active computer action;
- protocol/app version and basic diagnostic status;
- a concise security note explaining the hackathon pairing model.

## Reserved structured-action area

The layout permanently reserves an action zone inside attention cards and Session detail.

Current fallback behavior:

- if only `Session.status = waiting` is known, show one full-width `Open session` button;
- permission type and response payload are not inferred from terminal text.

Capability-gated behavior defined by the target protocol contract:

- `interaction.requested` with a permission action may show `Reject` and `Allow` in the same zone;
- a structured question action may show `Answer` and send `interaction.respond`;
- the zone supports `pending`, `submitting`, `resolved`, and `failed` visual states;
- exact payloads, response intents, stale-response rules, and reconnect restoration are owned by `docs/protocol-contracts.md` and are not duplicated here.

Until runtime negotiation returns `interaction.structured`, live data renders the full-width `Open session` fallback and does not show misleading disabled `Allow` / `Reject` controls. The reusable action-zone component and its visual test fixture reserve the two-button variant; runtime selection requires the negotiated capability and a current structured interaction.

## Visual system

The approved direction follows the provided dark mobile reference:

- near-black navy background and slightly lighter surfaces;
- large, heavy page titles with compact supporting copy;
- amber attention cards with warm borders;
- mint primary buttons;
- subdued slate secondary buttons and metadata;
- sparse blue activity dots;
- rounded framed bottom navigation;
- large radii and generous vertical spacing suitable for a phone held in one hand.

The visual hierarchy prioritizes the title, action count, attention cards, then recent activity. Color is never the only status signal; labels and status text remain visible. Touch targets should be at least 44 points, text should respect dynamic type within practical layout limits, and controls must expose accessible names.

## Mobile architecture boundaries

The implementation plan should preserve these responsibilities as separate units:

- **Protocol client** — envelope parsing, request ids, response correlation, event dispatch, and connection lifecycle;
- **Pairing/session credentials** — mobile device identity and SecureStore-backed active pairing token;
- **Session store** — normalized sessions, active subscription, terminal buffers, connection state, and pending requests;
- **Inbox selectors** — deterministic derivation of attention cards, counts, recent lifecycle activity, and local dismissal;
- **Screens/routes** — pairing, four-tab shell, and session detail;
- **UI components** — attention card, session row, connection banner, terminal text view, composer, and reserved action zone.

The terminal buffer is an in-process display cache for the MVP. Durable transcript storage is not required. After reconnect, desktop replay or snapshot restores the open session.

## Data flow

### Initial connection

1. Load device identity and the active pairing profile.
2. Open the profile's exact `relayWsUrl`; do not append another path because QR/manual pairing already stores the complete `/v1/ws/mobile` endpoint.
3. Send `mobile.resume` when credentials exist; otherwise show pairing.
4. On success, send `session.list`.
5. Normalize sessions and derive Inbox and Sessions views.

### Opening a session

1. Navigate using the selected session id.
2. Send `session.subscribe` with the last seen `seq` when available.
3. Apply `replay` events, replace the buffer for `snapshot`, or continue directly for `live`.
4. Append subsequent `terminal.output` chunks in sequence.
5. Apply `session.updated` to both detail and list views.
6. On `session.ended`, immediately patch the local session to `status = stopped`, copy the event `exitCode`, and use the event envelope `sentAt` as `lastActivityAt`; disable mutating controls. A nonzero exit code does not become `error` by inference. Only an explicit `session.updated` with `status = error` creates an error state. A later `session.updated` or `session.list` response replaces the local patch.
7. On `session.removed`, remove the session, its terminal buffer, local dismissal keys, and active subscription from the store. If its detail route is open, replace it with a “Session no longer available” state that offers navigation back to Sessions.

### Sending input

1. Disable the submitted composer action while its request is unresolved.
2. Send `session.input` once.
3. Clear the draft only after an `ok` response.
4. On lost connection or error, keep the draft and let the user explicitly retry.

## Reconnect and error behavior

### Connection states

- **online** — live events and controls are enabled;
- **reconnecting** — cached UI remains visible with a banner; mutating controls are disabled;
- **resyncing** — run `mobile.resume`, `session.list`, then subscribe to an open session using its last `seq`;
- **connection recovery** — if `mobile.resume` returns `DESKTOP_OFFLINE`, leave the tab shell for the pairing/recovery route as required by the current contract, but retain the active profile and offer `Retry` or `Pair another computer`; cached sessions are no longer presented as live;
- **pairing required** — on `UNAUTHORIZED`, `PAIRING_EXPIRED`, or `PAIRING_NOT_FOUND`, clear the unusable token and show normal QR/manual pairing.

### Error groups

Return to pairing:

- `UNAUTHORIZED`;
- `PAIRING_EXPIRED`;
- `PAIRING_NOT_FOUND`.

Show connection recovery while retaining the active profile for explicit retry:

- `DESKTOP_OFFLINE`;
- `DAEMON_UNAVAILABLE` after the relay connection itself is restored.

`MOBILE_NOT_PAIRED` clears the unusable mobile session token and returns to normal pairing.

Keep the session context and disable invalid controls:

- `SESSION_STOPPED`;
- `SESSION_NOT_FOUND`;
- `PTY_WRITE_FAILED`.

Unknown or internal errors use a generic recoverable message and diagnostic code. The app must not optimistically remove an action card or automatically retry `session.input`, `session.interrupt`, or future allow/reject actions.

## MVP scope

Included:

- Expo app running on a real iPhone through Expo Go;
- QR and manual pairing;
- one active paired computer;
- reconnect through `mobile.resume`;
- Inbox, Sessions, New, Settings, and Session detail;
- plain monospaced terminal text, composer, and interrupt;
- status-derived attention cards and generic lifecycle activity;
- component/state tests with mocked protocol messages;
- manual iPhone smoke against relay and desktop or the existing fake desktop harness.

Deferred:

The first baseline mobile slice defers the items below. Capability-gated interactions remain part of the broader hackathon target and may be enabled in a follow-up slice after the protocol, relay, and desktop support land.

- enabled direct `Allow` / `Reject` actions until the target interaction schemas and capability negotiation are implemented end to end;
- mobile session launch;
- ANSI colors, styled terminal output, code blocks, links, and full TUI emulation;
- provider-specific terminal parsing;
- push notifications;
- simultaneous multi-computer control;
- production end-to-end encryption and store distribution.

## Testing strategy

### Deterministic tests

- protocol client correlates responses and ignores unknown events safely;
- Inbox selectors map each supported status to the correct card and count;
- local dismissal suppresses only the exact `sessionId:status:lastActivityAt[:exitCode]` key and not a later changed key;
- reconnect executes resume → list → subscribe in order;
- replay, snapshot, and live subscription modes update terminal state correctly;
- input drafts are retained on error and no automatic duplicate request is sent;
- stopped/offline states disable composer and interrupt;
- the structured two-button action variant is not selected without negotiated `interaction.structured`, while its visual fixture remains testable.
- `session.removed` clears list, Inbox, terminal, dismissal, and open-detail state.

### Component tests

- pairing loading, success, expired-code, and desktop-offline states;
- Inbox populated, empty, reconnecting, and stale-cache states;
- Sessions filters and row navigation;
- Session detail streaming, stopped, error, and reconnect states;
- New action sheet active/planned choices;
- accessible labels and disabled states for all actions.

### Manual demo acceptance

1. Launch relay and fake or real desktop.
2. Pair the iPhone by QR or the manual full relay mobile WebSocket URL + desktop id + pairing code fields.
3. See sessions populate in Inbox/Sessions.
4. Open a session and receive streaming terminal output.
5. Send text input and observe it on desktop.
6. Send interrupt and observe the desktop response.
7. Drop and restore the network; keep context and resync without duplicate input.
8. End a session; keep its terminal visible and disable mutating controls.

## Implementation readiness

This design is ready for an implementation plan once the written spec receives final user approval. Structured actions must follow the target contract and remain hidden until end-to-end capability negotiation is implemented; mobile session launch still requires a separate specification and must not be invented during mobile MVP implementation.
