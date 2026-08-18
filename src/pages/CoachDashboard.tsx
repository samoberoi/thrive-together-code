import { useState, useEffect, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { Home, Users, LogOut, Timer, Pill, MessageCircle, FlaskConical, Calendar, MessageSquareWarning, Activity, Dumbbell, Flower2, Heart, Apple } from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import SoundToggle from "@/components/SoundToggle";
import CoachCommissionCard from "@/components/CoachCommissionCard";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { resolveCurrentCoach } from "@/lib/coachService";
import CoachGuidedTour from "./coach/CoachGuidedTour";
import logoImg from "@/assets/logo.png";

// Lazy: coach panels mount on first visit, so each gets its own chunk.
const Community = lazy(() => import("./tabs/Community"));
const CoachHome = lazy(() => import("./coach/CoachHome"));
const CoachPatients = lazy(() => import("./coach/CoachPatients"));
const CoachProfile = lazy(() => import("./coach/CoachProfile"));
const CoachFasting = lazy(() => import("./coach/CoachFasting"));
const CoachSupplements = lazy(() => import("./coach/CoachSupplements"));
const CoachLabTests = lazy(() => import("./coach/CoachLabTests"));
const CoachMeetings = lazy(() => import("./coach/CoachMeetings"));
const CoachMove = lazy(() => import("./coach/CoachMove"));
const CoachFood = lazy(() => import("./coach/CoachFood"));
const ExerciseTab = lazy(() => import("./tabs/Exercise"));
const Videos = lazy(() => import("./tabs/Videos"));
const CoachConsultationRequests = lazy(() => import("./coach/CoachConsultationRequests"));
const CoachInbox = lazy(() => import("@/components/chat/CoachInbox"));

import NotificationsPanel from "@/components/NotificationsPanel";
import LogFAB from "@/components/LogFAB";
import { useAttentionCounts } from "@/hooks/useAttentionCounts";
import { useCoachModuleNavigation } from "@/lib/coachNav";
import AttentionBadge from "@/components/attention/AttentionBadge";

import { RoleBottomNav, RoleTopBar, type RoleNavItem } from "@/components/shared";

export type CoachTab = "home" | "patients" | "meetings" | "requests" | "messages" | "community" | "fasting" | "food" | "supplements" | "move" | "train" | "yoga" | "labtests" | "profile";

const navItems: { id: CoachTab; icon: React.ElementType; label: string }[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "patients", icon: Users, label: "Patients" },
  { id: "meetings", icon: Calendar, label: "Meetings" },
  { id: "messages", icon: MessageCircle, label: "Messages" },
  { id: "community", icon: Heart, label: "Community" },
  { id: "fasting", icon: Timer, label: "Fasting" },
  { id: "food", icon: Apple, label: "Food" },
  { id: "supplements", icon: Pill, label: "Supplements" },
  { id: "move", icon: Activity, label: "Move" },
  { id: "train", icon: Dumbbell, label: "Train" },
  { id: "yoga", icon: Flower2, label: "Yoga" },
  { id: "labtests", icon: FlaskConical, label: "Lab Tests" },
];

