# Session keyboard avoidance design

## Goal

Keep the open-session controls usable when the system keyboard appears. The session
header remains visible, the terminal gives up vertical space, and the composer sits
immediately above the keyboard instead of being covered by it.

## Scope

- Apply keyboard avoidance only to the open session screen.
- Preserve the current header, terminal, structured action area, interrupt control,
  and composer hierarchy.
- Preserve current command submission, terminal rendering, and follow-output
  behavior.
- Support iOS and Android with platform-appropriate system behavior.

Other application screens, custom keyboard animations, interactive keyboard
dismissal, and changes to terminal semantics are out of scope.

## Design

`SessionScreen` will place its existing `AppScreen` content inside a full-height
React Native `KeyboardAvoidingView`. On iOS the container will use padding-based
avoidance so the bottom controls move above the keyboard. On Android the app will
declare resize behavior for the software keyboard, allowing the operating system
to reduce the available window height without adding a duplicate manual offset.

The existing flex layout already assigns remaining height to `PlainTerminal` or
`StyledTerminal`. When the available height decreases, the terminal therefore
shrinks while the header and controls retain their natural height. When the
keyboard closes, the full height is restored.

The unavailable-session state does not contain an input and does not need keyboard
avoidance behavior beyond remaining safe inside the same reusable screen wrapper.

## Platform behavior

- iOS: use `KeyboardAvoidingView` with `behavior="padding"`.
- Android: rely on window resize and configure Expo's Android software keyboard
  layout mode as `resize`; do not add a second padding offset.
- Other platforms: retain the normal full-height layout.
- No hard-coded keyboard height or device-specific offset will be introduced.

## Testing and verification

- Add a focused component test proving that the available session path renders
  inside the keyboard-aware container with the expected platform behavior.
- Keep the existing session-screen tests passing, including terminal, controls,
  stopped-session, and unavailable-session cases.
- Run the focused mobile test suite and mobile TypeScript typecheck.
- Run Expo configuration validation if it is available in the existing toolchain.

Automated React Native tests cannot prove the physical keyboard animation or exact
device inset. A physical iPhone/Expo smoke check remains the final visual validation:
focus the composer, confirm it stays above the keyboard, confirm the header remains
visible and the terminal shrinks, then dismiss the keyboard and confirm the original
layout returns.

## Documentation

Because this changes a visible user scenario, the implementation increment will
append the verified result to `docs/PROGRESS.md` and update
`docs/FINAL_IMPLEMENTATION.md`, clearly separating automated verification from any
device behavior that has not been physically confirmed.
