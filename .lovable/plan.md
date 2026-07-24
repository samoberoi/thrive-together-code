# Production-Ready Responsive Refactor

Goal: one unified, adaptive design system that renders consistently across every Android and iOS device, with platform-native touches where they matter (iOS SF weights, Android ripples/elevation). Delivered in phases so each turn ships a working, testable slice — no big-bang rewrite that risks the stable flows (onboarding, video, food, coach).

---

## Phase 1 — Foundation (this turn)

Build the design system primitives every screen will use. Nothing visual changes for the user yet, but every subsequent phase pulls from this.

- **Responsive tokens** in `index.css` / `tailwind.config.ts`
  - Fluid type scale via `clamp()`: `--fs-caption`, `--fs-body`, `--fs-subhead`, `--fs-heading`, `--fs-display`
  - Spacing scale: `--sp-1` … `--sp-8` (4/8/12/16/20/24/32/40)
  - Radius, elevation, motion tokens
  - Safe-area tokens: `--sat`, `--sab`, `--sal`, `--sar` bound to `env(safe-area-inset-*)`
  - Bottom-nav clearance token: `--nav-h` + `--nav-clear = calc(var(--nav-h) + var(--sab))`
- **Layout primitives** in `src/components/layout/`
  - `AppScreen` — `min-height:100svh`, safe-area top padding, platform class hook
  - `AppScrollArea` — scroll container with `--nav-clear` bottom padding baked in
  - `AppHeader` — sticky header respecting notch/Dynamic Island
  - `AppBottomBar` — fixed bar sitting above home indicator / gesture pill
  - `AppSheet` — bottom sheet with `92svh` mobile / centered desktop, pinned header + footer, keyboard-aware
  - `KeyboardAwareView` — uses `visualViewport` API + Capacitor `Keyboard` events to lift composer above keyboard
  - `ResponsiveGrid` — auto 1↔2↔3 col based on container width (uses `@container` queries)
- **Platform adapter** `src/lib/platform.ts`
  - `isIOS`, `isAndroid`, `platformClass` applied to `<html>` at boot
  - iOS gets SF-style font stack + tighter tracking; Android gets Roboto stack + Material ripple utility
- **Typography component** `<Text variant="…">` mapping to tokens, with `numberOfLines` + ellipsis + `no-break` for chips/labels
- **Chip / Badge / Button** primitives updated to: min 48dp height (buttons), content-hugging width (chips), max 2 lines, ellipsis, never fixed width
- **Card** primitive: equal-height, container-query driven 1↔2 column collapse under ~360px
- **Keyboard plugin wiring** in `src/main.tsx` — set `Keyboard.setResizeMode({mode: 'native'})` on iOS, `body` on Android, publish `--kb-h` CSS var

Exit criteria: primitives exist, tokens defined, zero regressions (no screen migrated yet).

---

## Phase 2 — Global chrome

- `BottomNav` → `AppBottomBar` (fixed, safe-area aware, proper hit targets)
- All page shells wrapped in `AppScreen` + `AppScrollArea` via a small route-level HOC so every page inherits nav clearance and safe area for free
- Global CSS: remove `h-screen`, replace with `h-dvh` / `min-h-svh`; kill hardcoded `pb-20`, `mb-24`, `pt-safe` scattered patterns

Exit criteria: no content hidden under nav or notch on any route without touching each page.

---

## Phase 3 — High-traffic user screens

Migrate onto primitives, verify each on iPhone SE (375), iPhone 15 Pro Max (430), Pixel 4a (393), Nord 5 (412), foldable (280 unfolded), iPad (768+):

- Home (user + coach greeting variants)
- Dashboard (health metrics, weight, filter chips, grid alignment)
- Food / DietPlatingCalendar (chips, picker sheet)
- Exercise + Yoga (video cards)
- Profile + EditProfile (marital status row, DOB, allergies)
- Auth / Onboarding (keyboard overlap, safe area, CTA placement)

---

## Phase 4 — Coach portal

- CoachHome (2×2 KPI, activity 2-up)
- CoachPatients (2-col cards, package chips content-hugging, expiry pill)
- CoachInbox / PatientChat / YogaChat (keyboard-aware composer, fixed header, scrollable messages, no nav overlap)
- CoachFasting / CoachMove / CoachSupplements / CoachVideoAssign

---

## Phase 5 — Secondary screens

Remaining routes: Notifications, Plans, Invoices, Meetings, Lab tests, Community feed, Breath protocol, Soleus, Settings. Same primitive migration, verified against the device matrix.

---

## Phase 6 — QA sweep + polish

- Landscape pass
- Accessibility: 48×48 hit targets, dynamic type scaling, contrast, `<main>` landmark per route
- Screenshot verification via Playwright against the full device viewport matrix listed in your brief
- Remove now-dead device-specific CSS overrides (`.ob-bottom`, `.mobile-bottom-safe` Android hack, one-off `pb-*` on individual pages)

---

## Technical details

- **No React Native / Flutter.** The app is Capacitor + React + Vite; the responsive system is CSS/`svh`/`env()`/container queries + `visualViewport` for keyboard, which is the correct primitive stack for this codebase. Rewriting to RN/Flutter would be a full app replacement, not a refactor.
- **Container queries** (`@container`) drive card collapse rather than viewport media queries so cards behave correctly in any parent width (sheets, split views, iPad multitasking).
- **Keyboard**: iOS uses `visualViewport.height` diff; Android uses Capacitor Keyboard `keyboardWillShow` → publishes `--kb-h`. Composer positions with `bottom: calc(var(--kb-h, 0px) + var(--sab))`.
- **Platform-native**: shared spacing/typography/layout tokens; platform-specific class applies SF vs Roboto stack, iOS-style large title vs Android app-bar, Material ripple utility on Android-only pressables.
- **Migration safety**: primitives are additive. Old screens keep working until migrated. Each phase is independently shippable and reversible.

---

## Turn cadence

Each phase = one turn (Phase 3–5 may split into 2 turns each given the number of screens). After Phase 1 I'll pause so you can sanity-check the tokens/primitives before I roll them across ~80 screens. If the foundation is wrong, we catch it once instead of 80 times.

Approve to start Phase 1.