# Mobile Action Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` with `superpowers:dispatching-parallel-agents` to implement this plan wave-by-wave. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Expo Go mobile MVP that pairs with Cucoudle relay, presents the approved Action Inbox UI, lists and controls desktop sessions, survives reconnects, and keeps structured actions capability-gated.

**Architecture:** Create `apps/mobile` as an Expo SDK 54 npm workspace with Expo Router. Keep transport, persistent pairing, pure session state, feature UI, and route wrappers isolated; compose them through one application provider. Use reducer/selectors for deterministic state and inject WebSocket/SecureStore adapters so all behavior is test-first without native services.

**Tech Stack:** Expo SDK 54, React Native, TypeScript, Expo Router, `expo-camera`, `expo-secure-store`, `expo-crypto`, `@cucoudle/protocol`, Jest via `jest-expo`, React Native Testing Library, existing npm workspaces.

---

## Execution model

The repository rule is direct-to-`main`; do not create branches or worktrees. Parallel workers share the worktree, so they must follow these constraints:

- Run at most three lane tasks concurrently.
- Each lane edits only the files listed under that task.
- Lane workers do not run `git add`, `git commit`, pull, rebase, or push.
- After each wave, the orchestrator reviews all lane diffs, runs the wave verification, updates project documents when the increment is significant, commits once, and pushes `main`.
- If remote `main` advances, the orchestrator follows `AGENTS.md`: rebase, preserve both meanings, rerun verification, and push without force.

Parallel schedule:

| Wave | Parallel lanes | Sequential checkpoint |
| --- | --- | --- |
| 0 | none | Task 1 scaffold |
| 1 | Task 2 protocol client; Task 3 state/selectors; Task 4 UI kit | Task 5 integration checkpoint |
| 2 | Task 6 pairing; Task 7 Inbox; Task 8 Sessions | Task 9 integration checkpoint |
| 3 | Task 10 Session detail; Task 11 New/Settings; Task 12 reconnect coordinator | Task 13 structured action integration |
| 4 | none | Task 14 end-to-end verification and docs |

## File map

### Workspace and test configuration

- `apps/mobile/package.json` — Expo workspace scripts and dependencies.
- `apps/mobile/app.json` — Expo Go app metadata, Router plugin, camera permission, SDK 54 monorepo autolinking experiment.
- `apps/mobile/tsconfig.json` — Expo TypeScript config and aliases.
- `apps/mobile/jest.config.js` — `jest-expo` preset and workspace transforms.
- `apps/mobile/jest.setup.ts` — native module mocks and Testing Library cleanup.
- `apps/mobile/expo-env.d.ts` — Expo Router types.
- `package.json` — root mobile/start/test/typecheck scripts.
- `tsconfig.base.json` — keep core typecheck from consuming the nested Expo project.
- `vitest.config.ts` — exclude mobile Jest tests from Vitest.

### Routes and application composition

- `apps/mobile/src/app/_layout.tsx` — root Stack and `AppProvider`.
- `apps/mobile/src/app/index.tsx` — bootstrap redirect.
- `apps/mobile/src/app/pairing.tsx` — thin pairing route.
- `apps/mobile/src/app/(tabs)/_layout.tsx` — four-tab navigation.
- `apps/mobile/src/app/(tabs)/inbox.tsx` — thin Inbox route.
- `apps/mobile/src/app/(tabs)/sessions.tsx` — thin Sessions route.
- `apps/mobile/src/app/(tabs)/new.tsx` — thin New route.
- `apps/mobile/src/app/(tabs)/settings.tsx` — thin Settings route.
- `apps/mobile/src/app/session/[id].tsx` — thin Session detail route.
- `apps/mobile/src/application/AppProvider.tsx` — dependency composition and app context.
- `apps/mobile/src/application/connectionCoordinator.ts` — pair/resume/list/subscribe lifecycle.
- `apps/mobile/src/application/useApp.ts` — typed app context hook.

### Protocol and persistence

- `apps/mobile/src/protocol/mobileClient.ts` — WebSocket lifecycle, request correlation, parsing, event subscription.
- `apps/mobile/src/protocol/protocolError.ts` — typed request/transport errors.
- `apps/mobile/src/protocol/__tests__/mobileClient.test.ts` — deterministic fake-socket tests.
- `apps/mobile/src/pairing/pairingProfile.ts` — active profile schema and QR/manual normalization.
- `apps/mobile/src/pairing/pairingRepository.ts` — SecureStore persistence behind an injected adapter.
- `apps/mobile/src/pairing/deviceIdentity.ts` — stable mobile device id/name/platform.
- `apps/mobile/src/pairing/__tests__/*.test.ts` — parsing and persistence tests.

### State and selectors

- `apps/mobile/src/state/sessionState.ts` — normalized state types and initial state.
- `apps/mobile/src/state/sessionReducer.ts` — protocol event/result transitions.
- `apps/mobile/src/state/inboxSelectors.ts` — attention cards, count, activity order, filters.
- `apps/mobile/src/state/terminalBuffer.ts` — bounded plain-text terminal accumulation.
- `apps/mobile/src/state/__tests__/*.test.ts` — pure reducer/selector tests.

