## Scope

Ship the visual/UX gap between end-user and coach surfaces, plus the concrete fixes called out on the Home screen and coach inbox. No new CSS tokens — reuse the existing `liquid-glass`, `.no-break`, `stat-number`, `RoleTopBar`, `ob-cta`, `EmptyState` primitives already shared with Apple/Android.

## End-user Home (`src/pages/tabs/Home.tsx`)

1. **Reorder blocks** so the header reads:
   - Greeting (H1)
   - Weekly Consistency Streak (`GlobalStreakCard`)
   - Then the "Immediate medical supervision recommended" alert (currently rendered first)
   - Then the coach-meeting card, Yoga class, etc.
2. **Greeting swap:** when a coach exists, render `Good afternoon, <CoachName> 👋` and make the name a tap target that navigates to Messages → coach chat (dispatch the same event the messages tab uses today). Fall back to first name when no coach is assigned (Foundation tier).
3. **Meeting card:** currently the "coming in shortly" banner shows even after the coach schedules a meeting because `nextMeeting` only accepts rows with `scheduled_at >= now - 1h`. Broaden the query and status filter so a `scheduled` meeting (any future time, or in-progress within `duration_min`) always resolves to the "Next Coach Meeting" hero card with real date/time, coach name, and agenda. The empty-state banner only shows when zero scheduled meetings exist.

## Coach Home (`src/pages/coach/CoachHome.tsx`)

Apply the end-user visual grammar (no new tokens):

- Hero greeting: same `text-[30px] font-semibold tracking-[-0.03em]` treatment as user Home.
- Section cards wrapped in `liquid-glass rounded-3xl p-5`, headings promoted to `text-base font-black`, `Meetings require scheduling` gets an icon chip identical to user meeting card, and the "4 pending" pill becomes a compact `text-[10px] uppercase tracking-[0.16em]` badge inside the header row (no vertical wrap).
- Patient rows: standard 12px radius, avatar 40px, `Schedule` CTA styled as `ob-cta-blue` pill matching size across rows.

## Coach Patients (`src/pages/coach/CoachPatients.tsx`)

- Log-history tab strip (Diabetes / BP / Weight / Fasting / Supps): wrap each chip with `.no-break` + `min-width:0` and switch the row to a horizontally-scrollable `snap-x` strip (already `overflow-x-auto`; add `whitespace-nowrap` and `shrink-0` on tab buttons). Fixes chips spilling off the card.
- Patient summary card metric tiles: apply `.no-break` on labels ("Health", "Weight", "Sugar") and units to prevent mid-word wraps on Nord widths.

## Coach Inbox (`src/components/chat/CoachInbox.tsx`)

- When `openPatientId` triggers `getOrCreateConversation`, reload conversations **and** immediately open the newly created convo so the chat view (with input box + send button) renders even at zero messages. Today it only calls `loadConversations()` and drops the user on the empty inbox.
- Empty-state inside an open conversation: keep the "No messages yet" illustration but the composer at the bottom is already present — this fix just makes sure we land inside the conversation, not the inbox list, so users can send the first message.

## Out of scope

- No global CSS changes (per user directive).
- No changes to package-2/3 gating logic — visual polish only across those tiers reuses the same Home component.
- Coach profile page, meetings tab internals, and supplements/lab-tests coach screens are not touched in this pass; they will be a follow-up if the user wants the same polish extended.

## Verification

- Playwright: load `/` as a paid user with a scheduled meeting → confirm hero shows date/time; alert appears **after** streak card; greeting shows coach name.
- Load `/coach` → confirm greeting matches user Home density, "Meetings require scheduling" header aligned, pending badge inline.
- Coach Patients → open a patient → tab strip scrolls without chip clipping.
- Coach Patients → tap chat on a patient with no history → lands directly inside the chat view with composer, can send first message.
