import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Shield, Trash2, Download, Activity, Heart, Scale,
  Timer, Pill, Droplets, MessageCircle, User, AlertTriangle, Loader2
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { clearPersistedAuthState } from "@/contexts/AuthContext";
import { clearNativePersistedAuthState, flushNativePersistenceWrites } from "@/lib/nativePersistence";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";


interface DataCategory {
  id: string;
  icon: React.ElementType;
  label: string;
  table: string;
  color: string;
  count: number | null;
}

interface Props {
  userId?: string;
  userName: string;
  onBack: () => void;
}

export default function PrivacySecurityPage({ userId, userName, onBack }: Props) {
  const [dataCounts, setDataCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Fetch counts on mount
  useEffect(() => {
    if (!userId) return;
    const tables = [
      { key: "health_logs", table: "health_logs" },
      { key: "fasting_tracking", table: "fasting_tracking" },
      { key: "meal_photos", table: "meal_photos" },
      { key: "user_supplement_tracking", table: "user_supplement_tracking" },
      { key: "chat_messages", table: "chat_messages" },
    ];
    Promise.all(
      tables.map(async ({ key, table }) => {
        const { count } = await supabase
          .from(table as any)
          .select("id", { count: "exact", head: true })
          .eq(key === "chat_messages" ? "sender_id" : "user_id", userId);
        return { key, count: count ?? 0 };
      })
    ).then((results) => {
      const map: Record<string, number> = {};
      results.forEach((r) => (map[r.key] = r.count));
      setDataCounts(map);
      setLoading(false);
    });
  }, [userId]);

  const categories: DataCategory[] = [
    { id: "health_logs", icon: Activity, label: "Health Logs (Diabetes, BP, Weight, Water)", table: "health_logs", color: "text-primary", count: dataCounts.health_logs ?? null },
    { id: "fasting_tracking", icon: Timer, label: "Fasting Tracking", table: "fasting_tracking", color: "text-primary", count: dataCounts.fasting_tracking ?? null },
    { id: "meal_photos", icon: Scale, label: "Meal Photos & Nutrition", table: "meal_photos", color: "text-primary", count: dataCounts.meal_photos ?? null },
    { id: "user_supplement_tracking", icon: Pill, label: "Supplement Tracking", table: "user_supplement_tracking", color: "text-primary", count: dataCounts.user_supplement_tracking ?? null },
    { id: "chat_messages", icon: MessageCircle, label: "Chat Messages", table: "chat_messages", color: "text-primary", count: dataCounts.chat_messages ?? null },
  ];

  const handleExportData = async () => {
    if (!userId) return;
    setExporting(true);
    try {
      const [healthLogs, fasting, meals, suppTracking, messages, profile] = await Promise.all([
        supabase.from("health_logs" as any).select("*").eq("user_id", userId).then(r => r.data ?? []),
        supabase.from("fasting_tracking" as any).select("*").eq("user_id", userId).then(r => r.data ?? []),
        supabase.from("meal_photos" as any).select("*").eq("user_id", userId).then(r => r.data ?? []),
        supabase.from("user_supplement_tracking" as any).select("*").eq("user_id", userId).then(r => r.data ?? []),
        supabase.from("chat_messages" as any).select("*").eq("sender_id", userId).then(r => r.data ?? []),
        supabase.from("profiles" as any).select("*").eq("user_id", userId).single().then(r => r.data),
      ]);
      const exportData = {
        exported_at: new Date().toISOString(),
        user_id: userId,
        profile,
        health_logs: healthLogs,
        fasting_tracking: fasting,
        meal_photos: meals,
        supplement_tracking: suppTracking,
        chat_messages: messages,
      };
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `my-health-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Data exported successfully");
    } catch {
      toast.error("Failed to export data");
    } finally {
      setExporting(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!userId) return;
    setDeleting(true);
    try {
      // Delete all user data from tables
      await Promise.all([
        supabase.from("health_logs" as any).delete().eq("user_id", userId),
        supabase.from("fasting_tracking" as any).delete().eq("user_id", userId),
        supabase.from("meal_photos" as any).delete().eq("user_id", userId),
        supabase.from("user_supplement_tracking" as any).delete().eq("user_id", userId),
        supabase.from("user_supplement_plans" as any).delete().eq("user_id", userId),
        supabase.from("user_protocols" as any).delete().eq("user_id", userId),
        supabase.from("user_fasting_badges" as any).delete().eq("user_id", userId),
        supabase.from("user_supplement_badges" as any).delete().eq("user_id", userId),
        supabase.from("user_diet_profiles" as any).delete().eq("user_id", userId),
        supabase.from("coach_assignments" as any).delete().eq("user_id", userId),
        supabase.from("referral_codes" as any).delete().eq("user_id", userId),
        supabase.from("subscriptions" as any).delete().eq("user_id", userId),
        supabase.from("profiles" as any).delete().eq("user_id", userId),
        supabase.from("user_roles" as any).delete().eq("user_id", userId),
      ]);
      // Sign out
      await supabase.auth.signOut();
      clearPersistedAuthState(true);
      await clearNativePersistedAuthState();
      await flushNativePersistenceWrites();
      toast.success("Account deleted. All data has been removed.");
      window.location.href = "/";
    } catch (err) {
      console.error("Delete account error:", err);
      toast.error("Failed to delete account. Please try again.");
    } finally {
      setDeleting(false);
    }
  };

  const totalRecords = Object.values(dataCounts).reduce((s, v) => s + (v ?? 0), 0);

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 bg-background border-b border-border">
        <button onClick={onBack} className="w-9 h-9 rounded-full liquid-glass flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} />
        </button>
        <h2 className="text-lg font-black text-foreground">Privacy & Security</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Summary */}
        <motion.div
          className="liquid-glass rounded-2xl p-5 flex items-center gap-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-6 h-6 text-primary" strokeWidth={1.8} />
          </div>
          <div className="flex-1">
            <p className="text-foreground font-bold text-sm">Your Data</p>
            <p className="text-muted-foreground text-xs">
              {loading ? "Loading..." : `${totalRecords} total records stored across all categories`}
            </p>
          </div>
        </motion.div>


        {/* Data Categories */}
        <div>
          <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-3">Stored Data</p>
          <div className="space-y-2">
            {categories.map((cat, i) => {
              const Icon = cat.icon;
              return (
                <motion.div
                  key={cat.id}
                  className="liquid-glass rounded-2xl p-4 flex items-center gap-3"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className="w-9 h-9 rounded-xl liquid-glass flex items-center justify-center">
                    <Icon className={`w-4 h-4 ${cat.color}`} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1">
                    <p className="text-foreground text-sm font-medium">{cat.label}</p>
                  </div>
                  <span className="text-muted-foreground text-xs font-bold px-2 py-1 rounded-lg bg-accent/50">
                    {loading ? "…" : `${cat.count ?? 0} records`}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Export Data */}
        <motion.button
          onClick={handleExportData}
          disabled={exporting}
          className="w-full liquid-glass rounded-2xl p-4 flex items-center gap-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          whileTap={{ scale: 0.98 }}
        >
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
            {exporting ? <Loader2 className="w-4 h-4 text-primary animate-spin" /> : <Download className="w-4 h-4 text-primary" strokeWidth={1.8} />}
          </div>
          <div className="text-left flex-1">
            <p className="text-foreground font-medium text-sm">Export All My Data</p>
            <p className="text-muted-foreground text-xs">Download everything as JSON</p>
          </div>
        </motion.button>

        {/* Delete Account */}
        <motion.div
          className="border border-destructive/30 rounded-2xl p-5 space-y-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" strokeWidth={1.8} />
            <p className="text-destructive font-bold text-sm">Danger Zone</p>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Deleting your account will permanently remove all your health data, 
            logs, chat history, supplement tracking, and profile information. 
            This action cannot be undone.
          </p>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <button className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-sm font-bold">
                <Trash2 className="w-4 h-4" strokeWidth={1.8} />
                Delete My Account & All Data
              </button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-background border-border">
              <AlertDialogHeader>
                <AlertDialogTitle className="text-foreground">Delete Account Permanently?</AlertDialogTitle>
                <AlertDialogDescription className="text-muted-foreground">
                  This will permanently delete your profile, all health logs, fasting data, 
                  supplement tracking, chat messages, and all other stored data for <strong>{userName}</strong>.
                  <br /><br />
                  This action is <strong>irreversible</strong>.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="text-foreground">Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Yes, Delete Everything
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </motion.div>

        <p className="text-muted-foreground text-[10px] text-center pb-4">
          In compliance with data protection regulations, you can export or delete all your personal data at any time.
        </p>
      </div>
    </div>
  );
}
