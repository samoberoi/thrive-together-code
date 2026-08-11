import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, CreditCard, Link2, Palette, Bell, Flame, TrendingUp, Salad, Music4, Scale, Ticket } from "lucide-react";
import { cn } from "@/lib/utils";
import AdminRBAC from "./AdminRBAC";
import AdminSubscriptions from "./AdminSubscriptions";
import AdminAssignments from "./AdminAssignments";
import AdminColorGauges from "./AdminColorGauges";
import AdminNotificationManager from "./AdminNotificationManager";
import AdminGlobalStreak from "./AdminGlobalStreak";
import AdminPnl from "./AdminPnl";
import AdminDietTypes from "./AdminDietTypes";
import AdminBmiCategories from "./AdminBmiCategories";
import AdminCoupons from "./AdminCoupons";
import SoundManagerCard from "@/components/admin/SoundManagerCard";

import CsvToolbar from "@/components/admin/CsvToolbar";
type Tab = "rbac" | "subscriptions" | "assignments" | "color_gauges" | "notifications" | "global_streak" | "pnl" | "diet_types" | "sound" | "bmi" | "coupons";

const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "rbac", label: "Role-Based Access", icon: Shield },
  { id: "subscriptions", label: "Subscriptions", icon: CreditCard },
  { id: "assignments", label: "Coach Assignments", icon: Link2 },
  { id: "coupons", label: "Coupon Manager", icon: Ticket },
  { id: "color_gauges", label: "Color Gauge Manager", icon: Palette },
  { id: "bmi", label: "BMI Categories", icon: Scale },
  { id: "notifications", label: "Notification Manager", icon: Bell },
  { id: "sound", label: "Sound Manager", icon: Music4 },
  { id: "global_streak", label: "Global Streak", icon: Flame },
  { id: "pnl", label: "P&L Manager", icon: TrendingUp },
  { id: "diet_types", label: "Diet Types", icon: Salad },
];

export default function AdminControlCenter({ initialTab = "rbac" }: { initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      <div className="flex justify-end mb-3"><CsvToolbar table="app_settings" onImported={() => window.location.reload()} /></div>
      <div>
        <h1 className="text-xl sm:text-2xl font-black text-foreground">Control Center</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Governance and platform-level controls — roles, billing, and patient-coach assignments.
        </p>
      </div>

      <div className="tabs-scroll flex gap-2 border-b md:flex-wrap">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 h-10 px-4 -mb-px border-b-2 text-sm font-semibold transition-colors",
                active
                  ? "border-[var(--bbdo-blue)] text-[var(--bbdo-blue)]"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="-mx-6"
        >
          {tab === "rbac" && <AdminRBAC />}
          {tab === "subscriptions" && <AdminSubscriptions />}
          {tab === "assignments" && <AdminAssignments />}
          {tab === "color_gauges" && <AdminColorGauges />}
          {tab === "notifications" && <AdminNotificationManager />}
          {tab === "global_streak" && <AdminGlobalStreak />}
          {tab === "pnl" && <AdminPnl />}
          {tab === "diet_types" && <AdminDietTypes />}
          {tab === "bmi" && <AdminBmiCategories />}
          {tab === "coupons" && <AdminCoupons />}
          {tab === "sound" && <div className="px-4 sm:px-6"><SoundManagerCard /></div>}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
