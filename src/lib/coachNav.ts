import { useEffect } from "react";

/**
 * Cross-module coach navigation.
 *
 * "Manage" actions on a patient profile should behave exactly like walking into
 * the module yourself (Fasting → patients → Kaka → detail), so we switch the
 * dashboard tab AND tell that module which patient to open.
 */
export type CoachModuleTab = "fasting" | "supplements" | "labtests" | "food" | "meetings";

const EVENT = "coach:open-module";

let pending: { tab: CoachModuleTab; patientId: string } | null = null;

export function openCoachPatientModule(tab: CoachModuleTab, patientId: string) {
  pending = { tab, patientId };
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { tab, patientId } }));
}

function consume(tab: CoachModuleTab): string | null {
  if (pending && pending.tab === tab) {
    const id = pending.patientId;
    pending = null;
    return id;
  }
  return null;
}

/**
 * Inside a coach module: focus the requested patient, both when the module is
 * already mounted (event) and when it mounts lazily right after the tab switch.
 */
export function useCoachPatientFocus(tab: CoachModuleTab, focus: (patientId: string) => void) {
  useEffect(() => {
    const id = consume(tab);
    if (id) focus(id);

    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { tab: CoachModuleTab; patientId: string };
      if (d?.tab !== tab || !d.patientId) return;
      pending = null;
      focus(d.patientId);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);
}

/** Dashboard-level listener that switches to the right tab. */
export function useCoachModuleNavigation(selectTab: (tab: CoachModuleTab) => void) {
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail as { tab: CoachModuleTab };
      if (d?.tab) selectTab(d.tab);
    };
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [selectTab]);
}
