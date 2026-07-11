# Session Keyboard Avoidance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the open-session composer above the system keyboard while preserving the visible header and shrinking the terminal into the remaining height.

**Architecture:** Add one screen-local `KeyboardAvoidingView` boundary around `SessionScreen` and select padding avoidance only on iOS. Let Android resize the app window through Expo configuration so it does not receive a duplicate keyboard offset; the existing flex terminal consumes the reduced height automatically.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript, Jest, React Native Testing Library.

---

## File map

- Modify `apps/mobile/src/features/session/SessionScreen.tsx`: own the session-specific keyboard-aware boundary and platform behavior selection.
- Modify `apps/mobile/src/features/session/__tests__/SessionScreen.test.tsx`: regression coverage for the boundary and platform mapping.
- Modify `apps/mobile/src/features/session/PlainTerminal.tsx`: allow the fallback terminal to shrink into keyboard-reduced space.
- Modify `apps/mobile/src/features/session/StyledTerminal.tsx`: allow the styled terminal to shrink into keyboard-reduced space.
- Modify `apps/mobile/src/features/session/__tests__/StyledTerminal.test.tsx`: cover styled-terminal shrinkability.
- Modify `apps/mobile/app.json`: declare Android software keyboard window resize behavior.
- Modify `docs/PROGRESS.md`: append the verified user-visible increment.
- Modify `docs/FINAL_IMPLEMENTATION.md`: update the current mobile session behavior and its physical-device limitation.

### Task 1: Add the keyboard-aware session boundary

**Files:**
- Modify: `apps/mobile/src/features/session/__tests__/SessionScreen.test.tsx`
- Modify: `apps/mobile/src/features/session/__tests__/StyledTerminal.test.tsx`
- Modify: `apps/mobile/src/features/session/SessionScreen.tsx`
- Modify: `apps/mobile/src/features/session/PlainTerminal.tsx`
- Modify: `apps/mobile/src/features/session/StyledTerminal.tsx`

- [ ] **Step 1: Write the failing regression tests**

Add an import for `sessionKeyboardBehavior` and add focused tests:

```tsx
test.each([
  ["ios", "padding"],
  ["android", undefined],
  ["web", undefined],
] as const)("uses %s keyboard avoidance behavior", (platform, expected) => {
  expect(sessionKeyboardBehavior(platform)).toBe(expected);
});

test("wraps the open session in a keyboard-aware frame", () => {
  renderScreen(subscribed({ session: session(), mode: "live" }));

  const frame = screen.getByTestId("session-keyboard-frame");
  expect(frame).toBeVisible();
  expect(frame).toContainElement(screen.getByLabelText("Команда"));
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -w @cucoudle/mobile -- --runTestsByPath src/features/session/__tests__/SessionScreen.test.tsx
```

Expected: FAIL because `sessionKeyboardBehavior` and `session-keyboard-frame` do not exist.

- [ ] **Step 3: Implement the minimal screen-local behavior**

In `SessionScreen.tsx`, import `KeyboardAvoidingView`, `Platform`, and `type PlatformOSType`. Add the pure mapping:

```tsx
export function sessionKeyboardBehavior(
  platform: PlatformOSType,
): "padding" | undefined {
  return platform === "ios" ? "padding" : undefined;
}
```

Add a small internal frame component and use it around both the available and unavailable `AppScreen` returns:

```tsx
function SessionKeyboardFrame({ children }: { children: ReactNode }) {
  return (
    <KeyboardAvoidingView
      behavior={sessionKeyboardBehavior(Platform.OS)}
      style={styles.keyboardFrame}
      testID="session-keyboard-frame"
    >
      {children}
    </KeyboardAvoidingView>
  );
}
```

Add the full-height style:

```tsx
keyboardFrame: { flex: 1 },
```

Do not add a hard-coded keyboard height or vertical offset. Preserve the existing `AppScreen`, terminal, action-area, and controls layout unchanged inside the frame.

Add failing style assertions for both terminal implementations requiring
`minHeight: 0`, then replace their fixed `minHeight: 180`. This preserves flex growth
but allows the terminal to yield all necessary vertical space on smaller devices.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same focused Jest command.

Expected: the complete `SessionScreen.test.tsx` suite passes.

- [ ] **Step 5: Refactor only if needed and rerun the focused test**

Keep the frame private and the platform mapping pure/exported for deterministic testing. Avoid unrelated screen restructuring.

