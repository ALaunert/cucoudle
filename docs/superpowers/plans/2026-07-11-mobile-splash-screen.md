# Mobile Splash Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved variant C splash experience to the Expo mobile app using the user-supplied Cucoudle artwork.

**Architecture:** Expo's built-in native splash configuration will display a repository-local PNG on `#07111E` before JavaScript is ready. The existing index route will immediately continue with a focused React Native `SplashScreen` component that uses the same artwork, separate wordmark/tagline text, and a progress indicator until `AppProvider` completes bootstrap routing.

**Tech Stack:** Expo 54, Expo Router, React Native 0.81, TypeScript, Jest, Testing Library React Native.

---

## File map

- Create `apps/mobile/assets/splash-icon.png`: repository-local copy of the supplied source artwork for native and React builds.
- Create `apps/mobile/src/ui/SplashScreen.tsx`: approved variant C composition and responsive styles.
- Create `apps/mobile/src/ui/__tests__/SplashScreen.test.tsx`: component behavior and accessibility contract.
- Modify `apps/mobile/src/app/index.tsx`: delegate the loading UI to `SplashScreen`.
- Modify `apps/mobile/app.json`: configure Expo's native splash with the dark background and local image.
- Modify `docs/PROGRESS.md`: append the completed increment and verification evidence.
- Modify `docs/FINAL_IMPLEMENTATION.md`: record the verified launch experience and remaining device-smoke limitation.

### Task 1: Splash asset and React composition

**Files:**
- Create: `apps/mobile/assets/splash-icon.png`
- Create: `apps/mobile/src/ui/__tests__/SplashScreen.test.tsx`
- Create: `apps/mobile/src/ui/SplashScreen.tsx`
- Modify: `apps/mobile/src/app/index.tsx`

- [ ] **Step 1: Copy the approved source artwork into the repository**

Copy `/Users/launert/Documents/image.png` to `apps/mobile/assets/splash-icon.png` without modifying the source file. Confirm the copied asset is a valid 1254×1254 square PNG.

- [ ] **Step 2: Write the failing component test**

```tsx
import { render, screen } from "@testing-library/react-native";
import { SplashScreen } from "../SplashScreen";

test("renders the approved Cucoudle launch composition", () => {
  render(<SplashScreen />);
  expect(screen.getByTestId("splash-artwork")).toBeOnTheScreen();
  expect(screen.getByRole("header", { name: "Cucoudle" })).toBeOnTheScreen();
  expect(screen.getByText("AI CODING AGENTS · ONE CHAT")).toBeOnTheScreen();
  expect(screen.getByRole("progressbar", { name: "Загрузка приложения" })).toBeOnTheScreen();
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `npm test -- --runTestsByPath src/ui/__tests__/SplashScreen.test.tsx` from `apps/mobile`.

Expected: FAIL because `../SplashScreen` does not exist.

- [ ] **Step 4: Implement the minimal component**

Create a full-height `View` with `colors.background`, a decorative `Image` loaded from `../../assets/splash-icon.png` and tagged `testID="splash-artwork"`, a `Text` header named `Cucoudle`, the exact approved tagline, and an `ActivityIndicator` with `accessibilityRole="progressbar"` and `accessibilityLabel="Загрузка приложения"`. Bound the artwork width with fixed min/max-friendly dimensions and `resizeMode="contain"`; do not add animation or timers.

- [ ] **Step 5: Replace the index route markup**

Make `apps/mobile/src/app/index.tsx` return `<SplashScreen />` and remove its duplicated inline styles/imports.

- [ ] **Step 6: Run the focused test and verify GREEN**

Run: `npm test -- --runTestsByPath src/ui/__tests__/SplashScreen.test.tsx` from `apps/mobile`.

Expected: 1 test passed.

### Task 2: Native Expo splash configuration

**Files:**
- Modify: `apps/mobile/app.json`

- [ ] **Step 1: Configure the native splash**

Add Expo's built-in top-level splash configuration to `apps/mobile/app.json` with:

```json
"splash": {
  "backgroundColor": "#07111E",
  "image": "./assets/splash-icon.png",
  "resizeMode": "contain"
}
```

Do not change orientation, application routing, platform identifiers, or camera configuration.

- [ ] **Step 2: Validate resolved Expo configuration**

Run: `npx expo config --type public --json` from `apps/mobile` and inspect the resolved native splash settings and asset path.

Expected: exit 0 with `#07111E`, `contain`, and `./assets/splash-icon.png` in the resolved `splash` configuration.

### Task 3: Full verification and project documentation

**Files:**
- Modify: `docs/PROGRESS.md`
- Modify: `docs/FINAL_IMPLEMENTATION.md`

- [ ] **Step 1: Run the complete mobile checks**

Run from `apps/mobile`:

```bash
npm test -- --runInBand
npm run typecheck
npx expo config --type public --json
```

Expected: all Jest suites pass, TypeScript exits 0, Expo configuration exits 0.

- [ ] **Step 2: Inspect the actual asset and diff**

Confirm `apps/mobile/assets/splash-icon.png` is 1254×1254, review the focused Git diff, and run `git diff --check`.

- [ ] **Step 3: Update required project documents**

Append a dated splash-screen increment to `docs/PROGRESS.md`. Update `docs/FINAL_IMPLEMENTATION.md` so it separates the implemented native/React launch experience from the remaining physical-device startup smoke test.

- [ ] **Step 4: Re-run checks after documentation**

Repeat the complete mobile test, typecheck, Expo config, and `git diff --check` commands so completion claims use fresh evidence.

- [ ] **Step 5: Commit only the splash increment**

Stage the new asset/component/test, `index.tsx`, `app.json`, plan, spec adjustment, and required documentation. Do not stage or modify the pre-existing changes to `apps/mobile/package.json` or `package-lock.json`.

Commit message: `feat(mobile): add branded splash screen`.

- [ ] **Step 6: Integrate and push main**

Push normally to `origin/main`. If rejected, follow the repository-required `git pull --rebase origin main`, resolve compatible changes, rerun verification, and push without force.
