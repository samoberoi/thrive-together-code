import { createContext, useContext, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";
import { logAudit } from "@/lib/auditLog";
import { clearUser } from "@/lib/userStore";
import { sendWelcomeNotification } from "@/lib/notificationService";
import { registerNativePush, isNativePushSupported } from "@/lib/nativePush";
import {
  clearNativePersistedAuthState,
  getNativePersistenceDiagnostics,
  hasNativePersistedAuthSession,
  hydrateNativePersistence,
  persistSupabaseSessionToNative,
  readNativeSessionTokens,
  syncNativePersistenceFromLocalStorage,
} from "@/lib/nativePersistence";
import { isNative } from "@/lib/biometric";
import { logStartupEvent, reportStartupError } from "@/lib/startupDiagnostics";

export const EXPLICIT_LOGOUT_KEY = "bb_explicit_logout";
let existingSessionRestorePromise: Promise<Session | null> | null = null;

function scheduleNativePushRegistration(userId: string, delayMs = 800) {
  if (!isNativePushSupported()) return;
  window.setTimeout(() => {
    void registerNativePush(userId).catch((error) => {
      console.warn("registerNativePush failed", error);
    });
  }, delayMs);
}

export function clearPersistedAuthState(markLoggedOut = true) {
  try {
    clearUser();
    if (markLoggedOut) localStorage.setItem(EXPLICIT_LOGOUT_KEY, "1");
    Object.keys(localStorage).forEach((key) => {
      if (key.startsWith("sb-") || key.toLowerCase().includes("supabase")) {
        localStorage.removeItem(key);
      }
    });
    Object.keys(sessionStorage).forEach((key) => {
      if (key.startsWith("sb-") || key.toLowerCase().includes("supabase")) {
        sessionStorage.removeItem(key);
      }
    });
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0]?.trim();
      if (name && (name.startsWith("sb-") || name.toLowerCase().includes("supabase"))) {
        document.cookie = `${name}=; Max-Age=0; path=/`;
      }
    });
    window.dispatchEvent(new CustomEvent("bb_user_updated"));
  } catch {
    /* ignore storage cleanup errors */
  }
}

async function clearAllPersistedAuthState(markLoggedOut = true) {
  clearPersistedAuthState(markLoggedOut);
  await clearNativePersistedAuthState();
}

function readStoredSessionTokens(): { access_token: string; refresh_token: string } | null {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key || (!key.startsWith("sb-") && !key.toLowerCase().includes("supabase"))) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as {
        access_token?: unknown;
        refresh_token?: unknown;
        currentSession?: { access_token?: unknown; refresh_token?: unknown };
        session?: { access_token?: unknown; refresh_token?: unknown };
      };
      const candidate = parsed.currentSession ?? parsed.session ?? parsed;
      if (typeof candidate.access_token === "string" && typeof candidate.refresh_token === "string") {
        return {
          access_token: candidate.access_token,
          refresh_token: candidate.refresh_token,
        };
      }
    }
  } catch {
    /* ignore malformed storage entries */
  }
  return null;
}

async function recoverNativeStoredSession(): Promise<Session | null> {
  if (!isNative()) return null;
  logStartupEvent("native session recovery started");
  await hydrateNativePersistence();
  const tokens = (await readNativeSessionTokens()) ?? readStoredSessionTokens();
  if (!tokens) {
    logStartupEvent("native session recovery", "no tokens found");
    return null;
  }
  try {
    const { data, error } = await supabase.auth.setSession(tokens);
    if (error || !data.session) {
      reportStartupError("native session setSession failed", error || "no session returned");
      return null;
    }
    await persistSupabaseSessionToNative(data.session);
    logStartupEvent("native session recovered", data.session.user?.id || "session");
    return data.session;
  } catch {
    reportStartupError("native session recovery threw", "setSession threw");
    return null;
  }
}

export async function prepareFreshLoginState() {
  await clearAllPersistedAuthState(true);
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    /* local session may already be gone */
  } finally {
    await clearAllPersistedAuthState(true);
  }
}

export async function getExistingSessionUnlessLoggedOut() {
  if (existingSessionRestorePromise) return existingSessionRestorePromise;
  existingSessionRestorePromise = (async () => {
  try {
    logStartupEvent("existing session restore started");
    // CRITICAL: honor the explicit logout marker BEFORE hydrating native
    // persistence. Otherwise iOS/Android will re-hydrate the previously stored
    // session from the keychain and silently log the user back in — skipping
    // the OTP + onboarding flow entirely.
    if (localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "1") {
      logStartupEvent("existing session restore", "explicit logout marker present — skipping hydration");
      try { await clearNativePersistedAuthState(); } catch { /* ignore */ }
      try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
      return null;
    }
    if (isNative()) await hydrateNativePersistence();
    let { data } = await supabase.auth.getSession();
    if (!data.session && isNative() && await hasNativePersistedAuthSession()) {
      await hydrateNativePersistence();
      const retry = await supabase.auth.getSession();
      data = retry.data;
      if (!data.session) {
        const recovered = await recoverNativeStoredSession();
        if (recovered) data = { session: recovered };
      }
    }
    if (data.session) {
      localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
      if (isNative()) void persistSupabaseSessionToNative(data.session);
      logStartupEvent("existing session restore found session", data.session.user?.id || "session");
      return data.session;
    }
    logStartupEvent("existing session restore", "no session");
    return data.session ?? null;
  } catch (error) {
    reportStartupError("existing session restore failed", error);
    return null;
  }
  })();
  try {
    return await existingSessionRestorePromise;
  } finally {
    existingSessionRestorePromise = null;
  }
}

