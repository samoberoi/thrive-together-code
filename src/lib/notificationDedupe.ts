/**
 * Single source of truth for "has this notification already been shown on this
 * device?".
 *
 * A single backend notification can reach the device through several paths at
 * once — the FCM push itself, the Android foreground mirror, and the realtime
 * `notifications` insert. Every path must claim the notification here before
 * showing a banner or playing a sound, so the user only ever sees one.
 *
 * Claims are persisted in localStorage so a notification shown while the app
 * was backgrounded is not repeated when the WebView resumes and replays the
 * realtime insert.
 */

const STORAGE_KEY = "bbdo_shown_notifications_v1";
const TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_ENTRIES = 200;

type ClaimMap = Record<string, number>;

function read(): ClaimMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ClaimMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(map: ClaimMap) {
  try {
    const entries = Object.entries(map)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* storage full or unavailable — in-memory dedupe still applies */
  }
}

const memory = new Map<string, number>();

/** Stable key for a notification, preferring its database id. */
export function notificationKey(input: {
  id?: string | null;
  title?: string | null;
  body?: string | null;
}): string {
  if (input.id) return `id:${input.id}`;
  return `tb:${(input.title || "").trim()}|${(input.body || "").trim()}`;
}

/**
 * Claim a notification for display. Returns true only for the first caller
 * within the dedupe window; every later path must stay silent.
 */
export function claimNotification(key: string): boolean {
  const now = Date.now();

  const mem = memory.get(key);
  if (mem && now - mem < TTL_MS) return false;
  memory.set(key, now);
  for (const [k, t] of memory) if (now - t > TTL_MS) memory.delete(k);

  const stored = read();
  const prev = stored[key];
  if (prev && now - prev < TTL_MS) return false;

  for (const [k, t] of Object.entries(stored)) {
    if (now - t > TTL_MS) delete stored[k];
  }
  stored[key] = now;
  write(stored);
  return true;
}
