import { useEffect, useState, useRef, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  Users,
  UserCheck,
  CreditCard,
  Link2,
  LogOut,
  Shield,
  ShieldCheck,
  Video,
  Timer,
  Pill,
  HeartPulse,
  
  FlaskConical,
  Footprints,
  Package as PackageIcon,
  Settings2,
  ChevronDown,
  ScrollText,
  Languages as LanguagesIcon,
  Percent,
  MessageSquare,
  Gift,
  Palette,
  Bell,
  Handshake,
  Dumbbell,
  Flame,
  TrendingUp,
  Salad,
  User as UserIcon,
  Mail,
  CalendarDays,
  Scale,
  Gauge,
  Ticket,
  Monitor,
  UtensilsCrossed,
  Camera,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";


import NotificationCenter from "@/components/NotificationCenter";
import SoundToggle from "@/components/SoundToggle";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { isAdminUser } from "@/lib/roleService";
import { useIsMobile } from "@/hooks/use-mobile";
import logoImg from "@/assets/logo.png";

// Lazy: each admin panel is its own chunk so end users (and the admin's first
// paint) don't download every screen up front.
const AdminOverview = lazy(() => import("./admin/AdminOverview"));
const AdminUsers = lazy(() => import("./admin/AdminUsers"));
const AdminCoaches = lazy(() => import("./admin/AdminCoaches"));
const AdminSubscriptions = lazy(() => import("./admin/AdminSubscriptions"));
const AdminAssignments = lazy(() => import("./admin/AdminAssignments"));
const AdminVideos = lazy(() => import("./admin/AdminVideos"));
const AdminFasting = lazy(() => import("./admin/AdminFasting"));
const AdminSupplements = lazy(() => import("./admin/AdminSupplements"));
const AdminLabTests = lazy(() => import("./admin/AdminLabTests"));
const AdminFoodConditionRules = lazy(() => import("./admin/AdminFoodConditionRules"));
const AdminRBAC = lazy(() => import("./admin/AdminRBAC"));
const AdminMovement = lazy(() => import("./admin/AdminMovement"));
const AdminPackages = lazy(() => import("./admin/AdminPackages"));
const AdminAdmins = lazy(() => import("./admin/AdminAdmins"));
const AdminLogs = lazy(() => import("./admin/AdminLogs"));
const AdminLanguages = lazy(() => import("./admin/AdminLanguages"));
const AdminCommissions = lazy(() => import("./admin/AdminCommissions"));
const AdminCommunityCategories = lazy(() => import("./admin/AdminCommunityCategories"));
const AdminReferrals = lazy(() => import("./admin/AdminReferrals"));
const AdminCommunity = lazy(() => import("./admin/AdminCommunity"));
const AdminColorGauges = lazy(() => import("./admin/AdminColorGauges"));
const AdminNotificationManager = lazy(() => import("./admin/AdminNotificationManager"));
const AdminChannelPartners = lazy(() => import("./admin/AdminChannelPartners"));
const AdminExercises = lazy(() => import("./admin/AdminExercises"));
const AdminGlobalStreak = lazy(() => import("./admin/AdminGlobalStreak"));
const AdminPnl = lazy(() => import("./admin/AdminPnl"));
const AdminDietTypes = lazy(() => import("./admin/AdminDietTypes"));
const AdminBmiCategories = lazy(() => import("./admin/AdminBmiCategories"));
const AdminOnboardingGrades = lazy(() => import("./admin/AdminOnboardingGrades"));
const AdminCoupons = lazy(() => import("./admin/AdminCoupons"));
const AdminDiet = lazy(() => import("./admin/AdminDiet"));

// Admin self-tracking (same modules patients & coaches use).
import AdminSelfTabs from "@/components/admin/AdminSelfTabs";
const UserSupplements = lazy(() => import("@/components/UserSupplements"));
const UserFasting = lazy(() => import("@/components/UserFasting"));
const PatientLabTests = lazy(() => import("@/components/PatientLabTests"));
const UserDiet = lazy(() => import("./tabs/Diet"));


import NotificationsPanel from "@/components/NotificationsPanel";
import { useAttentionCounts } from "@/hooks/useAttentionCounts";
import { RoleBottomNav, RoleTopBar, type RoleNavItem } from "@/components/shared";

export type AdminTab =
  | "overview"
  | "users"
  | "coaches"
  | "admins"
  | "diet"
  | "food_config"
  | "supplements"
  
  | "food_condition_rules"
  | "fasting"
  | "movement"
  | "labtests"
  | "videos"
  | "exercises"
  | "rbac"
  | "subscriptions"
  | "packages"
  | "assignments"
  | "languages"
  | "commissions"
  | "community_categories"
  | "community"
  | "referrals"
  | "logs"
  | "color_gauges"
  | "notifications"
  | "channel_partners"
  | "global_streak"
  | "pnl"
  | "diet_types"
  | "bmi"
  | "onboarding_grades"
  | "coupons"
  
  | "profile";


type LeafItem = { kind: "leaf"; id: AdminTab; icon: React.ElementType; label: string };
type GroupItem = {
  kind: "group";
  id: string;
  icon: React.ElementType;
  label: string;
  children: { id: AdminTab; icon: React.ElementType; label: string }[];
};
type NavItem = LeafItem | GroupItem;

const navItems: NavItem[] = [
  { kind: "leaf", id: "overview", icon: LayoutDashboard, label: "Overview" },
  { kind: "leaf", id: "subscriptions", icon: CreditCard, label: "Subscriptions" },
  {
    kind: "group",
    id: "diet-group",
    icon: Salad,
    label: "Diet",
    children: [
      { id: "diet", icon: Salad, label: "My Plates" },
      { id: "food_config", icon: UtensilsCrossed, label: "Food Configuration" },
      { id: "food_condition_rules", icon: HeartPulse, label: "Food ↔ Conditions" },
    ],
  },
  { kind: "leaf", id: "supplements", icon: Pill, label: "Supplements" },
  { kind: "leaf", id: "fasting", icon: Timer, label: "Fasting" },
  { kind: "leaf", id: "movement", icon: Footprints, label: "Movement" },
  { kind: "leaf", id: "labtests", icon: FlaskConical, label: "Lab Tests" },
  { kind: "leaf", id: "videos", icon: Video, label: "Stress & Yoga" },
  { kind: "leaf", id: "exercises", icon: Dumbbell, label: "Exercise" },
  { kind: "leaf", id: "community", icon: MessageSquare, label: "Community" },
  
  {
    kind: "group",
    id: "control-center",
    icon: Settings2,
    label: "Control Center",
    children: [
      { id: "users", icon: Users, label: "Users" },
      { id: "coaches", icon: UserCheck, label: "Coaches" },
      { id: "admins", icon: ShieldCheck, label: "Super Admins" },
      { id: "rbac", icon: Shield, label: "Access Control" },
      { id: "packages", icon: PackageIcon, label: "Packages" },
      { id: "assignments", icon: Link2, label: "Assignments" },
      { id: "languages", icon: LanguagesIcon, label: "Languages" },
      { id: "commissions", icon: Percent, label: "Commissions" },
      { id: "community_categories", icon: MessageSquare, label: "Community Categories" },
      { id: "referrals", icon: Gift, label: "Referrals" },
      { id: "logs", icon: ScrollText, label: "Logs" },
      { id: "color_gauges", icon: Palette, label: "Color Gauge Manager" },
      { id: "notifications", icon: Bell, label: "Notification Manager" },
      { id: "channel_partners", icon: Handshake, label: "Channel Partners" },
      { id: "global_streak", icon: Flame, label: "Global Streak" },
      { id: "pnl", icon: TrendingUp, label: "P&L Manager" },
      { id: "diet_types", icon: Salad, label: "Diet Types" },
      { id: "bmi", icon: Scale, label: "BMI Categories" },
      { id: "onboarding_grades", icon: Gauge, label: "Onboarding Grading" },
      { id: "coupons", icon: Ticket, label: "Coupon Manager" },
    ],
  },
];


const tabContentMap: Record<AdminTab, React.ReactNode> = {
  overview: <AdminOverview />,
  users: <AdminUsers />,
  coaches: <AdminCoaches />,
  admins: <AdminAdmins />,
  diet: <UserDiet planOverride="intensive" />,
  food_config: <AdminDiet />,

  supplements: (
    <AdminSelfTabs manageLabel="Catalog" mineLabel="My Supplements" mineIcon={Pill} manage={<AdminSupplements />} mine={<UserSupplements simpleMode />} />
  ),
  
  food_condition_rules: <AdminFoodConditionRules />,
  fasting: (
    <AdminSelfTabs manageLabel="Protocols" mineLabel="My Fasting" mineIcon={Timer} manage={<AdminFasting />} mine={<UserFasting packageKey="intensive" selfServe />} />
  ),
  movement: <AdminMovement />,
  labtests: (
    <AdminSelfTabs manageLabel="Catalog" mineLabel="My Tests" mineIcon={FlaskConical} manage={<AdminLabTests />} mine={<PatientLabTests alwaysShow foundationMode />} />
  ),

  videos: <AdminVideos />,
  exercises: <AdminExercises />,
  rbac: <AdminRBAC />,
  subscriptions: <AdminSubscriptions />,
  packages: <AdminPackages />,
  assignments: <AdminAssignments />,
  languages: <AdminLanguages />,
  commissions: <AdminCommissions />,
  community_categories: <AdminCommunityCategories />,
  community: <AdminCommunity />,
  referrals: <AdminReferrals />,
  logs: <AdminLogs />,
  color_gauges: <AdminColorGauges />,
  notifications: <AdminNotificationManager />,
  channel_partners: <AdminChannelPartners />,
  global_streak: <AdminGlobalStreak />,
  pnl: <AdminPnl />,
  diet_types: <AdminDietTypes />,
  bmi: <AdminBmiCategories />,
  onboarding_grades: <AdminOnboardingGrades />,
  coupons: <AdminCoupons />,
  
  profile: null,
};

const adminTabs = new Set<AdminTab>([
  "overview",
  "users",
  "coaches",
  "admins",
  "diet",
  "food_config",
  "supplements",
  "food_condition_rules",
  "fasting",
  "movement",
  "labtests",
  "videos",
  "exercises",
  "rbac",
  "subscriptions",
  "packages",
  "assignments",
  "languages",
  "commissions",
  "community_categories",
  "community",
  "referrals",
  "logs",
  "color_gauges",
  "notifications",
  "channel_partners",
  "global_streak",
  "pnl",
  "diet_types",
  "bmi",
  "onboarding_grades",
  "coupons",
  
  "profile",
]);

const getTabFromParams = (params: URLSearchParams): AdminTab => {
  const requested = params.get("tab") as AdminTab | null;
  return requested && adminTabs.has(requested) ? requested : "overview";
};

const controlCenterTabs = new Set<AdminTab>([
  "users",
  "coaches",
  "admins",
  "rbac",
  "packages",
  "assignments",
  "languages",
  "commissions",
  "community_categories",
  "referrals",
  "logs",
  "color_gauges",
  "notifications",
  "channel_partners",
  "global_streak",
  "pnl",
  "diet_types",
  "bmi",
  "onboarding_grades",
  "coupons",
]);

/**
 * Control Center is a web-only surface: the phone app stays focused on the
 * day-to-day modules. Users & Coaches stay on mobile because admins need them
 * on the go.
 */
const desktopOnlyTabs = new Set<AdminTab>(
  [...controlCenterTabs, "food_config" as AdminTab].filter((t) => t !== "users" && t !== "coaches"),
);

const supplementTabs = new Set<AdminTab>(["supplements"]);
const dietTabs = new Set<AdminTab>(["diet", "food_config", "food_condition_rules"]);

function AdminProfileView({
  email,
  initial,
  avatarUrl,
  uploading,
  onPickPhoto,
  onSignOut,
  onOpenAdmins,
  onOpenRBAC,
  onOpenNotifications,
}: {
  email: string | null | undefined;
  initial: string;
  avatarUrl: string | null;
  uploading: boolean;
  onPickPhoto: (file: File) => void;
  onSignOut: () => void;
  onOpenAdmins: () => void;
  onOpenRBAC: () => void;
  onOpenNotifications: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // Phone-auth uses shadow emails like `{phone}@bbd.app`; show the phone if we can extract it.
  const shadowMatch = email?.match(/^(\d{7,15})@bbd\.app$/i);
  const phone = shadowMatch ? shadowMatch[1] : null;
  const displayIdentity = phone ? `+91 ${phone}` : email ?? "Admin";
  const secondaryLabel = phone ? `+91 ${phone}` : email ?? "—";
  return (
    <div className="p-5 space-y-5">
      <div
        className="rounded-3xl p-6 flex items-center gap-4"
        style={{ background: "var(--bbdo-blue-soft)", border: "1px solid var(--bbdo-line)" }}
      >
        <div className="relative shrink-0">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center overflow-hidden"
            style={{ background: "var(--bbdo-blue)", color: "#fff" }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="font-black text-2xl">{initial}</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            aria-label="Change profile photo"
            className="absolute -bottom-1.5 -right-1.5 w-7 h-7 rounded-full bg-card border border-border flex items-center justify-center shadow-sm"
          >
            {uploading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            ) : (
              <Camera className="w-3.5 h-3.5 text-primary" />
            )}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPickPhoto(f);
              e.target.value = "";
            }}
          />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">
            Super Admin
          </div>
          <div className="text-lg font-black text-foreground leading-tight truncate">
            {displayIdentity}
          </div>
          <div className="mt-1 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Mail className="w-3.5 h-3.5" strokeWidth={1.8} />
            <span className="truncate">{secondaryLabel}</span>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        <button
          onClick={onOpenAdmins}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors"
        >
          <ShieldCheck className="w-5 h-5 text-primary" strokeWidth={1.8} />
          <span className="flex-1 text-sm font-semibold text-foreground">Manage Super Admins</span>
          <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground" />
        </button>
        <div className="h-px bg-border mx-4" />
        <button
          onClick={onOpenRBAC}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors"
        >
          <Shield className="w-5 h-5 text-primary" strokeWidth={1.8} />
          <span className="flex-1 text-sm font-semibold text-foreground">Access Control (RBAC)</span>
          <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground" />
        </button>
        <div className="h-px bg-border mx-4" />
        <button
          onClick={onOpenNotifications}
          className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-accent transition-colors"
        >
          <Bell className="w-5 h-5 text-primary" strokeWidth={1.8} />
          <span className="flex-1 text-sm font-semibold text-foreground">Notification Manager</span>
          <ChevronDown className="w-4 h-4 -rotate-90 text-muted-foreground" />
        </button>
      </div>

      <button
        onClick={onSignOut}
        className="w-full flex items-center justify-center gap-2 h-12 rounded-2xl font-semibold text-sm transition-colors"
        style={{
          background: "hsl(var(--destructive) / 0.08)",
          color: "hsl(var(--destructive))",
          border: "1px solid hsl(var(--destructive) / 0.2)",
        }}
      >
        <LogOut className="w-4 h-4" strokeWidth={2} />
        Sign Out
      </button>
    </div>
  );
}

