# Exercise 2.0

A brand-new, parallel exercise library. The existing Exercise section is left completely untouched — no schema, screen, or data changes to it.

## What gets built

### 1. New reference lists (each fully manageable in the admin)
Six small "pick lists" that feed the dropdowns on every Exercise 2.0 entry:

- **Workout Type** — Endurance, Strength, Balance, Mobility, Cardio, HIIT, Pilates, Physiotherapy, Yoga, Tabata, Sport Mastery, Guided Run, Mind-Body, Recovery, Pregnancy & Postpartum, Corrective Exercise, Miscellaneous
- **Experience Level** — Beginner, Intermediate, Advanced
- **Target Audience** — Everyone, Male, Female
- **Age Group** — 18–24, 25–30, 31–36, 37–42, 43–48, 49–54, 55–60, 61–65, 65+
- **Equipment** — None / Bodyweight, Dumbbells, Resistance Band, Kettlebell, Barbell, Mat, Stability Ball, Bench, Chair, Wall, Foam Roller, Pull-up Bar, Treadmill, Cycle, Skipping Rope, Medicine Ball, Cable Machine, Step Box, Other
- **Muscle Group** — Full Body, Core, Chest, Back, Shoulders, Biceps, Triceps, Forearms, Glutes, Quads, Hamstrings, Calves, Hip Flexors, Obliques, Lower Back, Neck, Pelvic Floor

Each list supports add / rename / reorder / enable-disable, so you never need me to add an option again.

### 2. The Exercise 2.0 library
A copy of the 61 existing exercises — same names, videos, thumbnails, instructions, benefits, cautions, sets/reps — moved into their own Exercise 2.0 records so editing one never affects the old section. Each record additionally carries:

- Workout Type (single)
- Experience Level (single)
- Target Audience (single)
- Age Groups (multi-select)
- Equipment (multi-select)
- Muscle Groups (multi-select)

Copied records start with these new fields blank (except sensible defaults where the old data already tells us — e.g. tier maps to experience level), ready for you to tag.

### 3. Admin screens
- New **Exercise 2.0** tile in the admin sidebar, right under Exercise.
- Inside it: a **Library** tab (list, search, filter by any of the six attributes, add/edit/delete, enable toggle, video preview, thumbnail upload) and a **Taxonomy** tab holding all six pick-list managers in one place.
- The same six managers are also reachable from **Control Center** so they sit where you expected them.

### 4. Nothing user-facing yet
Exercise 2.0 stays admin-only in this pass — the member app keeps using the current Exercise section until you say switch over.

## Technical notes

- New tables: `workout_types`, `exercise_experience_levels`, `exercise_target_audiences`, `exercise_age_groups`, `exercise_equipment`, `exercise_muscle_groups`, `exercises_v2`, plus link tables `exercises_v2_age_groups`, `exercises_v2_equipment`, `exercises_v2_muscle_groups`.
- Each table: public read for authenticated users, write restricted to admins, with explicit GRANTs.
- Seed migration copies rows from `exercises` into `exercises_v2` and populates all six reference lists.
- New `src/lib/exercise2Service.ts`; new `src/pages/admin/AdminExercises2.tsx` and a reusable `TaxonomyManager` component for the six lists.
- `AdminExercises.tsx`, `exerciseService.ts`, and the `exercises` table are not modified.
