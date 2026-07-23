
# Android Responsive Refactor — Root Cause & Systemic Fix

## Why Android keeps breaking (root cause)

Every onboarding / setup screen re-implements its own scroll + footer layout. The current pattern (repeated in ~20 files) is:

```tsx
<div className="phone-container min-h-dvh flex flex-col px-5 pt-14 mobile-bottom-safe">
  <header/>
  <div className="flex flex-col flex-1"> ...content... </div>
  <div className="ob-bottom flex gap-3"> ...CTA... </div>
</div>
```

Combined with these fighting CSS rules in `index.css`:

- `.phone-container` sets `height`, `min-height`, `max-height` all to `var(--bbdo-viewport-height, 100dvh)` — a fixed viewport lock.
- `.mobile-bottom-safe` adds bottom padding, but the Android override zeroes it.
- `.ob-bottom` is `position: relative !important` with `margin-top: auto` on Android — but on iOS it's a different mode.
- Tailwind `min-h-dvh` on the same element competes with the fixed `max-height`.
- Framer-motion wrappers create transformed containing blocks that break any absolute/fixed footer child.
- `--bbdo-viewport-height` is JS-computed at startup and stales when the Android system bars resize.

Result: on some Android devices the flex content sizes past the "locked" viewport, gets clipped, and the CTA visually overlaps the last card. Every one-off fix (fixed → sticky → absolute → relative) shifts the bug to a different screen.

## The single fix

Stop patching screens. Introduce **one** responsive layout primitive, replace all screen-level layout containers with it, and delete the competing CSS.

### 1. New primitive: `<AppScreen>` (and `<AppScreenFooter>`)

`src/components/layout/AppScreen.tsx` — replaces the `phone-container / ob-lock / mobile-bottom-safe / ob-bottom` combinations.

Behavior (identical on iOS + Android, no platform branches):

- Uses `min-h-[100svh]` (small viewport unit — stable across Android bar show/hide) with `flex flex-col`.
- Max width `430px`, centered, no fixed height / max-height.
- The **page itself is the scroll container** via `flex-1 overflow-y-auto overscroll-contain`.
- Footer slot rendered as a sibling in normal flow — always after content, guaranteed no overlap.
- Reads safe-area insets directly via `env(safe-area-inset-*)` on padding — no JS viewport measurement, no `--bbdo-native-bottom-guard` variable.
- Accepts `scrollable` (default true), `padded` (default true), and `footer` props.

### 2. Delete the competing CSS

In `src/index.css` remove/simplify:

- Fixed `height` / `max-height` on `.phone-container` and `.ob-lock`.
- All `html.bb-native.bb-android` overrides for `.phone-container`, `.ob-lock`, `.ob-bottom`, `.mobile-bottom-safe`.
- The `!important` red-CTA global (`.ob-cta:not(...)`).
- The `--bbdo-viewport-height` / `--bbdo-native-bottom-guard` / `--bbdo-native-top-guard` variables and the JS that writes them in `startupDiagnostics.ts`.

Keep the shared tokens (`--bbdo-cream`, `--bbdo-red`, `--bbdo-blue`, etc.) untouched.

### 3. Migrate screens

Replace the top-level container in these screen groups (all currently duplicate the same broken pattern):

- `src/pages/onboarding/*` — RealityHook, TensionScreen, BreakPattern, HopeScreen, InsightScreen, CommitmentScreen, DayOneScreen, ProjectionPreview, PunchFramework, ScoreInterpretation, TrajectoryScreen, TransformationStory, AuthorityStatement, StartAssessment.
- `src/pages/setup/*` — Purpose, BasicDetails, BodyStats, ClinicalData, LifestyleQuestions, DeepProfiling, HealthQuestions, HealthScore.
- `src/pages/Auth.tsx`, `src/pages/Splash.tsx`, `src/pages/LanguageSelect.tsx`, `src/pages/Tour.tsx`.

Each screen becomes:

```tsx
<AppScreen footer={<CTA/>}>
  <Header/>
  <Content/>
</AppScreen>
```

Content uses Tailwind flex utilities (`flex flex-col gap-*`, `flex-1`, `w-full`). No fixed pixel widths/heights, no absolute-positioned footers, no motion wrappers on the outer container.

### 4. Remove framer-motion wrappers that create containing blocks

Where `motion.div` wraps the entire screen or footer, replace with plain `div`. Keep motion only on individual cards / buttons where it's a leaf.

### 5. Tab pages (Home, Diet, Exercise, etc.)

They already use `pb-nav` for bottom-nav clearance. Convert to `<AppScreen scrollable padded={false} footer={<BottomNav/>}>` in a follow-up (out of scope for this pass to keep diff bounded, but the primitive supports it).

## Technical details

Files created:

- `src/components/layout/AppScreen.tsx`
- `src/components/layout/AppScreenFooter.tsx` (optional convenience)

Files modified:

- `src/index.css` — remove Android overrides, simplify `.phone-container`, drop viewport-height JS variables, keep tokens.
- `src/lib/startupDiagnostics.ts` — drop the JS viewport-height writer; keep only what's still needed (native class flags).
- ~25 screen files — swap outer container to `<AppScreen>`.

Files untouched:

- iOS Capacitor config, native Android / iOS folders, Supabase, business logic, services, hooks.

## Validation

- Playwright at 320 / 360 / 390 / 412 dp widths, portrait; spot-check landscape.
- For each key screen (RealityHook, Purpose, BasicDetails, ClinicalData, LifestyleQuestions, DeepProfiling, ScoreInterpretation, Auth): screenshot + assert no overlap between last content card and footer.
- Typecheck.

## Non-goals

- No device-specific CSS.
- No changes to iOS visual behavior beyond removing the competing overrides (iOS already works because it doesn't hit them).
- No redesign — same visuals, same tokens, same components inside screens.

## Rollout

Single PR. After merge: `npm run build && npx cap sync android` and reinstall APK. No further per-screen tweaks should be required for new Android devices.