interface AuthContextType {
  session: Session | null;
  user: User | null;
  loading: boolean;
  ready: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  loading: true,
  ready: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const prevUserId = useRef<string | null>(null);

  const applySession = useCallback((nextSession: Session | null) => {
    setSession(nextSession);
    prevUserId.current = nextSession?.user?.id ?? null;
    if (nextSession) void persistSupabaseSessionToNative(nextSession);
    else void syncNativePersistenceFromLocalStorage();
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // If the user just explicitly logged out, ignore any auto-restored
        // session from a token refresh / native hydration and force the app
        // back to a signed-out state.
        if (localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "1") {
          if (session) {
            // Native keychain / persisted refresh token restored a session
            // we've been told to forget. Nuke it and stay logged out.
            void supabase.auth.signOut({ scope: "local" }).catch(() => {});
            void clearNativePersistedAuthState().catch(() => {});
          } else {
            localStorage.removeItem(EXPLICIT_LOGOUT_KEY);
          }
          applySession(null);
          setLoading(false);
          setReady(true);
          prevUserId.current = null;
          void syncNativePersistenceFromLocalStorage();
          return;
        }

        const previousUid = prevUserId.current;
        applySession(session);
        setLoading(false);
        setReady(true);
        const newUid = session?.user?.id ?? null;
        if (event === "SIGNED_IN" && newUid && previousUid !== newUid) {
          logAudit({ module: "Auth", action: "login", target_type: "user", target_id: newUid });
          // Welcome notification is intentionally triggered from Home dashboard
          // (see src/pages/tabs/Home.tsx) — not on SIGNED_IN — so the user
          // is greeted when they actually land on the dashboard.
        }

        // Register for native push (APNs / FCM) whenever a native session is
        // restored for a different user, not only on a fresh SIGNED_IN event.
        // Existing iPhone installs often restore a session after rebuild/sync.
        if (newUid && previousUid !== newUid) {
          scheduleNativePushRegistration(newUid);
        }
        prevUserId.current = newUid;
      }
    );

    (async () => {
      logStartupEvent("auth provider initial restore started");
      // CRITICAL: check the explicit logout marker BEFORE hydrating any native
      // persisted tokens. Otherwise the app relaunch on iOS/Android will
      // silently restore the old session and skip the login/onboarding flow.
      if (localStorage.getItem(EXPLICIT_LOGOUT_KEY) === "1") {
        logStartupEvent("auth provider initial restore", "explicit logout marker present");
        try { await clearNativePersistedAuthState(); } catch { /* ignore */ }
        try { await supabase.auth.signOut({ scope: "local" }); } catch { /* ignore */ }
        applySession(null);
        setLoading(false);
        setReady(true);
        prevUserId.current = null;
        void syncNativePersistenceFromLocalStorage();
        return;
      }
      if (isNative()) {
        const diagnostics = await getNativePersistenceDiagnostics();
        console.info("Native auth storage status", diagnostics);
        logStartupEvent("native auth storage status", diagnostics);
      }
      let { data: { session } } = await supabase.auth.getSession();
      if (!session && isNative() && await hasNativePersistedAuthSession()) {
        await hydrateNativePersistence();
        const retry = await supabase.auth.getSession();
        session = retry.data.session;
        if (!session) {
          session = await recoverNativeStoredSession();
        }
      }

      applySession(session);
      setLoading(false);
      setReady(true);
      logStartupEvent("auth provider ready", session?.user?.id || "no-session");
      const uid = session?.user?.id;
      if (uid) {
        // Welcome notification is triggered from the Home dashboard on landing,
        // not on session restore.
        scheduleNativePushRegistration(uid, 900);
      }

    })().catch((error) => {
      reportStartupError("Initial auth restore failed", error);
      applySession(null);
      setLoading(false);
      setReady(true);
    });

    return () => subscription.unsubscribe();
  }, [applySession]);

  const signOut = async () => {
    const uid = session?.user?.id;
    if (uid) logAudit({ module: "Auth", action: "logout", target_type: "user", target_id: uid });
    setLoading(true);
    try {
      // Use LOCAL scope (no server round-trip) and a hard timeout so the
      // mobile app never hangs when the network is slow or the refresh token
      // is already invalid.
      await Promise.race([
        supabase.auth.signOut({ scope: "local" }),
        new Promise((resolve) => setTimeout(resolve, 2500)),
      ]);
    } catch (error) {
      console.warn("signOut error (ignored, forcing local clear)", error);
    } finally {
      try {
        await clearAllPersistedAuthState();
      } catch (error) {
        console.warn("clearAllPersistedAuthState error (ignored)", error);
      }
      prevUserId.current = null;
      setSession(null);
      setLoading(false);
      setReady(true);
    }
  };

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, ready, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