### UI and features

- `apps/mobile/src/ui/theme.ts` — approved dark tokens.
- `apps/mobile/src/ui/components/*.tsx` — Screen, Button, Banner, StatusBadge, EmptyState.
- `apps/mobile/src/features/pairing/*` — QR/manual pairing UI.
- `apps/mobile/src/features/inbox/*` — Action Inbox screen and AttentionCard.
- `apps/mobile/src/features/sessions/*` — filters and SessionRow.
- `apps/mobile/src/features/session/*` — terminal, composer, interrupt, action zone.
- `apps/mobile/src/features/new/*` — connect/start action sheet.
- `apps/mobile/src/features/settings/*` — active connection and diagnostics.

## Definition of done

- `npm test`, `npm run typecheck`, and `npm audit` pass at repository root.
- `npm run mobile:doctor` passes.
- Expo Go opens the app on a real iPhone.
- Pairing, `session.list`, `session.subscribe`, terminal streaming, text input, interrupt, session end, disconnect, and resume are verified against relay plus fake or real desktop.
- No mutating request is automatically resent.
- `Allow` / `Reject` remains hidden unless a negotiated structured-interaction capability is actually available.
- `docs/PROGRESS.md` and `docs/FINAL_IMPLEMENTATION.md` match the verified result.

---

### Task 1: Scaffold the Expo workspace and mobile test harness (Wave 0, sequential)

