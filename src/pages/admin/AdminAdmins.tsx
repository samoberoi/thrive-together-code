import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, ShieldCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { logAudit } from "@/lib/auditLog";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";
import { useConfirm } from "@/components/ConfirmProvider";

interface AdminRow {
  user_id: string;
  name: string | null;
  phone: string | null;
  created_at: string | null;
}

export default function AdminAdmins() {
  const confirm = useConfirm();
  const [admins, setAdmins] = useState<AdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const ids = (roles || []).map((r: any) => r.user_id);
    if (ids.length === 0) {
      setAdmins([]);
      setLoading(false);
      return;
    }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, name, phone, created_at")
      .in("user_id", ids);

    const map = new Map((profiles || []).map((p: any) => [p.user_id, p]));
    setAdmins(
      ids.map((id) => ({
        user_id: id,
        name: (map.get(id) as any)?.name ?? null,
        phone: (map.get(id) as any)?.phone ?? null,
        created_at: (map.get(id) as any)?.created_at ?? null,
      }))
    );
    setLoading(false);
  };

  const openAdd = () => {
    setNewName("");
    setNewPhone("");
    setShowAdd(true);
  };

  const createAdmin = async () => {
    const name = newName.trim();
    const phone = newPhone.replace(/\D/g, "");
    if (!name) { toast.error("Enter a name"); return; }
    if (phone.length < 10) { toast.error("Enter a valid phone (10+ digits)"); return; }
    setCreating(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-admin", {
        body: { name, phone },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success((data as any)?.message || "Admin created");
      logAudit({ module: "Super Admins", action: "create", target_type: "user", target_id: (data as any)?.userId });
      setShowAdd(false);
      await load();
    } catch (e: any) {
      toast.error("Failed to create admin: " + (e?.message || "Unknown error"));
    } finally {
      setCreating(false);
    }
  };

  const revokeAdmin = async (userId: string) => {
    if (!(await confirm({ title: "Revoke admin access?", description: "This user will lose admin privileges.", destructive: true, confirmText: "Revoke" }))) return;
    setBusy(userId);
    const { error } = await supabase
      .from("user_roles")
      .delete()
      .eq("user_id", userId)
      .eq("role", "admin");
    if (error) {
      toast.error("Failed to revoke admin");
    } else {
      toast.success("Admin access revoked");
      logAudit({ module: "Super Admins", action: "delete", target_type: "user", target_id: userId });
      await load();
    }
    setBusy(null);
  };

  const filtered = admins.filter((a) => {
    const q = search.toLowerCase();
    return (
      a.name?.toLowerCase().includes(q) ||
      a.phone?.includes(q) ||
      a.user_id.includes(q)
    );
  });


  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[60vh]">
        <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl sm:text-2xl font-black text-foreground">Super Admins</h1>
        <p className="text-muted-foreground text-sm">
          {admins.length} {admins.length === 1 ? "admin" : "admins"} with full platform access
        </p>
      </div>

      {/* Search + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search admins..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 w-full"
          />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ExportCsvButton filename="admins" rows={admins} />
<ImportCsvButton table="user_roles" onImported={() => window.location.reload()} />
          <Button onClick={openAdd} size="sm" className="shrink-0">
            <Plus className="w-4 h-4 mr-1" /> Create
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="liquid-glass rounded-2xl p-5 space-y-4 border-2 border-primary/20">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-foreground">Create new admin</h3>
                <button
                  onClick={() => setShowAdd(false)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Creates a new account with full admin access. The admin signs in using their phone number and a real SMS OTP.
              </p>
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Full name</label>
                  <Input
                    placeholder="e.g. Priya Sharma"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">Phone number</label>
                  <Input
                    placeholder="10-digit phone"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    inputMode="numeric"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setShowAdd(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button size="sm" onClick={createAdmin} disabled={creating}>
                  {creating ? "Creating..." : "Create admin"}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="space-y-2">
        {filtered.map((a) => (
          <motion.div
            key={a.user_id}
            layout
            className="liquid-glass rounded-2xl p-3 sm:p-4 flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5 text-destructive" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-foreground font-semibold text-sm truncate leading-tight">
                {a.name || "Super Admin"}
              </p>
              <p className="text-muted-foreground text-xs truncate mt-0.5">
                {a.phone || "—"} · Super Admin
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0 h-8 px-3 text-xs"
              onClick={() => revokeAdmin(a.user_id)}
              disabled={busy === a.user_id || admins.length === 1}
              title={admins.length === 1 ? "Cannot revoke the last admin" : ""}
            >
              Revoke
            </Button>
          </motion.div>
        ))}
        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            No admins found
          </div>
        )}
      </div>
    </div>
  );
}
