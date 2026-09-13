/**
 * Turns a notification into an in-app destination.
 *
 * Notifications are created by many different backend triggers, so their
 * `action_url` values are inconsistent (`/coach?tab=…`, `/dashboard?tab=…`,
 * `/home?tab=…`) and sometimes missing entirely. This module normalises them
 * and validates the target against the tabs the signed-in role actually has,
 * so a tap always lands somewhere meaningful instead of doing nothing.
 */

export type NotificationRole = "user" | "coach" | "admin" | "partner";

const ROLE_HOME: Record<NotificationRole, string> = {
  user: "/home",
  coach: "/coach-dashboard",
  admin: "/admin-dashboard",
  partner: "/partner-dashboard",
};

const USER_TABS = new Set([
  "home", "habits", "exercise", "fasting", "supplements", "videos",
  "community", "consult", "labs", "diet", "messages", "profile",
]);

const COACH_TABS = new Set([
  "home", "patients", "meetings", "requests", "messages", "community",
  "fasting", "food", "supplements", "move", "train", "yoga", "labtests", "profile",
]);

const ADMIN_TABS = new Set([
  "overview", "users", "coaches", "admins", "diet", "food_config", "supplements",
  "food_condition_rules", "fasting", "movement", "labtests", "videos", "exercises",
  "rbac", "subscriptions", "packages", "assignments", "languages", "commissions",
  "community_categories", "community", "referrals", "logs", "color_gauges",
  "notifications", "channel_partners", "global_streak", "pnl", "diet_types", "bmi",
  "onboarding_grades", "coupons", "profile",
]);

const TABS_FOR: Record<NotificationRole, Set<string>> = {
  user: USER_TABS,
  coach: COACH_TABS,
  admin: ADMIN_TABS,
  partner: new Set<string>(),
};

/** Legacy / cross-role tab names mapped onto the tab each role really has. */
const TAB_ALIASES: Record<NotificationRole, Record<string, string>> = {
  user: { patients: "home", labtests: "labs", move: "habits", train: "exercise", yoga: "habits" },
  coach: { labs: "labtests", habits: "move", exercise: "train", consult: "meetings" },
  admin: { patients: "users", labs: "labtests", habits: "movement", exercise: "exercises", consult: "coaches" },
  partner: {},
};

/** Fallback destination per notification type when `action_url` is unusable. */
const TYPE_FALLBACK: Record<string, Partial<Record<NotificationRole, string>>> = {
  chat_message:        { user: "/home?tab=messages", coach: "/coach-dashboard?tab=messages", admin: "/admin-dashboard?tab=coaches" },
  community_like:      { user: "/home?tab=community", coach: "/coach-dashboard?tab=community", admin: "/admin-dashboard?tab=community" },
  community_comment:   { user: "/home?tab=community", coach: "/coach-dashboard?tab=community", admin: "/admin-dashboard?tab=community" },
  community_reply:     { user: "/home?tab=community", coach: "/coach-dashboard?tab=community", admin: "/admin-dashboard?tab=community" },
  fasting:             { user: "/home?tab=fasting", coach: "/coach-dashboard?tab=fasting" },
  supplements:         { user: "/home?tab=supplements", coach: "/coach-dashboard?tab=supplements" },
  supplement_reminder: { user: "/home?tab=supplements" },
  fasting_reminder:    { user: "/home?tab=fasting" },
  water_reminder:      { user: "/home" },
  habit_reminder:      { user: "/home?tab=habits" },
  lab_test:            { user: "/home?tab=labs", coach: "/coach-dashboard?tab=labtests", admin: "/admin-dashboard?tab=labtests" },
  meeting:             { user: "/home?tab=consult", coach: "/coach-dashboard?tab=meetings" },
  consultation:        { user: "/home?tab=consult", coach: "/coach-dashboard?tab=requests" },
  coach_assignment:    { user: "/home?tab=consult", coach: "/coach-dashboard?tab=patients" },
  coach_new_patient:   { coach: "/coach-dashboard?tab=patients" },
  coach_nudge:         { user: "/home" },
  coach_alert:         { coach: "/coach-dashboard?tab=patients", admin: "/admin-dashboard?tab=users" },
  health_alert:        { user: "/home", coach: "/coach-dashboard?tab=patients", admin: "/admin-dashboard?tab=users" },
  score_alert:         { user: "/home" },
  compliment:          { user: "/home?tab=community" },
  renewal_reminder:    { user: "/plans" },
  coach_renewal_reminder: { coach: "/coach-dashboard?tab=patients" },
  welcome:             { user: "/home" },
  onboarding:          { user: "/home" },
  video_assignment:    { user: "/home?tab=videos", coach: "/coach-dashboard?tab=train" },
  subscription:        { user: "/plans", admin: "/admin-dashboard?tab=subscriptions" },
  payment:             { user: "/plans", admin: "/admin-dashboard?tab=subscriptions" },
};

