# Mobile Splash Screen Design

## Goal

Add a branded splash screen to the Expo mobile application using the artwork supplied by the user. The native and React phases share the dark background and source artwork, but they are not pixel-identical: the React phase adds separate wordmark, tagline, and progress elements while JavaScript initializes and disappears as soon as the application is ready to choose its initial route.

## Approved visual direction

The approved direction is variant C:

- dark Cucoudle background (`#07111E`);
- the supplied square artwork centered above the wordmark;
- a separate `Cucoudle` wordmark;
- the tagline `AI CODING AGENTS · ONE CHAT` below the wordmark;
- no artificial minimum display duration or animated transition.

The supplied source artwork is `/Users/launert/Documents/image.png`. Production assets derived from it will live under `apps/mobile/assets/` so builds do not depend on files outside the repository.

## Launch flow

The launch experience has two related but different phases:

1. Expo's native splash screen is shown before React Native is ready. It uses the dark background and displays the supplied repository-local PNG with `contain` sizing.
2. The existing index route renders a React Native loading screen on the same dark background while `AppProvider` restores pairing state and determines the destination route. It shows the same PNG plus separate approved `Cucoudle` wordmark, tagline, and progress indicator.

The implementation verifies the native configuration and React component contract, not the visual transition between them. A release build on physical iOS and Android devices is required to assess image scale, layout change, and any visible flash. Existing routing behavior remains unchanged.

## Components and files

- `apps/mobile/app.json` configures Expo's native splash settings and points to the repository-local splash asset without adding a runtime dependency.
- `apps/mobile/assets/` stores the copied or derived splash artwork used by native builds and the React Native loading screen.
- `apps/mobile/src/ui/SplashScreen.tsx` owns the reusable React composition: artwork, wordmark, tagline, loading indicator, and accessibility labels.
- `apps/mobile/src/app/index.tsx` delegates its loading presentation to `SplashScreen` and retains its current routing role.
- `docs/splash-preview.html` remains a design preview artifact recording the compared directions and approved variant.

## Sizing and responsive behavior

The React loading screen uses a centered vertical composition inside a full-height dark container. The artwork uses a bounded responsive width so it remains legible on compact phones without touching the safe-area edges and does not become oversized on tablets. The wordmark and tagline remain separate text elements below the artwork. The activity indicator appears beneath the branding with subdued spacing.

The native splash uses `contain` sizing and the same background color, but supports only the supplied PNG rather than the React phase's multi-element layout. Pixel-identical composition and scale across the two phases are not expected.

## Accessibility

The React artwork is decorative and hidden from the accessibility tree with `accessible={false}`. The separate `Cucoudle` header owns the brand announcement, the tagline remains readable text, and the loading indicator is exposed as a `progressbar` labelled `Загрузка приложения`.

## Error handling

The splash screen does not add new data loading or retry logic. Failures during pairing restoration or initial navigation continue through the existing application recovery behavior. The launch UI remains visible while initialization is pending rather than introducing a separate timeout or error state.

## Testing and verification

- Add a focused component test before implementation that expects the repository-local artwork, wordmark, tagline, and progress indicator.
- Verify the test fails before adding the component and passes afterward.
- Run the complete mobile Jest suite and TypeScript typecheck.
- Validate Expo configuration resolution so the native splash settings and asset path are accepted.
- Inspect the final asset; require a release-build startup smoke on physical iOS and Android devices before making claims about the visual transition.

## Constraints and non-goals

- No animation or fixed delay.
- No changes to pairing restoration, navigation decisions, or runtime protocol behavior.
- No dependency on the original file outside the repository after the production asset is created.
- The native and React phases share the dark background and source artwork, but are intentionally not pixel-identical because only React adds separate text and progress UI; platform rendering can differ further across iOS and Android.
