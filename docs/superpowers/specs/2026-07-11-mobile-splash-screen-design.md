# Mobile Splash Screen Design

## Goal

Add a branded splash screen to the Expo mobile application using the artwork supplied by the user. The launch experience must appear immediately, remain visually consistent while the JavaScript application initializes, and disappear as soon as the application is ready to choose its initial route.

## Approved visual direction

The approved direction is variant C:

- dark Cucoudle background (`#07111E`);
- the supplied square artwork centered above the wordmark;
- a separate `Cucoudle` wordmark;
- the tagline `AI CODING AGENTS · ONE CHAT` below the wordmark;
- no artificial minimum display duration or animated transition.

The supplied source artwork is `/Users/launert/Documents/image.png`. Production assets derived from it will live under `apps/mobile/assets/` so builds do not depend on files outside the repository.

## Launch flow

The launch experience has two matching phases:

1. Expo's native splash screen is shown before React Native is ready. It uses the dark background and a repository-local splash asset.
2. The existing index route renders a visually matching React Native loading screen while `AppProvider` restores pairing state and determines the destination route.

The matching background, composition, and scale prevent an obvious flash between native startup and the React loading phase. Existing routing behavior remains unchanged.

## Components and files

- `apps/mobile/app.json` configures Expo's native splash settings and points to the repository-local splash asset without adding a runtime dependency.
- `apps/mobile/assets/` stores the copied or derived splash artwork used by native builds and the React Native loading screen.
- `apps/mobile/src/ui/SplashScreen.tsx` owns the reusable React composition: artwork, wordmark, tagline, loading indicator, and accessibility labels.
- `apps/mobile/src/app/index.tsx` delegates its loading presentation to `SplashScreen` and retains its current routing role.
- `docs/splash-preview.html` remains a design preview artifact recording the compared directions and approved variant.

## Sizing and responsive behavior

The React loading screen uses a centered vertical composition inside a full-height dark container. The artwork uses a bounded responsive width so it remains legible on compact phones without touching the safe-area edges and does not become oversized on tablets. The wordmark and tagline remain separate text elements below the artwork. The activity indicator appears beneath the branding with subdued spacing.

The native splash uses `contain` sizing and the same background color. Because native splash configuration supports a single image rather than an arbitrary React layout, its repository-local image will be precomposed to approximate the approved composition as closely as practical.

## Accessibility

The React splash exposes one concise image label for the Cucoudle brand, keeps the wordmark readable by screen readers, and marks the loading indicator as a progress indicator. Decorative duplication is hidden from accessibility when necessary to avoid announcing the brand twice.

## Error handling

The splash screen does not add new data loading or retry logic. Failures during pairing restoration or initial navigation continue through the existing application recovery behavior. The launch UI remains visible while initialization is pending rather than introducing a separate timeout or error state.

## Testing and verification

- Add a focused component test before implementation that expects the repository-local artwork, wordmark, tagline, and progress indicator.
- Verify the test fails before adding the component and passes afterward.
- Run the complete mobile Jest suite and TypeScript typecheck.
- Validate Expo configuration resolution so the native splash settings and asset path are accepted.
- Inspect the final asset and, where the environment permits, visually smoke-test the startup transition.

## Constraints and non-goals

- No animation or fixed delay.
- No changes to pairing restoration, navigation decisions, or runtime protocol behavior.
- No dependency on the original file outside the repository after the production asset is created.
- The native and React phases should be visually consistent, but pixel-identical rendering across iOS and Android is not guaranteed by the platform splash APIs.