/** Absolute paths that are valid for everyone and need no tab handling. */
const PLAIN_PATHS = new Set(["/plans", "/payment", "/notifications", "/tour", "/delete-account"]);

const DASHBOARD_PATHS: Record<string, NotificationRole> = {
  "/home": "user",
  "/dashboard": "user",
  "/coach": "coach",
  "/coach-dashboard": "coach",
  "/admin": "admin",
  "/admin-dashboard": "admin",
  "/partner": "partner",
  "/partner-dashboard": "partner",
};

export interface RoutableNotification {
  type?: string | null;
  action_url?: string | null;
}

/**
 * Resolve the route a notification should open for the given role.
 * Always returns a usable in-app path.
 */
export function resolveNotificationRoute(
  n: RoutableNotification,
  role: NotificationRole = "user",
): string {
  const home = ROLE_HOME[role];
  const raw = String(n.action_url || "").trim();

  if (raw && !raw.startsWith("/")) {
    // External or malformed target — never navigate blindly.
    return typeFallback(n.type, role) ?? home;
  }

  if (raw) {
    const [pathPart, queryPart = ""] = raw.split("?");
    const path = pathPart.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(queryPart);

    if (PLAIN_PATHS.has(path)) return raw;

    const targetRole = DASHBOARD_PATHS[path];
    if (targetRole) {
      let tab = params.get("tab") || "";
      if (tab) {
        const alias = TAB_ALIASES[role][tab];
        if (!TABS_FOR[role].has(tab) && alias) tab = alias;
        if (!TABS_FOR[role].has(tab)) tab = "";
      }
      if (tab) params.set("tab", tab);
      else params.delete("tab");
      const qs = params.toString();
      return qs ? `${home}?${qs}` : home;
    }

    // Unknown but internal path (e.g. a future page) — keep it as-is.
    if (path !== "/") return raw;
  }

  return typeFallback(n.type, role) ?? home;
}

function typeFallback(type: string | null | undefined, role: NotificationRole): string | null {
  const entry = TYPE_FALLBACK[String(type || "")];
  const target = entry?.[role];
  if (!target) return null;
  return target;
}

/* ── Pending route handoff (native push taps) ───────────────────────── */

const PENDING_KEY = "bb_pending_notification_route";

/**
 * Remember a notification tap that arrived before the app UI was ready to
 * navigate (cold start from a native push). The role is unknown at that point,
 * so we keep the raw notification and resolve the route on navigation.
 */
export function setPendingNotificationTap(
  n: RoutableNotification,
  opts?: { silent?: boolean },
) {
  try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(n)); } catch { /* ignore */ }
  if (opts?.silent) return;
  try {
    window.dispatchEvent(new CustomEvent("notification:navigate", { detail: n }));
  } catch { /* ignore */ }
}

export function takePendingNotificationTap(): RoutableNotification | null {
  try {
    const v = sessionStorage.getItem(PENDING_KEY);
    if (!v) return null;
    sessionStorage.removeItem(PENDING_KEY);
    const parsed = JSON.parse(v);
    return parsed && typeof parsed === "object" ? (parsed as RoutableNotification) : null;
  } catch {
    return null;
  }
}