export default function CoachDashboard() {
  const [activeTab, setActiveTab] = useState<CoachTab>("home");
  const [visitedTabs, setVisitedTabs] = useState<Set<CoachTab>>(new Set(["home"]));
  const [chatPatientId, setChatPatientId] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourReplay, setTourReplay] = useState(false);
  const [coachMeta, setCoachMeta] = useState<{ id: string; name: string; tourDone: boolean; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, signOut } = useAuth();

  const selectTab = (tab: CoachTab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set(prev).add(tab)));
  };
  useCoachModuleNavigation((tab) => selectTab(tab as CoachTab));

  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { counts: attentionCounts } = useAttentionCounts();

  const tabAttentionCounts: Partial<Record<CoachTab, number>> = {
    messages: attentionCounts.coachMessages,
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const data = await resolveCurrentCoach(user, "id, name, tour_completed_at, avatar_url");
      if (data) {
        const d = data as any;
        const tourDone = !!d.tour_completed_at;
        setCoachMeta({ id: d.id, name: d.name, tourDone, avatarUrl: d.avatar_url ?? null });
        if (!tourDone) {
          setShowTour(true);
          setTourReplay(false);
        }
      }
      setLoading(false);
    })();
  }, [user]);

  useEffect(() => {
    const tab = searchParams.get("tab") as CoachTab | null;
    if (tab && navItems.some((item) => item.id === tab)) {
      selectTab(tab);
      setNotificationsOpen(false);
    }
  }, [searchParams]);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const handleTourComplete = () => {
    setShowTour(false);
    if (coachMeta) setCoachMeta({ ...coachMeta, tourDone: true });
  };

  const handleReplayTour = () => {
    setTourReplay(true);
    setShowTour(true);
  };

  const handleChatWithPatient = (patientId: string) => {
    setChatPatientId(patientId);
    selectTab("messages");
  };

  // Clear chatPatientId when leaving messages tab
  useEffect(() => {
    if (activeTab !== "messages") setChatPatientId(null);
  }, [activeTab]);

  // Open notifications panel when bell is clicked
  useEffect(() => {
    const openHandler = () => {
      window.dispatchEvent(new CustomEvent("nav:notifications-opened"));
      setNotificationsOpen(true);
    };
    window.addEventListener("nav:open-notifications", openHandler);
    return () => window.removeEventListener("nav:open-notifications", openHandler);
  }, []);

  if (loading) return null;

  if (showTour && coachMeta) {
    return (
      <CoachGuidedTour
        coachId={coachMeta.id}
        coachName={coachMeta.name}
        onComplete={handleTourComplete}
        onClose={tourReplay ? handleTourComplete : undefined}
        isReplay={tourReplay}
      />
    );
  }

  const tabContent: Record<CoachTab, React.ReactNode> = {
    home: <CoachHome onViewPatient={() => selectTab("patients")} onViewFasting={() => selectTab("fasting")} onViewMessages={() => selectTab("messages")} onViewLabTests={() => selectTab("labtests")} />,
    patients: <CoachPatients onChatWithPatient={handleChatWithPatient} />,
    meetings: <CoachMeetings />,
    requests: <CoachConsultationRequests />,
    messages: coachMeta ? <CoachInbox coachId={coachMeta.id} openPatientId={chatPatientId} /> : null,
    community: <Community />,
    fasting: <CoachFasting />,
    food: <CoachFood />,
    supplements: <CoachSupplements />,
    move: <CoachMove />,
    train: <ExerciseTab packageKey="intensive" />,
    yoga: <Videos packageKey="intensive" />,
    labtests: <CoachLabTests />,
    profile: <CoachProfile onSignOut={handleSignOut} onReplayTour={handleReplayTour} />,
  };
  const allTabs = Object.keys(tabContent) as CoachTab[];

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Sidebar (tablet + desktop) */}
      <aside className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 bg-muted h-dvh" style={{ boxShadow: "1px 0 0 hsl(var(--border))" }}>
        <div className="flex items-center gap-3 px-6 pt-8 pb-6" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <img src={logoImg} alt="BBDO" className="h-10 w-auto object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-muted-foreground text-xs">Coach Portal</p>
          </div>

          <SoundToggle inline />
          <NotificationCenter unreadCount={attentionCounts.notifications} />
          <button
            onClick={() => setActiveTab("profile")}
            aria-label="Profile"
            className={`w-9 h-9 rounded-full overflow-hidden border flex items-center justify-center shrink-0 transition-colors ${
              activeTab === "profile" ? "border-primary bg-primary/15" : "border-border bg-muted"
            }`}
          >
            {coachMeta?.avatarUrl ? (
              <img src={coachMeta.avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-primary font-black text-xs">
                {(coachMeta?.name?.[0] ?? "C").toUpperCase()}
              </span>
            )}
          </button>
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 flex-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => {
                  selectTab(item.id);
                  setNotificationsOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors w-full ${
                  isActive
                    ? "liquid-glass bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
                whileTap={{ scale: 0.98 }}
              >
                <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                <span className="font-medium text-sm">{item.label}</span>
                <AttentionBadge count={tabAttentionCounts[item.id] ?? 0} className="ml-auto" />
                {isActive && (tabAttentionCounts[item.id] ?? 0) === 0 && (
                  <motion.div layoutId="coach-sidebar-indicator" className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />
                )}
              </motion.button>
            );
          })}

        </nav>

        <div className="px-4 pb-6" style={{ borderTop: "1px solid hsl(var(--border))", paddingTop: "12px" }}>
          <CoachCommissionCard />
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-2.5 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <RoleTopBar
          roleLabel="Coach Portal"
          avatarUrl={coachMeta?.avatarUrl}
          avatarInitial={coachMeta?.name?.[0] ?? "C"}
          profileActive={activeTab === "profile"}
          onProfileClick={() => selectTab("profile")}
          notificationCount={attentionCounts.notifications}
          right={<SoundToggle inline />}
        />
        <main className="admin-shell flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--nav-clear,5rem)+1rem)] md:pb-0">
          <div className="w-full max-w-3xl xl:max-w-4xl mx-auto">
            {notificationsOpen ? (
              <NotificationsPanel embedded onClose={() => setNotificationsOpen(false)} />
            ) : (
              // Keep already-visited tabs mounted so switching feels instant.
              // Inactive panels are hidden but retain their fetched data and scroll position.
              allTabs.map((tab) =>
                visitedTabs.has(tab) ? (
                  <div key={tab} hidden={activeTab !== tab} aria-hidden={activeTab !== tab}>
                    <Suspense fallback={<div className="p-8 text-sm text-muted-foreground">Loading…</div>}>
                      {tabContent[tab]}
                    </Suspense>
                  </div>
                ) : null
              )

            )}
          </div>
        </main>

        {/* Mobile bottom dock — consistent with end-user role (no FAB for coach) */}
        <RoleBottomNav<CoachTab>
          active={activeTab}
          onSelect={(tab) => {
            selectTab(tab);
            setNotificationsOpen(false);
          }}
          onFABPress={() => {
            const fabBtn = document.querySelector('[data-fab-trigger]') as HTMLButtonElement | null;
            fabBtn?.click();
          }}
          items={navItems.map((n) => ({
            id: n.id,
            icon: n.icon,
            label: n.label,
            badge: tabAttentionCounts[n.id] ?? 0,
          }))}
        />

        {/* Desktop-only quick-log FAB */}
        <button
          onClick={() => {
            const fabBtn = document.querySelector('[data-fab-trigger]') as HTMLButtonElement | null;
            fabBtn?.click();
          }}
          aria-label="Quick log"
          className="hidden md:flex fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full items-center justify-center text-white shadow-lift active:scale-[0.98] transition-transform hover:opacity-90"
          style={{ background: "var(--bbdo-red)" }}
        >
          <Activity className="w-6 h-6" strokeWidth={2} />
        </button>
        <LogFAB exercisePath="/coach-dashboard?tab=train" showAllLogs />
      </div>
    </div>
  );
}