**Files:**
- Create: `apps/mobile/package.json`
- Create: `apps/mobile/app.json`
- Create: `apps/mobile/tsconfig.json`
- Create: `apps/mobile/jest.config.js`
- Create: `apps/mobile/jest.setup.ts`
- Create: `apps/mobile/expo-env.d.ts`
- Create: `apps/mobile/src/app/_layout.tsx`
- Create: `apps/mobile/src/app/index.tsx`
- Create: `apps/mobile/src/ui/BrandMark.tsx`
- Test: `apps/mobile/src/ui/__tests__/BrandMark.test.tsx`
- Modify: `package.json`
- Modify: `tsconfig.base.json`
- Modify: `vitest.config.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Generate the physical-device-compatible Expo project without installing or generating nested agent rules**

Run from the repository root:

```bash
npx create-expo-app@latest apps/mobile --template default@sdk-54 --no-install --no-agents-md
```

Expected: `apps/mobile` contains an Expo Router TypeScript project and no nested `AGENTS.md`, `.git`, or lockfile.

- [ ] **Step 2: Reduce the generated template to the mapped files and declare workspace identity**

Set `apps/mobile/package.json` name to `@cucoudle/mobile`, keep `main: "expo-router/entry"`, and provide scripts:

```json
{
  "scripts": {
    "start": "expo start",
    "start:tunnel": "expo start --tunnel",
    "doctor": "expo-doctor",
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit"
  }
}
```

Add `"@cucoudle/protocol": "*"` and install Expo-compatible dependencies from `apps/mobile`:

```bash
npx expo install expo-camera expo-secure-store expo-crypto
npx expo install jest-expo jest @types/jest @testing-library/react-native --dev
```

Expected: only the root `package-lock.json` changes because npm workspaces own dependency resolution.

- [ ] **Step 3: Configure monorepo-safe Expo and test settings**

In `app.json`, enable Router and SDK 54 autolinking resolution:

```json
{
  "expo": {
    "name": "Cucoudle",
    "slug": "cucoudle",
    "scheme": "cucoudle",
    "plugins": ["expo-router", ["expo-camera", { "cameraPermission": "Разрешить Cucoudle сканировать QR-код подключения" }]],
    "experiments": { "typedRoutes": true, "autolinkingModuleResolution": true }
  }
}
```

Configure `jest.config.js` with `preset: "jest-expo"`, `setupFilesAfterEnv`, and `transformIgnorePatterns` that allow Expo/React Native modules. Exclude `apps/mobile/**` in root Vitest and root `tsconfig.base.json`. Use these exact root scripts:

```json
{
  "mobile": "npm run start -w @cucoudle/mobile",
  "mobile:tunnel": "npm run start:tunnel -w @cucoudle/mobile",
  "mobile:doctor": "npm run doctor -w @cucoudle/mobile",
  "test:core": "vitest run",
  "test:mobile": "npm test -w @cucoudle/mobile --",
  "test": "npm run test:core && npm run test:mobile",
  "typecheck:core": "tsc -p tsconfig.base.json --noEmit",
  "typecheck:mobile": "npm run typecheck -w @cucoudle/mobile",
  "typecheck": "npm run typecheck:core && npm run typecheck:mobile"
}
```

- [ ] **Step 4: Write the first failing component test**

```tsx
import { render, screen } from "@testing-library/react-native";
import { BrandMark } from "../BrandMark";

test("renders the Cucoudle product name", () => {
  render(<BrandMark />);
  expect(screen.getByText("Cucoudle")).toBeOnTheScreen();
});
```

- [ ] **Step 5: Run the test and verify red**

Run: `npm run test:mobile -- BrandMark.test.tsx`

Expected: FAIL because `BrandMark` does not exist.

- [ ] **Step 6: Implement the minimum component and root route**

```tsx
import { Text } from "react-native";

export function BrandMark() {
  return <Text accessibilityRole="header">Cucoudle</Text>;
}
```

Make `_layout.tsx` render a Stack and `index.tsx` render `BrandMark` temporarily.

- [ ] **Step 7: Verify green and workspace health**

Run:

```bash
npm run test:mobile -- BrandMark.test.tsx
npm run typecheck
npm test
npm run mobile:doctor
```

Expected: BrandMark PASS; all existing 52 core tests plus the new mobile test PASS; both typechecks PASS; Expo doctor reports no blocking issue.

- [ ] **Step 8: Update required project documents for the scaffold increment**

Append the verified scaffold result to `docs/PROGRESS.md` and update only factual implemented state in `docs/FINAL_IMPLEMENTATION.md`.

- [ ] **Step 9: Commit and push Wave 0**

```bash
git add apps/mobile package.json package-lock.json tsconfig.base.json vitest.config.ts .gitignore docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md
git commit -m "feat(mobile): scaffold Expo workspace"
git push origin main
```

Expected: clean tracked worktree; local `.superpowers/` and `docs/SESSION_HANDOFF.md` remain untracked.

---

### Task 2: Build the request-correlated mobile protocol client (Wave 1, lane A)

**Files:**
- Create: `apps/mobile/src/protocol/mobileClient.ts`
- Create: `apps/mobile/src/protocol/protocolError.ts`
- Test: `apps/mobile/src/protocol/__tests__/mobileClient.test.ts`

- [ ] **Step 1: Write a fake-socket test for request correlation**

```ts
test("resolves only the request with the matching response id", async () => {
  const socket = new FakeSocket();
  const client = createMobileClient({ socketFactory: () => socket, now: fixedNow, id: sequentialId() });
  await client.connect("ws://relay.test/v1/ws/mobile");
  const pending = client.request("session.list", {});
  socket.receive(makeResponse("req_1", { sessions: [] }));
  await expect(pending).resolves.toEqual({ sessions: [] });
});
```

Also test structured errors, ignored unknown response ids, event delivery, invalid JSON, close rejection, and that `session.input` is never automatically retried.

- [ ] **Step 2: Run the protocol tests and verify red**

Run: `npm run test:mobile -- mobileClient.test.ts`

Expected: FAIL because `createMobileClient` is missing.

- [ ] **Step 3: Implement the smallest injectable client**

Expose this interface:

```ts
export type MobileClient = {
  connect(url: string): Promise<void>;
  close(): void;
  request<T>(method: string, params: Record<string, unknown>): Promise<T>;
  onEvent(listener: (event: EventMessage) => void): () => void;
  onConnection(listener: (state: ConnectionState) => void): () => void;
};
```

Use `parseWireMessage`, `PROTOCOL_VERSION`, one `Map<string, PendingRequest>`, and injected `socketFactory`, `now`, and `id`. Reject all pending requests on close. Do not add retry logic.

- [ ] **Step 4: Verify client green**

Run: `npm run test:mobile -- mobileClient.test.ts`

Expected: all client cases PASS.

- [ ] **Step 5: Run lane typecheck**

Run: `npm run typecheck:mobile`

Expected: PASS.

- [ ] **Step 6: Stop without committing**

Report changed files and test output to the orchestrator. Do not touch Git state.

---

### Task 3: Implement pure session state, terminal buffering, and Inbox selectors (Wave 1, lane B)

**Files:**
- Create: `apps/mobile/src/state/sessionState.ts`
- Create: `apps/mobile/src/state/sessionReducer.ts`
- Create: `apps/mobile/src/state/terminalBuffer.ts`
- Create: `apps/mobile/src/state/inboxSelectors.ts`
- Test: `apps/mobile/src/state/__tests__/sessionReducer.test.ts`
- Test: `apps/mobile/src/state/__tests__/inboxSelectors.test.ts`
- Test: `apps/mobile/src/state/__tests__/terminalBuffer.test.ts`

- [ ] **Step 1: Write reducer tests for every supported lifecycle event**

Required assertions:

```ts
expect(reduce(initialState, sessionListLoaded([running]))).toMatchObject({ sessions: { sess_1: running } });
expect(reduce(withRunning, sessionEnded("sess_1", 1, endedAt)).sessions.sess_1).toMatchObject({
  status: "stopped",
  exitCode: 1,
  lastActivityAt: endedAt,
});
expect(reduce(withRunning, sessionRemoved("sess_1"))).not.toHaveSession("sess_1");
```

Cover created, updated, terminal output, replay, snapshot, live, active interaction, ended, removed, and later authoritative list replacement.

- [ ] **Step 2: Write selector tests for attention priority and deterministic dismissal**

Define ordering as `waiting` → `error` → `stopped`, then descending `lastActivityAt`. Define dismissal key exactly as `sessionId:status:lastActivityAt[:exitCode]`. Define activity as newest first and retain the latest 20 lifecycle items.

- [ ] **Step 3: Write terminal-buffer bounds tests**

Append chunks by increasing `seq`, ignore duplicates/older seq, and retain the last 200,000 UTF-16 code units per session. A snapshot replaces the buffer and `lastSeq`.

- [ ] **Step 4: Run state tests and verify red**

Run: `npm run test:mobile -- sessionReducer.test.ts inboxSelectors.test.ts terminalBuffer.test.ts`

Expected: FAIL because state modules do not exist.

- [ ] **Step 5: Implement pure functions only**

Do not import React, Expo, WebSocket, or SecureStore. Export `sessionReducer`, action creators, `selectAttentionCards`, `selectRecentActivity`, `selectSessions(filter)`, `makeDismissalKey`, and bounded terminal helpers.

- [ ] **Step 6: Verify state green and type-safe**

Run:

```bash
npm run test:mobile -- sessionReducer.test.ts inboxSelectors.test.ts terminalBuffer.test.ts
npm run typecheck:mobile
```

Expected: PASS.

- [ ] **Step 7: Stop without committing**

Report changed files and test output to the orchestrator.

---

### Task 4: Build the approved dark UI kit (Wave 1, lane C)

**Files:**
- Create: `apps/mobile/src/ui/theme.ts`
- Create: `apps/mobile/src/ui/components/AppScreen.tsx`
- Create: `apps/mobile/src/ui/components/AppButton.tsx`
- Create: `apps/mobile/src/ui/components/ConnectionBanner.tsx`
- Create: `apps/mobile/src/ui/components/StatusBadge.tsx`
- Create: `apps/mobile/src/ui/components/EmptyState.tsx`
- Test: `apps/mobile/src/ui/components/__tests__/AppButton.test.tsx`
- Test: `apps/mobile/src/ui/components/__tests__/ConnectionBanner.test.tsx`

- [ ] **Step 1: Write failing accessibility and state tests**

```tsx
test("primary button exposes disabled state and keeps a 44pt target", () => {
  render(<AppButton label="Разрешить" disabled onPress={jest.fn()} />);
  const button = screen.getByRole("button", { name: "Разрешить" });
  expect(button).toBeDisabled();
  expect(button).toHaveStyle({ minHeight: 44 });
});
```

Test reconnecting/offline banner copy and non-color status labels.

- [ ] **Step 2: Run UI tests and verify red**

Run: `npm run test:mobile -- AppButton.test.tsx ConnectionBanner.test.tsx`

Expected: FAIL because UI components are missing.

- [ ] **Step 3: Implement tokens from the approved reference**

Use near-black navy background, lighter surfaces, amber attention surface/border, mint primary, slate secondary, blue activity accent, 24–28 radius cards, and no color-only status communication. Keep styles in `theme.ts`; do not introduce a UI framework.

- [ ] **Step 4: Implement focused primitives**

Each component accepts plain props and has no app-state dependency. `AppButton` provides primary/secondary/destructive variants and loading/disabled state.

- [ ] **Step 5: Verify UI green**

Run:

```bash
npm run test:mobile -- AppButton.test.tsx ConnectionBanner.test.tsx
npm run typecheck:mobile
```

Expected: PASS.

- [ ] **Step 6: Stop without committing**

Report changed files and test output to the orchestrator.

---

### Task 5: Integrate and commit Wave 1 foundations (sequential checkpoint)

**Files:**
- Review: all Task 2–4 files
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Review lane boundaries and remove accidental cross-lane edits**

Run: `git status --short` and `git diff -- apps/mobile/src`

Expected: only protocol, state, and UI-kit paths from Wave 1.

- [ ] **Step 2: Run the complete repository gate**

```bash
npm test
npm run typecheck
npm audit
```

Expected: all core and mobile tests PASS, both typechecks PASS, audit reports 0 vulnerabilities.

- [ ] **Step 3: Update project truth documents**

Append the Wave 1 result to `docs/PROGRESS.md`; update `docs/FINAL_IMPLEMENTATION.md` to mark only verified foundations as implemented. Keep screens under “not implemented.”

- [ ] **Step 4: Commit and push Wave 1**

```bash
git add apps/mobile/src/protocol apps/mobile/src/state apps/mobile/src/ui docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md
git commit -m "feat(mobile): add protocol state and UI foundations"
git push origin main
```

---

### Task 6: Implement pairing persistence and QR/manual pairing UI (Wave 2, lane A)

**Files:**
- Create: `apps/mobile/src/pairing/pairingProfile.ts`
- Create: `apps/mobile/src/pairing/pairingRepository.ts`
- Create: `apps/mobile/src/pairing/deviceIdentity.ts`
- Create: `apps/mobile/src/pairing/__tests__/pairingProfile.test.ts`
- Create: `apps/mobile/src/pairing/__tests__/pairingRepository.test.ts`
- Create: `apps/mobile/src/features/pairing/PairingScreen.tsx`
- Create: `apps/mobile/src/features/pairing/ManualPairingForm.tsx`
- Test: `apps/mobile/src/features/pairing/__tests__/PairingScreen.test.tsx`
- Create: `apps/mobile/src/app/pairing.tsx`

- [ ] **Step 1: Write failing QR/manual normalization tests**

Assert QR uses `QrPayloadSchema`; manual input requires exact `relayWsUrl`, `desktopId`, and `pairingCode`; reject HTTP URLs and WebSocket URLs without `/v1/ws/mobile`.

- [ ] **Step 2: Write failing SecureStore repository tests**

Inject `{ getItemAsync, setItemAsync, deleteItemAsync }`. Round-trip the active profile containing relay URL, desktop id/name, mobile device id, token, and expiry. Verify replacement and clear.

- [ ] **Step 3: Write failing screen tests**

Cover camera permission denied, scanner success, manual validation, loading, `PAIRING_EXPIRED`, `PAIRING_NOT_FOUND`, `DESKTOP_OFFLINE`, and successful save callback.

- [ ] **Step 4: Run pairing tests and verify red**

Run: `npm run test:mobile -- pairingProfile.test.ts pairingRepository.test.ts PairingScreen.test.tsx`

Expected: FAIL because pairing modules are missing.

- [ ] **Step 5: Implement minimal persistence and feature UI**

Use `expo-crypto.randomUUID()` for a stable stored device id and `expo-camera` `CameraView` for QR. Keep networking injected as `pair(params)`; the screen does not construct WebSocket envelopes.

- [ ] **Step 6: Verify pairing green**

Run the pairing tests and `npm run typecheck:mobile`.

Expected: PASS.

- [ ] **Step 7: Stop without committing**

Report to the orchestrator.

---

### Task 7: Implement the Action Inbox feature (Wave 2, lane B)

**Files:**
- Create: `apps/mobile/src/features/inbox/InboxScreen.tsx`
- Create: `apps/mobile/src/features/inbox/AttentionCard.tsx`
- Create: `apps/mobile/src/features/inbox/ActivityRow.tsx`
- Test: `apps/mobile/src/features/inbox/__tests__/InboxScreen.test.tsx`
- Test: `apps/mobile/src/features/inbox/__tests__/AttentionCard.test.tsx`
- Create: `apps/mobile/src/app/(tabs)/inbox.tsx`

- [ ] **Step 1: Write failing screen hierarchy tests**

Render selector output and assert title/count, waiting/error/stopped cards before activity, reference-compatible dark card labels, and empty/reconnecting/stale states.

- [ ] **Step 2: Write failing action tests**

Waiting calls `openSession`; error/stopped calls `viewSession`; visible `Скрыть` dismisses only that exact card key. Baseline cards must not show `Разрешить` or `Отклонить`.

- [ ] **Step 3: Run Inbox tests and verify red**

Run: `npm run test:mobile -- InboxScreen.test.tsx AttentionCard.test.tsx`

Expected: FAIL because Inbox components are missing.

- [ ] **Step 4: Implement the minimum approved UI**

Use the shared selectors and UI primitives. Keep route file to a single feature render. Do not parse terminal text or invent semantic activity.

- [ ] **Step 5: Verify Inbox green and accessible**

Run Inbox tests and `npm run typecheck:mobile`.

- [ ] **Step 6: Stop without committing**

Report to the orchestrator.

---

### Task 8: Implement Sessions list and filters (Wave 2, lane C)

**Files:**
- Create: `apps/mobile/src/features/sessions/SessionsScreen.tsx`
- Create: `apps/mobile/src/features/sessions/SessionRow.tsx`
- Create: `apps/mobile/src/features/sessions/SessionFilter.tsx`
- Test: `apps/mobile/src/features/sessions/__tests__/SessionsScreen.test.tsx`
- Create: `apps/mobile/src/app/(tabs)/sessions.tsx`

- [ ] **Step 1: Write failing filter/navigation tests**

Assert active means `starting/running/waiting`, completed means `stopped/error`, project label is `cwd` basename, newest activity sorts first, and row press opens `/session/<id>`.

- [ ] **Step 2: Write failing empty-state tests**

Cover connected/no sessions, reconnecting, offline, and initial list loading.

- [ ] **Step 3: Run Sessions tests and verify red**

Run: `npm run test:mobile -- SessionsScreen.test.tsx`

Expected: FAIL because Sessions components are missing.

- [ ] **Step 4: Implement the list with local filters**

Use `FlatList`, stable session ids, accessible status text, and the approved dark row style.

- [ ] **Step 5: Verify Sessions green**

Run Sessions tests and `npm run typecheck:mobile`.

- [ ] **Step 6: Stop without committing**

Report to the orchestrator.

---

### Task 9: Compose routes/providers and commit Wave 2 (sequential checkpoint)

**Files:**
- Create: `apps/mobile/src/application/AppProvider.tsx`
- Create: `apps/mobile/src/application/useApp.ts`
- Modify: `apps/mobile/src/app/_layout.tsx`
- Modify: `apps/mobile/src/app/index.tsx`
- Create: `apps/mobile/src/app/(tabs)/_layout.tsx`
- Test: `apps/mobile/src/application/__tests__/AppProvider.test.tsx`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Write failing bootstrap-routing tests**

No stored profile redirects to `/pairing`; a restored profile renders the tab shell in a reconnecting state. Task 12 owns the network-dependent `DESKTOP_OFFLINE` recovery transition.

- [ ] **Step 2: Run provider tests and verify red**

Run: `npm run test:mobile -- AppProvider.test.tsx`

Expected: FAIL because `AppProvider` and typed context do not exist.

- [ ] **Step 3: Implement the provider boundary**

Provide state, dispatch, protocol client, profile repository, navigation actions, and feature callbacks. Do not put feature rendering logic in the provider.

- [ ] **Step 4: Configure four tabs**

Labels: `Входящие`, `Сессии`, `Новая`, `Настройки`. Use text/symbol icons available without another icon dependency. Preserve at least 44pt hit targets.

- [ ] **Step 5: Run all Wave 2 and provider tests**

Run: `npm test && npm run typecheck && npm audit`

Expected: PASS and 0 vulnerabilities.

- [ ] **Step 6: Update documents, commit, and push**

```bash
git add apps/mobile/src docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md
git commit -m "feat(mobile): add pairing inbox and sessions"
git push origin main
```

---

### Task 10: Implement live Session detail, terminal, composer, and interrupt (Wave 3, lane A)

**Files:**
- Create: `apps/mobile/src/features/session/SessionScreen.tsx`
- Create: `apps/mobile/src/features/session/PlainTerminal.tsx`
- Create: `apps/mobile/src/features/session/SessionComposer.tsx`
- Create: `apps/mobile/src/features/session/InterruptButton.tsx`
- Test: `apps/mobile/src/features/session/__tests__/SessionScreen.test.tsx`
- Test: `apps/mobile/src/features/session/__tests__/SessionComposer.test.tsx`
- Create: `apps/mobile/src/app/session/[id].tsx`

- [ ] **Step 1: Write failing subscribe-mode tests**

Cover `live`, ordered `replay`, `snapshot`, subsequent output, `session.ended`, and `session.removed` unavailable state.

- [ ] **Step 2: Write failing non-idempotent input tests**

Submit sends exactly one `{ inputMode: "text", data: draft + "\n" }`; the explicit newline is required by the implemented desktop baseline, which currently writes `data` unchanged. Clear only after `ok`; retain draft on error; disable while pending/offline/stopped; never auto-retry.

- [ ] **Step 3: Write failing terminal/interrupt tests**

Render plain monospaced text with minimal non-printing control filtering; no ANSI colors/TUI. Interrupt sends once and disables while pending.

- [ ] **Step 4: Run Session tests and verify red**

Run: `npm run test:mobile -- SessionScreen.test.tsx SessionComposer.test.tsx`

Expected: FAIL because feature files are missing.

- [ ] **Step 5: Implement the smallest feature components**

Keep terminal rendering presentation-only and all protocol calls injected. Scroll to end only when the user is already near the end; do not force-scroll someone reading older output.

- [ ] **Step 6: Verify Session green**

Run Session tests and `npm run typecheck:mobile`.

- [ ] **Step 7: Stop without committing**

Report to the orchestrator.

---

### Task 11: Implement New action and Settings (Wave 3, lane B)

**Files:**
- Create: `apps/mobile/src/features/new/NewScreen.tsx`
- Test: `apps/mobile/src/features/new/__tests__/NewScreen.test.tsx`
- Create: `apps/mobile/src/features/settings/SettingsScreen.tsx`
- Test: `apps/mobile/src/features/settings/__tests__/SettingsScreen.test.tsx`
- Create: `apps/mobile/src/app/(tabs)/new.tsx`
- Create: `apps/mobile/src/app/(tabs)/settings.tsx`

- [ ] **Step 1: Write failing New tests**

`Подключить компьютер` opens replacement confirmation then pairing. `Запустить сессию` is visible as planned, disabled, and explains the missing contract.

- [ ] **Step 2: Write failing Settings tests**

Show desktop/mobile identity, connection status, protocol/app version, retry/re-pair, replace active computer, and the hackathon security note. Re-pair clears only after explicit confirmation.

- [ ] **Step 3: Run tests and verify red**

Run: `npm run test:mobile -- NewScreen.test.tsx SettingsScreen.test.tsx`

Expected: FAIL because screens are missing.

- [ ] **Step 4: Implement the two screens with shared primitives**

Do not add multi-computer lists, push settings, or production key management.

- [ ] **Step 5: Verify green and stop without committing**

Run the feature tests and `npm run typecheck:mobile`; report to orchestrator.

---

### Task 12: Implement connection/reconnect coordination (Wave 3, lane C)

**Files:**
- Create: `apps/mobile/src/application/connectionCoordinator.ts`
- Test: `apps/mobile/src/application/__tests__/connectionCoordinator.test.ts`
- Create: `apps/mobile/src/features/pairing/ConnectionRecoveryScreen.tsx`
- Test: `apps/mobile/src/features/pairing/__tests__/ConnectionRecoveryScreen.test.tsx`

- [ ] **Step 1: Write failing connection-state tests with fake timers**

Required sequence: connect → `mobile.resume` → `session.list` → open-session `session.subscribe(afterSeq)`. Replace, never union, negotiated capabilities when runtime fields become available.

- [ ] **Step 2: Write failure-transition tests**

Transient close keeps cached state and disables mutation. `DESKTOP_OFFLINE` and `DAEMON_UNAVAILABLE` enter recovery and retain the active profile. `UNAUTHORIZED`, `PAIRING_EXPIRED`, `PAIRING_NOT_FOUND`, and `MOBILE_NOT_PAIRED` clear the unusable token and return to pairing.

- [ ] **Step 3: Write no-duplicate tests**

Reconnect may retry only `mobile.resume`, `session.list`, and `session.subscribe`. It must not retry `session.input`, `session.interrupt`, or `interaction.respond`.

- [ ] **Step 4: Run coordinator tests and verify red**

Run: `npm run test:mobile -- connectionCoordinator.test.ts`

Expected: FAIL because coordinator is missing.

- [ ] **Step 5: Implement a small explicit state machine**

States: `idle`, `connecting`, `online`, `reconnecting`, `resyncing`, `recovery`, `pairingRequired`. Inject timers and client operations; cap reconnect delay for demo use and cancel timers on dispose.

- [ ] **Step 6: Write failing recovery-screen tests**

Assert the screen explains desktop/daemon offline state, `Retry` calls `coordinator.retry()` without clearing the profile, and `Pair another computer` navigates to replacement pairing.

- [ ] **Step 7: Implement the recovery screen as an injected component**

Accept `onRetry` and `onPairAnotherComputer` callbacks as props. Keep the screen read-only except for those two explicit actions. Do not import `AppProvider`, `useApp`, or Router in this parallel lane; Task 13 owns route/provider wiring. Do not render cached sessions as live while in recovery.

- [ ] **Step 8: Verify coordinator/recovery green and stop without committing**

Run `npm run test:mobile -- connectionCoordinator.test.ts ConnectionRecoveryScreen.test.tsx` and `npm run typecheck:mobile`; report to orchestrator.

---

### Task 13: Add the reserved structured-action zone and integrate Wave 3

**Files:**
- Create: `apps/mobile/src/features/session/StructuredActionZone.tsx`
- Test: `apps/mobile/src/features/session/__tests__/StructuredActionZone.test.tsx`
- Modify: `apps/mobile/src/features/session/SessionScreen.tsx`
- Modify: `apps/mobile/src/features/inbox/AttentionCard.tsx`
- Modify: `apps/mobile/src/application/AppProvider.tsx`
- Modify: `apps/mobile/src/application/useApp.ts`
- Create: `apps/mobile/src/app/recovery.tsx`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Write failing capability-gate tests**

Without negotiated `interaction.structured`, render only `Открыть сессию`. With the capability and a current approval interaction, render `Отклонить` and `Разрешить` using option intents rather than hard-coded option ids.

- [ ] **Step 2: Write pending/resolution/failure tests**

One press sends one `interaction.respond`; both actions disable while pending; lost response does not resend; resubscribe/`activeInteraction` decides whether it remains unresolved; resolved removes the card.

- [ ] **Step 3: Run and verify red**

Run: `npm run test:mobile -- StructuredActionZone.test.tsx`

Expected: FAIL because action zone is missing.

- [ ] **Step 4: Implement the component with runtime-safe fallback**

The current runtime does not yet negotiate capabilities end to end. Keep live structured controls hidden until the coordinator receives the actual negotiated field. The visual test fixture proves the reserved two-button layout without enabling it in production baseline.

- [ ] **Step 5: Wire recovery through the sequential application boundary**

Expose coordinator `retry` and replacement-pairing actions through `AppProvider`/`useApp`. Create `src/app/recovery.tsx` as a thin route that passes those callbacks to `ConnectionRecoveryScreen`. Add a provider integration test proving `DESKTOP_OFFLINE` and `DAEMON_UNAVAILABLE` navigate to `/recovery`, `Retry` preserves the profile, and `Pair another computer` opens replacement pairing.

- [ ] **Step 6: Integrate all Wave 3 lanes and run the full gate**

```bash
npm test
npm run typecheck
npm audit
```

Expected: all tests PASS and audit reports 0 vulnerabilities.

- [ ] **Step 7: Update documents, commit, and push Wave 3**

```bash
git add apps/mobile/src docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md
git commit -m "feat(mobile): add live session control and reconnect"
git push origin main
```

---

### Task 14: End-to-end smoke, real iPhone verification, and handoff (Wave 4)

**Files:**
- Create: `apps/mobile/src/application/createMobileRuntime.ts`
- Create: `apps/mobile/src/application/__tests__/mobileFlow.test.tsx`
- Modify: `apps/mobile/src/application/AppProvider.tsx`
- Modify: `apps/mobile/src/application/useApp.ts`
- Modify: `README.md`
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Write the failing integrated mobile-flow test**

Import `createMobileRuntime` and drive fake socket messages through it and AppProvider: pair → list → Inbox → open → subscribe snapshot/live → terminal output → text input response → interrupt → ended → reconnect resume/list/subscribe. Assert no duplicate mutating request.

- [ ] **Step 2: Run integrated test and verify red before wiring missing seams**

Run: `npm run test:mobile -- mobileFlow.test.tsx`

Expected: FAIL because `createMobileRuntime.ts` does not exist.

- [ ] **Step 3: Implement the explicit production runtime composition**

Implement `createMobileRuntime({ client, profileRepository, dispatch, navigation, timers })` with `start`, `pair`, `openSession`, `sendInput`, `interrupt`, and `dispose`. It owns event-to-reducer dispatch and delegates reconnect state to `connectionCoordinator`. Modify `AppProvider` to create one runtime instance, expose these operations through `useApp`, and dispose it on unmount. Do not add new product behavior.

- [ ] **Step 4: Run the integrated test and verify green**

Run: `npm run test:mobile -- mobileFlow.test.tsx`

Expected: PASS through the complete fake-socket flow with no duplicate mutation.

- [ ] **Step 5: Run automated release gate**

```bash
npm ci
npm test
npm run typecheck
npm audit
npm run mobile:doctor
```

Expected: all tests/typechecks PASS, 0 vulnerabilities, no blocking Expo doctor issue.

- [ ] **Step 6: Run relay and fake desktop**

Terminal 1:

```bash
export MAC_LAN_IP="$(ipconfig getifaddr en0)"
RELAY_MOBILE_URL="ws://${MAC_LAN_IP}:8787/v1/ws/mobile" npm run relay
```

Expected: relay listens on `0.0.0.0:8787`, while generated QR payloads contain the Mac LAN address rather than `localhost`. If the phone is not on the same LAN, set `RELAY_MOBILE_URL` to the verified public `wss://.../v1/ws/mobile` endpoint before starting relay.

Terminal 2:

```bash
npm run fake:desktop -w @cucoudle/relay
```

Record the pairing QR payload/code and a LAN- or tunnel-reachable mobile relay URL.

- [ ] **Step 7: Run the existing cross-language integration harness**

With relay still running, execute:

```bash
npm run test:integration
```

Expected: all seven desktop daemon → relay → technical mobile stages PASS before involving Expo Go. This isolates backend/desktop contract failures from mobile UI failures.

- [ ] **Step 8: Start Expo Go and perform the physical iPhone smoke**

```bash
npm run mobile
```

If LAN discovery fails:

```bash
npm run mobile:tunnel
```

Verify QR/manual pairing, Inbox/Sessions, live terminal, input, interrupt, session end, offline banner, reconnect, and recovery pairing. Capture only non-sensitive screenshots suitable for the hackathon presentation.

- [ ] **Step 9: Update README and required truth documents**

Document exact start commands and only verified device results. Append `docs/PROGRESS.md`; update `docs/FINAL_IMPLEMENTATION.md` to separate implemented, limitations, and deferred rich terminal/launch/multi-desktop work.

- [ ] **Step 10: Final verification after documentation changes**

Run:

```bash
git diff --check
npm test
npm run typecheck
npm audit
git status --short --branch
```

Expected: clean diff check, green tests/typechecks, 0 vulnerabilities, and only intended tracked files plus known untracked user files.

- [ ] **Step 11: Commit and push the verified MVP**

```bash
git add apps/mobile README.md docs/PROGRESS.md docs/FINAL_IMPLEMENTATION.md package.json package-lock.json
git commit -m "feat(mobile): complete Action Inbox MVP"
git push origin main
```

If rejected, follow the exact rebase procedure in `AGENTS.md`, rerun Step 10, and push normally without force.

## Execution handoff

Recommended execution is parallel subagent-driven development:

1. The orchestrator executes Task 1.
2. Dispatch Tasks 2–4 concurrently, review each result, then execute Task 5.
3. Dispatch Tasks 6–8 concurrently, review each result, then execute Task 9.
4. Dispatch Tasks 10–12 concurrently, review each result, then execute Task 13.
5. Execute Task 14 sequentially with the user available for the physical iPhone step.

At every wave boundary, require fresh test output before claiming success or committing.
