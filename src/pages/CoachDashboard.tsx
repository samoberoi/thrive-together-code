import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Users, LogOut, Timer, Pill, MessageCircle, FlaskConical, Calendar, MessageSquareWarning, Activity } from "lucide-react";
import NotificationCenter from "@/components/NotificationCenter";
import SoundToggle from "@/components/SoundToggle";
import CoachCommissionCard from "@/components/CoachCommissionCard";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import CoachHome from "./coach/CoachHome";
import CoachPatients from "./coach/CoachPatients";
import CoachProfile from "./coach/CoachProfile";
import CoachGuidedTour from "./coach/CoachGuidedTour";
import CoachFasting from "./coach/CoachFasting";
import CoachSupplements from "./coach/CoachSupplements";
import CoachLabTests from "./coach/CoachLabTests";
import CoachMeetings from "./coach/CoachMeetings";
import CoachMove from "./coach/CoachMove";
import CoachConsultationRequests from "./coach/CoachConsultationRequests";
import CoachInbox from "@/components/chat/CoachInbox";
import NotificationsPanel from "@/components/NotificationsPanel";
import { useAttentionCounts } from "@/hooks/useAttentionCounts";
import AttentionBadge from "@/components/attention/AttentionBadge";
import { RoleBottomNav, RoleTopBar, type RoleNavItem } from "@/components/shared";

export type CoachTab = "home" | "patients" | "meetings" | "requests" | "messages" | "fasting" | "supplements" | "move" | "labtests" | "profile";

const navItems: { id: CoachTab; icon: React.ElementType; label: string }[] = [
  { id: "home", icon: Home, label: "Home" },
  { id: "patients", icon: Users, label: "Patients" },
  { id: "meetings", icon: Calendar, label: "Meetings" },
  { id: "requests", icon: MessageSquareWarning, label: "Requests" },
  { id: "messages", icon: MessageCircle, label: "Messages" },
  { id: "fasting", icon: Timer, label: "Fasting" },
  { id: "supplements", icon: Pill, label: "Supplements" },
  { id: "move", icon: Activity, label: "Move" },
  { id: "labtests", icon: FlaskConical, label: "Lab Tests" },
];

export default function CoachDashboard() {
  const [activeTab, setActiveTab] = useState<CoachTab>("home");
  const [chatPatientId, setChatPatientId] = useState<string | null>(null);
  const [showTour, setShowTour] = useState(false);
  const [tourReplay, setTourReplay] = useState(false);
  const [coachMeta, setCoachMeta] = useState<{ id: string; name: string; tourDone: boolean; avatarUrl: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { counts: attentionCounts } = useAttentionCounts();

  const tabAttentionCounts: Partial<Record<CoachTab, number>> = {
    messages: attentionCounts.coachMessages,
    requests: attentionCounts.consultationRequests,
  };

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("coaches" as any)
        .select("id, name, tour_completed_at, avatar_url")
        .eq("user_id", user.id)
        .single();
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
      setActiveTab(tab);
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
    setActiveTab("messages");
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
    home: <CoachHome onViewPatient={() => setActiveTab("patients")} onViewFasting={() => setActiveTab("fasting")} />,
    patients: <CoachPatients onChatWithPatient={handleChatWithPatient} />,
    meetings: <CoachMeetings />,
    requests: <CoachConsultationRequests />,
    messages: coachMeta ? <CoachInbox coachId={coachMeta.id} openPatientId={chatPatientId} /> : null,
    fasting: <CoachFasting />,
    supplements: <CoachSupplements />,
    move: <CoachMove />,
    labtests: <CoachLabTests />,
    profile: <CoachProfile onSignOut={handleSignOut} onReplayTour={handleReplayTour} />,
  };

  return (
    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Sidebar (tablet + desktop) */}
      <aside className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 bg-muted h-dvh" style={{ boxShadow: "1px 0 0 hsl(var(--border))" }}>
        <div className="flex items-center gap-3 px-6 pt-8 pb-6" style={{ borderBottom: "1px solid hsl(var(--border))" }}>
          <div className="w-10 h-10 rounded-xl gradient-blue glow-blue flex items-center justify-center shrink-0">
            <span className="text-white font-black text-base tracking-tighter">BB</span>
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-foreground font-black text-lg leading-none">bye bye</h1>
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
                  setActiveTab(item.id);
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
          onProfileClick={() => setActiveTab("profile")}
          notificationCount={attentionCounts.notifications}
          right={<SoundToggle inline />}
        />
        <main className="admin-shell flex-1 overflow-y-auto overflow-x-hidden pb-28 md:pb-0">
          <div className="w-full max-w-3xl xl:max-w-4xl mx-auto">
            <AnimatePresence initial={false} mode="wait">
              {notificationsOpen ? (
                <motion.div
                  key="notifications"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  <NotificationsPanel embedded onClose={() => setNotificationsOpen(false)} />
                </motion.div>
              ) : (
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                >
                  {tabContent[activeTab]}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* Mobile bottom dock — consistent with end-user role (no FAB for coach) */}
        <RoleBottomNav<CoachTab>
          active={activeTab}
          onSelect={(tab) => {
            setActiveTab(tab);
            setNotificationsOpen(false);
          }}
          items={navItems.map((n) => ({
            id: n.id,
            icon: n.icon,
            label: n.label,
            badge: tabAttentionCounts[n.id] ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
