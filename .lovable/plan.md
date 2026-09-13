# Rebuild mobile lab comparison

## What will change
- Keep the comparison as a full-screen view, but place its header below the phone safe area and keep the Close control permanently reachable.
- Replace the compressed desktop table on phones with clear marker cards showing the older report and newest report side by side, each with its date directly above the value.
- Show the direction and size of change in plain language, while preserving status labels, units, reference ranges, and missing-result states.
- Keep a compact comparison table on wider screens, with clearer dated column headers.

## Technical details
- Update `FullMarkerComparison` only; no lab data, permissions, or report-processing logic changes.
- Add body scroll locking while the full-screen comparison is open so the coach page cannot move behind it.
- Use the existing semantic colors, buttons, typography, and lab status mapping.
- Verify the result at coach-phone and desktop widths, including the fixed header, close action, and multi-report values.
