import { useEffect, useState, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Play, Users, Stethoscope, Zap, Timer, Pill, FlaskConical, LogOut, Footprints, Compass, Dumbbell, MessageCircle, Plus, CalendarDays, UtensilsCrossed } from "lucide-react";
import BbdoWordmark from "@/components/BbdoWordmark";
import SoundToggle from "@/components/SoundToggle";
import NotificationCenter from "@/components/NotificationCenter";
import SidebarPackageCard from "@/components/SidebarPackageCard";
import bbdoLogo from "@/assets/logo.png";
import { useSearchParams, useNavigate } from "react-router-dom";
import LogFAB from "@/components/LogFAB";
import BottomNav from "@/components/BottomNav";

// Home tab loads eagerly so /home paints immediately.
import HomeTab from "./tabs/Home";

// Other tabs load on demand; prefetched below when the Dashboard mounts.
const Movement = lazy(() => import("./tabs/Movement"));
const ExerciseTab = lazy(() => import("./tabs/Exercise"));
const Videos = lazy(() => import("./tabs/Videos"));
const Community = lazy(() => import("./tabs/Community"));
const Profile = lazy(() => import("./tabs/Profile"));
const Messages = lazy(() => import("./tabs/Messages"));
const Consult = lazy(() => import("./tabs/Consult"));
const LabTestsTab = lazy(() => import("./tabs/LabTests"));
const Diet = lazy(() => import("./tabs/Diet"));

const TabFallback = () => (
  <div className="w-full h-full flex items-center justify-center py-16">
    <div className="h-6 w-6 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
  </div>
);


import UserFasting from "@/components/UserFasting";
import UserSupplements from "@/components/UserSupplements";
import NotificationsPanel from "@/components/NotificationsPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useRbac } from "@/hooks/useRbac";
import { useUserStore } from "@/hooks/useUserStore";
import { supabase } from "@/integrations/supabase/client";
import { useAttentionCounts } from "@/hooks/useAttentionCounts";
import AttentionBadge from "@/components/attention/AttentionBadge";


export type Tab = "home" | "habits" | "exercise" | "fasting" | "supplements" | "videos" | "community" | "consult" | "labs" | "diet" | "messages";

const VALID_TABS: Tab[] = ["home", "habits", "exercise", "fasting", "supplements", "videos", "community", "consult", "labs", "diet", "messages"];

function isTab(value: string | null): value is Tab {
  return value != null && VALID_TABS.includes(value as Tab);
}

const navIcons: Record<Tab, React.ElementType> = {
  home: Home,
  habits: Footprints,
  exercise: Dumbbell,
  fasting: Timer,
  supplements: Pill,
  videos: Play,
  community: Users,
  consult: Stethoscope,
  labs: FlaskConical,
  diet: UtensilsCrossed,
  messages: MessageCircle,
  
};

