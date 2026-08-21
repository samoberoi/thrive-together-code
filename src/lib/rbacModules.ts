import {
  LayoutDashboard,
  Users,
  UserCheck,
  Apple,
  Pill,
  Timer,
  FlaskConical,
  Video,
  Settings2,
  Package,
  Shield,
  Footprints,
  MessageSquare,
  Handshake,
  Dumbbell,
  type LucideIcon,
} from "lucide-react";

export interface RbacSubModule {
  id: string;
  label: string;
}

export interface RbacModule {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  subModules: RbacSubModule[];
}

export const RBAC_MODULES: RbacModule[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard, subModules: [] },
  {
    id: "channel_partner_portal",
    label: "Channel Partner Portal",
    icon: Handshake,
    subModules: [
      { id: "profile", label: "Profile" },
      { id: "yoga_classes", label: "Yoga Classes" },
      { id: "subscribers", label: "Subscribers" },
      { id: "user_packages", label: "User Packages" },
    ],
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    subModules: [
      { id: "list", label: "User List" },
      { id: "profiles", label: "Profiles" },
      { id: "health_logs", label: "Health Logs" },
    ],
  },
  {
    id: "coaches",
    label: "Coaches",
    icon: UserCheck,
    subModules: [
      { id: "list", label: "Coach List" },
      { id: "ratings", label: "Ratings" },
    ],
  },
  {
    id: "diet",
    label: "Diet",
    icon: Apple,
    subModules: [
      { id: "categories", label: "Categories" },
      { id: "food_items", label: "Food Items" },
      { id: "tags", label: "Tags" },
      { id: "filters", label: "Filters" },
      { id: "plates", label: "Plates" },
    ],
  },
  {
    id: "supplements",
    label: "Supplements",
    icon: Pill,
    subModules: [
      { id: "list", label: "Supplements" },
      { id: "conditions", label: "Conditions" },
      { id: "badges", label: "Badges" },
      { id: "rules", label: "Condition Rules" },
    ],
  },
  {
    id: "fasting",
    label: "Fasting",
    icon: Timer,
    subModules: [
      { id: "protocols", label: "Protocols" },
      { id: "badges", label: "Badges" },
      { id: "weekly_plans", label: "Weekly Plans" },
      { id: "tracking", label: "Tracking" },
    ],
  },
  {
    id: "lab_tests",
    label: "Lab Tests",
    icon: FlaskConical,
    subModules: [
      { id: "tests", label: "Test Catalog" },
      { id: "recommendations", label: "Recommendations" },
      { id: "orders", label: "Orders" },
      { id: "reports", label: "Reports" },
      { id: "parameters", label: "Parameters" },
    ],
  },
  {
    id: "exercises",
    label: "Stress & Yoga",
    icon: Video,
    subModules: [
      { id: "categories", label: "Categories" },
      { id: "videos", label: "Videos" },
    ],
  },
  {
    id: "exercise",
    label: "Exercise",
    icon: Dumbbell,
    subModules: [
      { id: "catalog", label: "Exercise Catalog" },
      { id: "badges", label: "Badges" },
      { id: "logs", label: "User Logs" },
    ],
  },
  {
    id: "movement",
    label: "Movement",
    icon: Footprints,
    subModules: [],
  },
  {
    id: "community",
    label: "Community",
    icon: MessageSquare,
    subModules: [],
  },
  {
    id: "control_center",
    label: "Control Center",
    icon: Settings2,
    subModules: [
      { id: "rbac", label: "Role-Based Access Control" },
      { id: "subscriptions", label: "Subscriptions" },
      { id: "assignments", label: "Coach Assignments" },
      { id: "community_categories", label: "Community Categories" },
    ],
  },
];

export type RbacRole = "user" | "coach" | "admin" | "channel_partner";
export type RbacAction = "view" | "edit" | "delete";

/**
 * A "subject" is what we manage permissions for in the admin UI.
 * End-user access is scoped per package; coach and admin are global.
 */
export type RbacSubjectKind = "package" | "coach" | "admin" | "channel_partner";

export interface RbacSubject {
  /** Stable id used in the UI selector: pkg:foundation, coach, admin */
  id: string;
  kind: RbacSubjectKind;
  /** Persisted role value for rbac_permissions.role */
  role: RbacRole;
  /** Persisted package_key for rbac_permissions.package_key (null for coach/admin) */
  packageKey: string | null;
  label: string;
  description: string;
  icon: LucideIcon;
}

export const subjectIdForPackage = (planKey: string) => `pkg:${planKey}`;

export const COACH_SUBJECT: RbacSubject = {
  id: "coach",
  kind: "coach",
  role: "coach",
  packageKey: null,
  label: "Coach",
  description:
    "Health coach assigned to clients. Reviews logs, sends chat, manages assigned protocols.",
  icon: UserCheck,
};

export const ADMIN_SUBJECT: RbacSubject = {
  id: "admin",
  kind: "admin",
  role: "admin",
  packageKey: null,
  label: "Super Admin",
  description: "Unrestricted access. Manages catalogs, billing, and the entire platform.",
  icon: Shield,
};

export const CHANNEL_PARTNER_SUBJECT: RbacSubject = {
  id: "channel_partner",
  kind: "channel_partner",
  role: "channel_partner",
  packageKey: null,
  label: "Channel Partner",
  description:
    "External service providers (yoga, dance, meditation…). Manage their own packages, class slots, and subscribers.",
  icon: Handshake,
};

export function buildPackageSubject(pkg: { plan_key: string; name: string; tagline?: string | null }): RbacSubject {
  return {
    id: subjectIdForPackage(pkg.plan_key),
    kind: "package",
    role: "user",
    packageKey: pkg.plan_key,
    label: pkg.name,
    description:
      pkg.tagline?.trim() ||
      `End-user access for members on the ${pkg.name} package.`,
    icon: Package,
  };
}

export const RBAC_ACTIONS: { id: RbacAction; label: string }[] = [
  { id: "view", label: "View" },
  { id: "edit", label: "Edit" },
  { id: "delete", label: "Delete" },
];