### Task 2: Configure Android window resize

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Confirm the current Expo config lacks the setting**

Run:

```bash
node -e 'const c=require("./apps/mobile/app.json"); if (c.expo.android.softwareKeyboardLayoutMode !== undefined) process.exit(1)'
```

Expected: exit 0, proving the resize setting is currently absent.

- [ ] **Step 2: Add the Expo Android setting**

Add this property under `expo.android` without changing the existing edge-to-edge or back-gesture settings:

```json
"softwareKeyboardLayoutMode": "resize"
```

- [ ] **Step 3: Verify the setting is present**

Run:

```bash
node -e 'const c=require("./apps/mobile/app.json"); if (c.expo.android.softwareKeyboardLayoutMode !== "resize") process.exit(1)'
```

Expected: exit 0.

- [ ] **Step 4: Validate Expo configuration**

Run:

```bash
npm run mobile:doctor
```

Expected: all Expo Doctor checks pass. If the command reports a network-only failure, record the exact limitation and still run `npx expo config --type public` from `apps/mobile` to validate local config parsing.

### Task 3: Verify the mobile increment and document it

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Run the full relevant automated checks**

Run:

```bash
npm run test:mobile
npm run typecheck:mobile
git diff --check
```

Expected: all mobile Jest suites pass, TypeScript exits 0, and the diff check emits no errors.

- [ ] **Step 2: Append the progress journal entry**

Append a `2026-07-11` increment describing the keyboard obstruction, the session-local iOS avoidance, Android resize configuration, touched files, exact check counts/results, and the remaining physical-device visual smoke check.

- [ ] **Step 3: Update the implementation snapshot**

Update the mobile implementation/current-state sections to say that the session layout is keyboard-aware: the header stays visible, the terminal flexes smaller, and the controls rise above the keyboard. Do not claim physical iPhone or Android confirmation unless it was actually performed.

- [ ] **Step 4: Re-run final verification after documentation edits**

Run:

```bash
npm run test:mobile
npm run typecheck:mobile
npm run mobile:doctor
git diff --check
git status --short
```

Expected: tests, typecheck, Expo Doctor, and diff check pass. Review `git status`
against the pre-implementation snapshot; it may also list concurrent user-owned
changes, which must remain unstaged and untouched.

- [ ] **Step 5: Commit only the planned increment**

Stage these paths explicitly:

```bash
git add apps/mobile/src/features/session/SessionScreen.tsx \
  apps/mobile/src/features/session/__tests__/SessionScreen.test.tsx \
  apps/mobile/src/features/session/PlainTerminal.tsx \
  apps/mobile/src/features/session/StyledTerminal.tsx \
  apps/mobile/src/features/session/__tests__/StyledTerminal.test.tsx \
  apps/mobile/app.json \
  docs/PROGRESS.md \
  docs/FINAL_IMPLEMENTATION.md \
  docs/superpowers/plans/2026-07-11-session-keyboard-avoidance.md
git commit -m "fix(mobile): keep session controls above keyboard"
```

Do not stage the pre-existing `apps/mobile/package.json` or `package-lock.json` changes.

- [ ] **Step 6: Publish `main` safely**

Push `main` normally first, as required by the repository workflow. If the push is
rejected because remote `main` advanced, follow the repository recovery sequence:
`git pull --rebase origin main`, resolve conflicts preserving both sides, rerun the
final verification, and push normally. Because the working tree contains user-owned
dependency changes, do not auto-stash them. If Git refuses the required rebase
because of those dirty files, report that precise blocker rather than stashing,
discarding, or committing them without authorization.

### Task 4: Physical-device smoke check (when a device is available)

**Files:**
- Conditionally modify: `docs/PROGRESS.md`

- [ ] **Step 1: Exercise the original user scenario**

Open a live session on iPhone through Expo, focus `Введите команду`, and confirm the composer and send button remain immediately above the keyboard.

- [ ] **Step 2: Check layout restoration**

Confirm the header remains visible, the terminal shrinks while the keyboard is open, and dismissing the keyboard restores the previous terminal height.

- [ ] **Step 3: Record only observed evidence**

If this smoke is performed before the implementation commit, include the observed
result in that increment's new progress entry. Otherwise leave it explicitly listed
as pending and do not block the code-level increment.

If the smoke result is recorded after the implementation commit, append a new dated
follow-up entry to `docs/PROGRESS.md` (never edit the existing entry), rerun
`git diff --check`, commit the documentation-only follow-up, and push `main` normally.