const navLabelOverrides: Partial<Record<Tab, string>> = {
  diet: "Food",
  habits: "Movement",
  exercise: "Exercise",
  supplements: "Supplements",
  videos: "Stress and Yoga",
  labs: "Lab Tests",
  messages: "Messages",
  
};

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [direction, setDirection] = useState(0);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [pendingLabRecs, setPendingLabRecs] = useState(0);
  const [hasYogaBooking, setHasYogaBooking] = useState(false);
  const { t } = useLanguage();
  const { user, signOut } = useAuth();
  const { canSeeTab, packageKey } = useRbac();
  const storedUser = useUserStore();
  const { counts: attentionCounts } = useAttentionCounts();

  // Prefetch sibling tabs during idle time so switches feel instant.
  useEffect(() => {
    const idle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: 2500 })
        : setTimeout(cb, 800);
    idle(() => {
      void import("./tabs/Exercise");
      void import("./tabs/Videos");
      void import("./tabs/Diet");
      void import("./tabs/Community");
      void import("./tabs/Movement");
      void import("./tabs/Profile");
      void import("./tabs/LabTests");
      void import("./tabs/Consult");
      void import("./tabs/Messages");
    });
  }, []);



  const userAvatar = storedUser?.avatarUrl || (user as any)?.user_metadata?.avatar_url;
  const userName =
    storedUser?.profile?.name ||
    (user as any)?.user_metadata?.full_name ||
    (user as any)?.user_metadata?.first_name ||
    (user as any)?.user_metadata?.name ||
    "User";
  const firstChar = userName.trim().charAt(0);
  const userInitial = /^[A-Za-z]$/.test(firstChar) ? firstChar.toUpperCase() : "U";

  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
    } finally {
      navigate("/auth", { replace: true });
      // Hard reload to clear any in-memory state
      setTimeout(() => { window.location.href = "/auth"; }, 50);
    }
  };

  const showMessagesTab = packageKey === "foundation" && hasYogaBooking;
  const ALL_TABS: Tab[] = ["home", "diet", "fasting", "habits", "exercise", "supplements", "videos", "labs", "community", "consult", "messages"];
  const tabs: Tab[] = ALL_TABS.filter((t) => {
    if (t === "messages") return showMessagesTab;
    return canSeeTab(t);
  });
  const tabAttentionCounts: Partial<Record<Tab, number>> = {
    consult: attentionCounts.patientMessages,
    videos: attentionCounts.yogaMessages,
    messages: attentionCounts.yogaMessages,
    labs: Math.max(pendingLabRecs, attentionCounts.labRecommendations),
  };

  useEffect(() => {
    document.documentElement.classList.remove("dark");
    setIsDark(false);
  }, []);

  // Guard against mobile back-gesture accidentally exiting the app / landing on
  // onboarding routes (which visually feels like a logout). We push a sentinel
  // history entry and re-push it whenever the user pops back to it.
  useEffect(() => {
    const SENTINEL = "__bbdo_dashboard__";
    try {
      window.history.pushState({ [SENTINEL]: true }, "");
    } catch {}
    const onPop = (e: PopStateEvent) => {
      // Re-push so back-gesture stays within the dashboard.
      try {
        window.history.pushState({ [SENTINEL]: true }, "");
      } catch {}
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const load = async () => {
      const { data: recRows } = await supabase
        .from("thyrocare_recommendations" as any)
        .select("id")
        .eq("user_id", user.id)
        .neq("status", "booked");
      const ids = ((recRows as any[]) ?? []).map((r) => r.id as string);
      let pending = ids.length;
      if (ids.length > 0) {
        const { data: extRows } = await supabase
          .from("external_lab_reports" as any)
          .select("recommendation_id")
          .eq("user_id", user.id)
          .in("recommendation_id", ids);
        const covered = new Set(((extRows as any[]) ?? []).map((r) => r.recommendation_id));
        pending = ids.filter((id) => !covered.has(id)).length;
      }
      if (!cancelled) setPendingLabRecs(pending);
    };
    load();
    const ch = supabase
      .channel("lab-recs-" + user.id)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "thyrocare_recommendations", filter: `user_id=eq.${user.id}` },
        load,
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "external_lab_reports", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

  // Check whether the user has an active yoga booking → enables the Messages tab
  // for foundation-package users (who have no coach and message the instructor only).
  useEffect(() => {
    if (!user) { setHasYogaBooking(false); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase
        .from("yoga_bookings" as any)
        .select("id, status")
        .eq("user_id", user.id)
        .not("status", "in", '("cancelled","completed")')
        .limit(1);
      if (!cancelled) setHasYogaBooking(((data as any) ?? []).length > 0);
    };
    load();
    const ch = supabase
      .channel("yoga-bookings-" + user.id)
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "yoga_bookings", filter: `user_id=eq.${user.id}` },
        load,
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [user]);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");

    if (requestedTab === "profile") {
      setProfileOpen(true);
      return;
    }

    if (isTab(requestedTab)) {
      if (canSeeTab(requestedTab)) {
        setActiveTab(requestedTab);
      } else {
        setActiveTab("home");
      }
    }
  }, [searchParams, canSeeTab]);

  // If active tab becomes hidden after perms load, fall back to home
  useEffect(() => {
    if (!tabs.includes(activeTab) && tabs.length > 0) {
      setActiveTab("home");
    }
  }, [tabs.join("|")]);

  // Allow child components to navigate tabs via window event.
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent<string>).detail;
      if (typeof tab === "string" && VALID_TABS.includes(tab as Tab)) {
        handleTabChange(tab as Tab);
      }
    };
    window.addEventListener("nav:set-tab", handler as EventListener);
    return () => window.removeEventListener("nav:set-tab", handler as EventListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.join("|"), activeTab]);

  // Open notifications inside the center frame (keeps sidebar visible)
  useEffect(() => {
    const openHandler = () => {
      setNotificationsOpen(true);
      window.dispatchEvent(new CustomEvent("nav:notifications-opened"));
    };
    window.addEventListener("nav:open-notifications", openHandler);
    return () => window.removeEventListener("nav:open-notifications", openHandler);
  }, []);


  const toggleTheme = () => {
    document.documentElement.classList.remove("dark");
    setIsDark(false);
  };

  const updateUrlTab = (tab: Tab) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab !== "community") {
      next.delete("share");
      next.delete("metric");
    }
    setSearchParams(next, { replace: true });
  };

  const handleTabChange = (tab: Tab) => {
    const fromIdx = tabs.indexOf(activeTab);
    const toIdx = tabs.indexOf(tab);
    setDirection(toIdx > fromIdx ? 1 : toIdx < fromIdx ? -1 : 0);
    setActiveTab(tab);
    setNotificationsOpen(false);
    updateUrlTab(tab);
  };

  const handleCloseProfile = () => {
    setProfileOpen(false);

    if (searchParams.get("tab") === "profile") {
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  };

  const openFAB = () => {
    // Trigger LogFAB open state - handled via FAB component
    const fabBtn = document.querySelector('[data-fab-trigger]') as HTMLButtonElement;
    if (fabBtn) fabBtn.click();
  };

  const tabContent: Record<Tab, React.ReactNode> = {
    home: <HomeTab onProfileOpen={() => setProfileOpen(true)} packageKey={packageKey} />,
    habits: <Movement />,
    exercise: <ExerciseTab packageKey={packageKey} />,
    fasting: <UserFasting packageKey={packageKey} />,
    supplements: <UserSupplements simpleMode={packageKey === "foundation"} />,
    videos: <Videos packageKey={packageKey} />,
    community: <Community />,
    consult: <Consult />,
    labs: <LabTestsTab foundationMode={packageKey === "foundation"} />,
    diet: <Diet />,
    messages: <Messages />,
    
  };

  return (
    <div className="h-dvh overflow-hidden bg-background flex">
      {/* ─── Sidebar (tablet + desktop) ─── */}
      <aside className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 bg-white h-dvh" style={{ boxShadow: "1px 0 0 hsl(var(--border))" }}>
        <div className="flex items-center gap-3 px-5 pt-8 pb-6" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <img src={bbdoLogo} alt="BBDO" className="w-10 h-10 rounded-full object-contain shrink-0" />
          <BbdoWordmark className="text-lg leading-none flex-1 min-w-0" />
          <SoundToggle inline />
          <NotificationCenter unreadCount={attentionCounts.notifications} />
          <button
            onClick={() => setProfileOpen(true)}
            className="w-9 h-9 rounded-full overflow-hidden border border-primary/30 bg-primary/15 flex items-center justify-center shrink-0"
            aria-label="Profile"
            data-tour="profile-btn"
          >
            {userAvatar ? (
              <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary font-black text-xs">{userInitial}</span>
            )}
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 flex-1 overflow-y-auto">
          {tabs.map((tabId) => {
            const Icon = navIcons[tabId];
            const isActive = activeTab === tabId;
            return (
              <motion.button
                key={tabId}
                onClick={() => handleTabChange(tabId)}
                className={`relative flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors w-full ${
                  isActive
                    ? "bg-[var(--bbdo-blue-soft)] text-[var(--bbdo-blue)]"
                    : "text-muted-foreground hover:bg-[var(--bbdo-surface)] hover:text-foreground"
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span className="font-medium text-sm">{navLabelOverrides[tabId] || t(tabId)}</span>
                <AttentionBadge count={tabAttentionCounts[tabId] ?? 0} className="ml-auto" />
                {isActive && (
                  <motion.div layoutId="sidebar-indicator" className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--bbdo-red)]" />
                )}
              </motion.button>
            );
          })}
        </nav>


        <div className="px-4 pb-6" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "12px" }}>
          <SidebarPackageCard />
          <button
            onClick={() => navigate("/tour")}
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-muted-foreground hover:text-[var(--bbdo-blue)] hover:bg-[var(--bbdo-blue-soft)] transition-colors w-full mb-1"
          >
            <Compass className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className="font-medium text-sm">Take the tour again</span>
          </button>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl border border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>

      </aside>

      {/* ─── Main content ─── */}
      <div className="flex-1 flex flex-col min-w-0">
        <main
          className="admin-shell flex-1 overflow-y-auto overflow-x-hidden md:pb-0"
          style={{
            paddingBottom:
              "calc(var(--kb-h, 0px) + var(--nav-clear, calc(env(safe-area-inset-bottom) + 5.25rem)))",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Mobile top header — inside the scroll area so it scrolls away with the page */}
          <div className="md:hidden flex items-center justify-between px-5 pt-[max(env(safe-area-inset-top),0.75rem)] pb-2">
            <img src={bbdoLogo} alt="BBDO" className="h-11 w-auto object-contain" />
            <div className="flex items-center gap-2">
              <NotificationCenter unreadCount={attentionCounts.notifications} />
              <button
                onClick={() => setProfileOpen(true)}
                className="w-10 h-10 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center"
                aria-label="Profile"
              >
                {userAvatar ? (
                  <img src={userAvatar} alt="Profile" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-primary font-black text-sm">{userInitial}</span>
                )}
              </button>
            </div>
          </div>

          <div className="w-full max-w-3xl xl:max-w-4xl mx-auto min-w-0">
            <AnimatePresence initial={false} mode="wait" custom={direction}>
              <motion.div
                key={notificationsOpen ? "notifications" : activeTab}
                custom={direction}
                variants={{
                  enter: (dir: number) => ({ opacity: 0, x: dir >= 0 ? 32 : -32 }),
                  center: { opacity: 1, x: 0 },
                  exit: (dir: number) => ({ opacity: 0, x: dir >= 0 ? -32 : 32 }),
                }}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              >
                {notificationsOpen ? (
                  <NotificationsPanel embedded onClose={() => setNotificationsOpen(false)} />
                ) : (
                  <Suspense fallback={<TabFallback />}>{tabContent[activeTab]}</Suspense>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </main>

        <div className="md:hidden">
          <BottomNav activeTab={activeTab} setActiveTab={handleTabChange} onFABPress={openFAB} visibleTabs={tabs} attentionCounts={tabAttentionCounts} packageKey={packageKey} />
        </div>

        {/* Desktop-only quick-log FAB */}
        <button
          onClick={openFAB}
          aria-label="Quick log"
          className="hidden md:flex fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full items-center justify-center text-white shadow-lift active:scale-[0.98] transition-transform hover:opacity-90"
          style={{ background: "var(--bbdo-red)" }}
        >
          <Plus className="w-6 h-6" strokeWidth={2.2} />
        </button>
      </div>

      <LogFAB packageKey={packageKey} />

      <AnimatePresence>
        {profileOpen && (
          <motion.div
            className="fixed inset-0 z-50 bg-background overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1]}}
          >
            <div className="max-w-3xl mx-auto">
               <Suspense fallback={<TabFallback />}>
                 <Profile onClose={handleCloseProfile} isDark={isDark} onToggleTheme={toggleTheme} />
               </Suspense>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