export default function AdminDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<AdminTab>(() => getTabFromParams(searchParams));
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "supplements-group": false,
    "control-center": false,
  });
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { counts: attentionCounts } = useAttentionCounts();
  const adminInitial = (user?.email?.[0] ?? "A").toUpperCase();
  const [adminAllowed, setAdminAllowed] = useState<boolean | null>(null);
  const [adminAvatar, setAdminAvatar] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user) { setAdminAllowed(null); return; }
    isAdminUser(user.id).then((ok) => { if (!cancelled) setAdminAllowed(ok); });
    return () => { cancelled = true; };
  }, [user]);

  // Load the admin's own profile photo (same `profiles.avatar_url` the community feed reads)
  useEffect(() => {
    let cancelled = false;
    if (!user) { setAdminAvatar(null); return; }
    supabase
      .from("profiles")
      .select("avatar_url")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAdminAvatar((data as any)?.avatar_url ?? null);
      });
    return () => { cancelled = true; };
  }, [user]);

  const handleAvatarUpload = useCallback(async (file: File) => {
    if (!user) return;
    if (!file.type.startsWith("image/")) { toast.error("Please choose an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Image must be under 5 MB"); return; }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${publicUrl}?v=${Date.now()}`;
      const { error: profErr } = await supabase
        .from("profiles")
        .update({ avatar_url: url } as any)
        .eq("user_id", user.id);
      if (profErr) throw profErr;
      setAdminAvatar(url);
      toast.success("Profile photo updated");
    } catch (e: any) {
      toast.error(e?.message || "Upload failed");
    } finally {
      setAvatarUploading(false);
    }
  }, [user]);



  useEffect(() => {
    const requestedTab = getTabFromParams(searchParams);
    setActiveTab(requestedTab);
    if (controlCenterTabs.has(requestedTab)) {
      setOpenGroups((prev) => ({ ...prev, "control-center": true }));
    }
    if (supplementTabs.has(requestedTab)) {
      setOpenGroups((prev) => ({ ...prev, "supplements-group": true }));
    }
    if (dietTabs.has(requestedTab)) {
      setOpenGroups((prev) => ({ ...prev, "diet-group": true }));
    }
  }, [searchParams]);

  useEffect(() => {
    const openHandler = () => {
      window.dispatchEvent(new CustomEvent("nav:notifications-opened"));
      setNotificationsOpen(true);
    };
    window.addEventListener("nav:open-notifications", openHandler);
    return () => window.removeEventListener("nav:open-notifications", openHandler);
  }, []);

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth", { replace: true });
  };

  const toggleGroup = (id: string) =>
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));

  const groupHasActive = (g: GroupItem) => g.children.some((c) => c.id === activeTab);

  const selectTab = (tab: AdminTab) => {
    setActiveTab(tab);
    setNotificationsOpen(false);
    const next = new URLSearchParams(searchParams);
    next.set("tab", tab);
    if (tab !== "subscriptions") {
      ["subscriptionTab", "view", "plan", "package", "metric"].forEach((key) => next.delete(key));
    }
    setSearchParams(next);
  };

  // Admin-only area: without this guard a coach/patient session can open the
  // console and every write fails later with a raw row-level-security error.
  if (adminAllowed === false) {
    return (
      <div className="h-dvh bg-background flex flex-col items-center justify-center gap-3 px-8 text-center">
        <Shield className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
        <h1 className="text-lg font-black text-foreground">Admin access required</h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          This account doesn’t have admin rights, so changes here can’t be saved. Sign in with your
          admin account to continue.
        </p>
        <button
          onClick={handleSignOut}
          className="mt-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
        >
          Sign in as admin
        </button>
      </div>
    );
  }
  if (adminAllowed === null) return null;

  return (

    <div className="h-dvh bg-background flex overflow-hidden">
      {/* Sidebar */}
      <aside
        className="hidden md:flex flex-col w-64 xl:w-72 shrink-0 bg-muted h-dvh"
        style={{ boxShadow: "1px 0 0 hsl(var(--border))" }}
      >
        <div
          className="flex items-center gap-3 px-6 pt-8 pb-6"
          style={{ borderBottom: "1px solid hsl(var(--border))" }}
        >
          <img src={logoImg} alt="BBDO" className="h-10 w-auto object-contain shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-muted-foreground text-xs">Super Admin</p>
          </div>

          <SoundToggle inline />
          <NotificationCenter unreadCount={attentionCounts.notifications} />
        </div>

        <nav className="flex flex-col gap-1 px-3 py-4 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.kind === "leaf") {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <motion.button
                  key={item.id}
                  onClick={() => {
                    selectTab(item.id);
                  }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors w-full",
                    isActive
                      ? "liquid-glass bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  whileTap={{ scale: 0.98 }}
                >
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={isActive ? 2 : 1.5} />
                  <span className="font-medium text-sm">{item.label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="admin-sidebar-indicator"
                      className="ml-auto w-1.5 h-1.5 rounded-full bg-primary"
                    />
                  )}
                </motion.button>
              );
            }
            const Icon = item.icon;
            const isOpen = openGroups[item.id] || groupHasActive(item);
            const hasActive = groupHasActive(item);
            return (
              <div key={item.id}>
                <motion.button
                  onClick={() => {
                    toggleGroup(item.id);
                    setNotificationsOpen(false);
                  }}
                  whileTap={{ scale: 0.98 }}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-2xl text-left transition-colors w-full",
                    hasActive
                      ? "text-primary"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <Icon className="w-5 h-5 shrink-0" strokeWidth={hasActive ? 2 : 1.5} />
                  <span className="font-medium text-sm flex-1">{item.label}</span>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 transition-transform",
                      isOpen ? "rotate-0" : "-rotate-90"
                    )}
                  />
                </motion.button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="flex flex-col gap-1 pl-6 pr-1 mt-1">
                        {item.children.map((child) => {
                          const CIcon = child.icon;
                          const cActive = activeTab === child.id;
                          return (
                            <motion.button
                              key={child.id}
                              onClick={() => {
                                selectTab(child.id);
                              }}
                              whileTap={{ scale: 0.98 }}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-xl text-left transition-colors w-full text-sm",
                                cActive
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
                              )}
                            >
                              <CIcon className="w-4 h-4 shrink-0" strokeWidth={cActive ? 2 : 1.5} />
                              <span>{child.label}</span>
                            </motion.button>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </nav>

        <div className="px-4 pb-6">
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-4 py-3 rounded-2xl text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="w-5 h-5 shrink-0" strokeWidth={1.5} />
            <span className="font-medium text-sm">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <RoleTopBar
          roleLabel="Super Admin"
          avatarInitial={adminInitial}
          avatarUrl={adminAvatar}
          profileActive={activeTab === "profile"}
          onProfileClick={() => selectTab("profile")}
          notificationCount={attentionCounts.notifications}
        />
        <main className="admin-shell flex-1 overflow-y-auto overflow-x-hidden pb-[calc(var(--nav-clear,5rem)+1rem)] md:pb-0">
          <div className="w-full max-w-5xl mx-auto min-w-0">

            <AnimatePresence initial={false}>
              <motion.div
                key={notificationsOpen ? "notifications" : activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              >
                <Suspense
                  fallback={
                    <div className="p-8 text-sm text-muted-foreground">Loading…</div>
                  }
                >
                  {notificationsOpen ? (
                    <NotificationsPanel embedded onClose={() => setNotificationsOpen(false)} />
                  ) : activeTab === "profile" ? (
                    <AdminProfileView
                      email={user?.email}
                      initial={adminInitial}
                      onSignOut={handleSignOut}
                      onOpenAdmins={() => selectTab("admins")}
                      onOpenRBAC={() => selectTab("rbac")}
                      onOpenNotifications={() => selectTab("notifications")}
                    />
                  ) : isMobile && desktopOnlyTabs.has(activeTab) ? (
                    <div className="p-8 flex flex-col items-center text-center gap-3">
                      <Monitor className="w-8 h-8 text-muted-foreground" strokeWidth={1.5} />
                      <h2 className="text-base font-black text-foreground">Available on web</h2>
                      <p className="text-sm text-muted-foreground max-w-xs">
                        Control Center settings are managed from the web console. Open the admin
                        portal on a desktop browser to make changes here.
                      </p>
                      <button
                        onClick={() => selectTab("overview")}
                        className="mt-1 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold"
                      >
                        Back to Home
                      </button>
                    </div>
                  ) : (
                    tabContentMap[activeTab]
                  )}
                </Suspense>
              </motion.div>

            </AnimatePresence>
          </div>
        </main>

        {/* Mobile bottom dock — consistent with all roles */}
        <RoleBottomNav<AdminTab>
          active={activeTab}
          onSelect={selectTab}
          items={[
            { id: "overview", icon: LayoutDashboard, label: "Home" },
            { id: "subscriptions", icon: CreditCard, label: "Subs" },
            { id: "users", icon: Users, label: "Users" },
            { id: "coaches", icon: UserCheck, label: "Coaches" },
            { id: "diet", icon: Salad, label: "Diet" },
            { id: "supplements", icon: Pill, label: "Supps" },
            { id: "fasting", icon: Timer, label: "Fasting" },
            { id: "movement", icon: Footprints, label: "Move" },
            { id: "labtests", icon: FlaskConical, label: "Labs" },
            { id: "videos", icon: Video, label: "Videos" },
            { id: "exercises", icon: Dumbbell, label: "Exercise" },
            { id: "community", icon: MessageSquare, label: "Community" },
          ]}

        />
      </div>
    </div>
  );
}

