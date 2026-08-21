import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, Plus, Edit2, Save, X, ChevronDown, ChevronUp, Phone, Mail, Star, Users as UsersIcon, Check, Package as PackageIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { logAudit } from "@/lib/auditLog";
import ExportCsvButton from "@/components/admin/ExportCsvButton";
import ImportCsvButton from "@/components/admin/ImportCsvButton";
import AvatarUploader from "@/components/admin/AvatarUploader";
import CoachReviewsDialog from "@/components/coach/CoachReviewsDialog";

type Coach = Tables<"coaches">;

// Coaches are only mapped to paid packages with coaching included.
// Foundation Care has no coaches assigned.
const COACH_PACKAGES = [
  { value: "active_reset", label: "Active Health Tracker" },
  { value: "pro_transformation", label: "Intensive Reversal Care" },
];

const packageLabel = (type: string) => {
  const m = COACH_PACKAGES.find((p) => p.value === type);
  if (m) return m.label;
  // Legacy: starter_reset shouldn't exist after migration but render safely
  if (type === "starter_reset") return "Active Health Tracker";
  return type.replace(/_/g, " ");
};

const emptyCoach: Partial<Coach> = {
  name: "", phone: "", email: "", coach_type: "active_reset" as any,
  coach_packages: ["active_reset"] as any,
  specialization: "", qualification: "", bio: "", bbdo_community_exp: 0,
  commission_percent: 0, languages: [], city: "", state: "", pincode: "",
  address_line1: "", address_line2: "", bank_name: "", bank_account_number: "",
  bank_ifsc: "", aadhaar_card: "", pan_card: "", emergency_contact_name: "",
  emergency_contact_phone: "", is_active: true,
};


type AssignedUser = { user_id: string; name: string | null; phone: string | null; assigned_at: string };

export default function AdminCoaches() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedCoach, setExpandedCoach] = useState<string | null>(null);
  const [editingCoach, setEditingCoach] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Coach>>({});
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCoach, setNewCoach] = useState<Partial<Coach>>({ ...emptyCoach });
  const [saving, setSaving] = useState(false);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [assignedUsers, setAssignedUsers] = useState<Record<string, AssignedUser[]>>({});
  const [showAssignedFor, setShowAssignedFor] = useState<string | null>(null);
  const [reviewsCoach, setReviewsCoach] = useState<Coach | null>(null);
  const [commissionModels, setCommissionModels] = useState<{ id: string; name: string; percent: number }[]>([]);

  useEffect(() => {
    loadCoaches();
    supabase
      .from("commission_models" as any)
      .select("id, name, percent")
      .eq("is_active", true)
      .order("percent")
      .then(({ data }) => setCommissionModels((data as any) ?? []));
  }, []);

  const loadCoaches = async () => {
    const [coachesRes, assignsRes] = await Promise.all([
      supabase.from("coaches").select("*").order("created_at", { ascending: false }),
      supabase.from("coach_assignments").select("coach_id, user_id, assigned_at").eq("is_active", true),
    ]);
    if (coachesRes.data) setCoaches(coachesRes.data);
    const counts: Record<string, number> = {};
    for (const a of (assignsRes.data ?? []) as any[]) {
      counts[a.coach_id] = (counts[a.coach_id] ?? 0) + 1;
    }
    setAssignedCounts(counts);
    setLoading(false);
  };

  const loadAssignedUsers = async (coachId: string) => {
    if (assignedUsers[coachId]) return;
    const { data: assigns } = await supabase
      .from("coach_assignments")
      .select("user_id, assigned_at")
      .eq("coach_id", coachId)
      .eq("is_active", true)
      .order("assigned_at", { ascending: false });
    const ids = (assigns ?? []).map((a: any) => a.user_id);
    if (ids.length === 0) {
      setAssignedUsers((m) => ({ ...m, [coachId]: [] }));
      return;
    }
    const { data: profs } = await supabase
      .from("profiles")
      .select("user_id, name, phone")
      .in("user_id", ids);
    const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    const rows: AssignedUser[] = (assigns ?? []).map((a: any) => ({
      user_id: a.user_id,
      assigned_at: a.assigned_at,
      name: profMap.get(a.user_id)?.name ?? null,
      phone: profMap.get(a.user_id)?.phone ?? null,
    }));
    setAssignedUsers((m) => ({ ...m, [coachId]: rows }));
  };

  const startEdit = (coach: Coach) => {
    setEditingCoach(coach.id);
    setEditData({ ...coach });
    setExpandedCoach(coach.id);
  };

  const cancelEdit = () => { setEditingCoach(null); setEditData({}); };

  const saveEdit = async () => {
    if (!editingCoach) return;
    setSaving(true);
    const { error } = await supabase.from("coaches").update(editData as any).eq("id", editingCoach);
    if (error) {
      toast.error("Failed to update coach");
    } else {
      toast.success("Coach updated");
      logAudit({ module: "Coaches", action: "update", target_type: "coach", target_id: editingCoach, target_label: editData.name ?? undefined });
      await loadCoaches();
    }
    setEditingCoach(null);
    setEditData({});
    setSaving(false);
  };

  const addCoach = async () => {
    if (!newCoach.name || !newCoach.phone) {
      toast.error("Name and phone are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("coaches").insert({
      name: newCoach.name!,
      phone: newCoach.phone!,
      email: newCoach.email || null,
      coach_type: (((newCoach as any).coach_packages?.[0]) || newCoach.coach_type || "active_reset") as any,
      coach_packages: ((newCoach as any).coach_packages?.length ? (newCoach as any).coach_packages : [newCoach.coach_type || "active_reset"]) as any,
      specialization: newCoach.specialization || null,
      qualification: newCoach.qualification || null,
      bio: newCoach.bio || null,
      bbdo_community_exp: newCoach.bbdo_community_exp || 0,
      commission_percent: newCoach.commission_percent || 10,
      languages: newCoach.languages || [],
      city: newCoach.city || null,
      state: newCoach.state || null,
      pincode: newCoach.pincode || null,
      address_line1: newCoach.address_line1 || null,
      address_line2: newCoach.address_line2 || null,
      bank_name: newCoach.bank_name || null,
      bank_account_number: newCoach.bank_account_number || null,
      bank_ifsc: newCoach.bank_ifsc || null,
      aadhaar_card: newCoach.aadhaar_card || null,
      pan_card: newCoach.pan_card || null,
      emergency_contact_name: newCoach.emergency_contact_name || null,
      emergency_contact_phone: newCoach.emergency_contact_phone || null,
      avatar_url: (newCoach as any).avatar_url || null,
      is_active: true,
    } as any);
    if (error) {
      toast.error("Failed to add coach: " + error.message);
    } else {
      toast.success("Coach added successfully");
      logAudit({ module: "Coaches", action: "create", target_type: "coach", target_label: newCoach.name ?? undefined, metadata: { coach_type: newCoach.coach_type } });
      setShowAddForm(false);
      setNewCoach({ ...emptyCoach });
      await loadCoaches();
    }
    setSaving(false);
  };

  const toggleActive = async (coach: Coach) => {
    await supabase.from("coaches").update({ is_active: !coach.is_active } as any).eq("id", coach.id);
    toast.success(coach.is_active ? "Coach deactivated" : "Coach activated");
    logAudit({ module: "Coaches", action: coach.is_active ? "disable" : "enable", target_type: "coach", target_id: coach.id, target_label: coach.name });
    await loadCoaches();
  };

  const filtered = coaches.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phone.includes(q) || c.specialization?.toLowerCase().includes(q);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-foreground">Coach Management</h1>
          <p className="text-muted-foreground text-sm">{coaches.length} coaches</p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Search coaches..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <ExportCsvButton filename="coaches" rows={coaches as any} />
            <ImportCsvButton table="coaches" onImported={() => window.location.reload()} />
            <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="shrink-0 ml-auto">
              <Plus className="w-4 h-4 mr-1" /> Add Coach
            </Button>
          </div>
        </div>

      </div>

      {/* Add Coach Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="liquid-glass rounded-2xl p-5 space-y-4 border-2 border-primary/20">
              <h3 className="font-bold text-foreground">Add New Coach</h3>
              <CoachFormFields data={newCoach} onChange={setNewCoach} commissionModels={commissionModels} />
              <div className="flex gap-3 pt-2">
                <Button onClick={addCoach} disabled={saving} size="sm">
                  {saving ? "Saving..." : "Create Coach"}
                </Button>
                <Button variant="outline" onClick={() => setShowAddForm(false)} size="sm">Cancel</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Column headers (desktop) */}
      <div className="hidden sm:flex items-center justify-between px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
        <div className="flex-1 min-w-0">Name / Specialization</div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-[60px] text-center">Users</div>
          <div className="w-[60px] text-center">Rating</div>
          <div className="w-[80px] text-center">Status</div>
          <div className="w-4" />
        </div>
      </div>

      {/* Coach List */}
      <div className="space-y-3">
        {filtered.map((coach) => {
          const isExpanded = expandedCoach === coach.id;
          const isEditing = editingCoach === coach.id;

          return (
            <motion.div key={coach.id} layout className="liquid-glass rounded-2xl overflow-hidden">
              <button
                onClick={() => !isEditing && setExpandedCoach(isExpanded ? null : coach.id)}
                className="w-full flex items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 overflow-hidden">
                    {(coach as any).avatar_url ? (
                      <img src={(coach as any).avatar_url} alt={coach.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-emerald-500 font-bold text-sm">{coach.name.charAt(0)}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground font-semibold text-sm truncate">{coach.name}</p>
                    <p className="text-muted-foreground text-xs truncate">
                      {coach.specialization || packageLabel(coach.coach_type)}
                      {((coach as any).working_hours_start && (coach as any).working_hours_end) && (
                        <> · <span className="text-foreground/70">{(coach as any).working_hours_start}–{(coach as any).working_hours_end}</span></>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {((coach as any).working_hours_start && (coach as any).working_hours_end) && (
                    <span className="hidden md:inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary font-medium">
                      🕒 {(coach as any).working_hours_start}–{(coach as any).working_hours_end}
                    </span>
                  )}
                  <div className="hidden sm:flex items-center gap-1 mr-1 text-xs text-muted-foreground">
                    <UsersIcon className="w-3 h-3" />
                    <span>{assignedCounts[coach.id] ?? 0}</span>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 mr-2">
                    <Star className="w-3 h-3 text-amber-500" />
                    <span className="text-xs text-muted-foreground">{Number(coach.avg_rating).toFixed(1)}</span>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${coach.is_active ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"}`}>
                    {coach.is_active ? "Active" : "Inactive"}
                  </span>
                  {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 border-t border-border pt-4">
                      {isEditing ? (
                        <div className="space-y-4">
                          <CoachFormFields data={editData} onChange={setEditData} commissionModels={commissionModels} />
                          <div className="flex gap-3">
                            <Button onClick={saveEdit} disabled={saving} size="sm">
                              <Save className="w-4 h-4 mr-1" /> {saving ? "Saving..." : "Save"}
                            </Button>
                            <Button variant="outline" onClick={cancelEdit} size="sm">
                              <X className="w-4 h-4 mr-1" /> Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            <InfoCell label="Phone" value={coach.phone} />
                            <InfoCell label="Email" value={coach.email || "—"} />
                            <InfoCell label="Packages" value={((coach as any).coach_packages?.length ? (coach as any).coach_packages : [coach.coach_type]).map((p: string) => packageLabel(p)).join(", ")} />
                            <InfoCell label="BBDO Community Exp" value={`${coach.bbdo_community_exp}`} />
                            <InfoCell label="Commission" value={`${coach.commission_percent || 0}%`} />
                            <InfoCell label="Start Date" value={coach.start_date ? new Date(coach.start_date).toLocaleDateString("en-IN") : "—"} />
                            <InfoCell label="Qualification" value={coach.qualification || "—"} />
                            <InfoCell label="Consultations" value={String(coach.total_consultations)} />
                            <InfoCell label="Ratings" value={`${Number(coach.avg_rating).toFixed(1)} (${coach.total_ratings})`} />
                            <InfoCell label="City" value={coach.city || "—"} />
                            <InfoCell label="State" value={coach.state || "—"} />
                            <InfoCell
                              label="Working Hours"
                              value={
                                (coach as any).working_hours_start && (coach as any).working_hours_end
                                  ? `${(coach as any).working_hours_start}–${(coach as any).working_hours_end} ${(coach as any).working_timezone || "Asia/Kolkata"}`
                                  : "—"
                              }
                            />
                            <InfoCell label="Languages" value={coach.languages?.join(", ") || "—"} />
                            <InfoCell label="Bank" value={coach.bank_name || "—"} />
                            <InfoCell label="Account" value={coach.bank_account_number ? `****${coach.bank_account_number.slice(-4)}` : "—"} />
                            <InfoCell label="IFSC" value={coach.bank_ifsc || "—"} />
                            <InfoCell label="Aadhaar" value={coach.aadhaar_card ? `****${coach.aadhaar_card.slice(-4)}` : "—"} />
                            <InfoCell label="PAN" value={coach.pan_card || "—"} />
                            <InfoCell label="Emergency" value={coach.emergency_contact_name ? `${coach.emergency_contact_name} (${coach.emergency_contact_phone})` : "—"} />
                          </div>
                          <div className="flex flex-wrap gap-3 pt-2 items-center">
                            <Button onClick={() => startEdit(coach)} variant="outline" size="sm">
                              <Edit2 className="w-4 h-4 mr-1" /> Edit
                            </Button>
                            <Button onClick={() => toggleActive(coach)} variant={coach.is_active ? "destructive" : "default"} size="sm">
                              {coach.is_active ? "Deactivate" : "Activate"}
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={async () => {
                                await loadAssignedUsers(coach.id);
                                setShowAssignedFor(showAssignedFor === coach.id ? null : coach.id);
                              }}
                            >
                              <UsersIcon className="w-4 h-4 mr-1" />
                              View Assigned Users ({assignedCounts[coach.id] ?? 0})
                            </Button>
                            <Button variant="secondary" size="sm" onClick={() => setReviewsCoach(coach)}>
                              <Star className="w-4 h-4 mr-1 text-amber-500" />
                              View Reviews ({coach.total_ratings ?? 0})
                            </Button>
                          </div>

                          {showAssignedFor === coach.id && (
                            <div className="mt-3 rounded-xl border border-border bg-muted/40 p-3">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">
                                Assigned Users ({(assignedUsers[coach.id] ?? []).length})
                              </p>
                              {(assignedUsers[coach.id] ?? []).length === 0 ? (
                                <p className="text-sm text-muted-foreground">No users currently assigned.</p>
                              ) : (
                                <div className="space-y-1.5">
                                  {(assignedUsers[coach.id] ?? []).map((u) => (
                                    <div
                                      key={u.user_id}
                                      className="flex items-center justify-between text-sm bg-background rounded-lg px-3 py-2"
                                    >
                                      <div className="min-w-0">
                                        <p className="font-medium text-foreground truncate">{u.name || "Unnamed"}</p>
                                        <p className="text-xs text-muted-foreground">{u.phone || "—"}</p>
                                      </div>
                                      <span className="text-[11px] text-muted-foreground shrink-0">
                                        {new Date(u.assigned_at).toLocaleDateString("en-IN")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          );
        })}

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground"><p>No coaches found</p></div>
        )}
      </div>

      {reviewsCoach && (
        <CoachReviewsDialog
          open={!!reviewsCoach}
          onOpenChange={(o) => !o && setReviewsCoach(null)}
          coachId={reviewsCoach.id}
          avgRating={Number(reviewsCoach.avg_rating ?? 0)}
          totalRatings={Number(reviewsCoach.total_ratings ?? 0)}
          description={`Ratings and written feedback for ${reviewsCoach.name}`}
        />
      )}
    </div>
  );
}

function CoachFormFields({
  data,
  onChange,
  commissionModels,
}: {
  data: Partial<Coach>;
  onChange: (d: Partial<Coach>) => void;
  commissionModels: { id: string; name: string; percent: number }[];
}) {
  const set = (key: string, value: any) => onChange({ ...data, [key]: value });
  const currentModelId = (data as any).commission_model_id ?? "";

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div className="sm:col-span-2 lg:col-span-3">
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Profile photo</label>
        <AvatarUploader
          value={(data as any).avatar_url || null}
          onChange={(url) => set("avatar_url", url)}
          folder="coaches"
          entityId={(data as any).id || (data as any).phone || null}
        />
      </div>
      <FormField label="Name *" value={data.name || ""} onChange={(v) => set("name", v)} />
      <FormField label="Phone *" value={data.phone || ""} onChange={(v) => set("phone", v)} />
      <FormField label="Email" value={data.email || ""} onChange={(v) => set("email", v)} />
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Packages</label>
        <PackagesMultiSelect
          value={((data as any).coach_packages && (data as any).coach_packages.length
            ? (data as any).coach_packages
            : (data.coach_type ? [data.coach_type as string] : []))}
          onChange={(vals) => {
            const next = vals.length ? vals : ["active_reset"];
            onChange({ ...data, coach_packages: next as any, coach_type: next[0] as any });
          }}
        />
      </div>
      <FormField label="Specialization" value={data.specialization || ""} onChange={(v) => set("specialization", v)} />
      <FormField label="Qualification" value={data.qualification || ""} onChange={(v) => set("qualification", v)} />
      <FormField label="BBDO Community Exp" value={String(data.bbdo_community_exp || 0)} onChange={(v) => set("bbdo_community_exp", parseInt(v) || 0)} type="number" />
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Commission Model</label>
        <select
          value={currentModelId}
          onChange={(e) => set("commission_model_id", e.target.value || null)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">— None —</option>
          {commissionModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name} · {m.percent}%</option>
          ))}
        </select>
      </div>
      <FormField label="Start Date" value={data.start_date || ""} onChange={(v) => set("start_date", v)} type="date" />
      <FormField label="Bio" value={data.bio || ""} onChange={(v) => set("bio", v)} />
      <FormField label="Languages (comma-separated)" value={(data.languages || []).join(", ")} onChange={(v) => set("languages", v.split(",").map((l: string) => l.trim()).filter(Boolean))} />
      <FormField label="City" value={data.city || ""} onChange={(v) => set("city", v)} />
      <FormField label="State" value={data.state || ""} onChange={(v) => set("state", v)} />
      <FormField label="Pincode" value={data.pincode || ""} onChange={(v) => set("pincode", v)} />
      <FormField label="Address Line 1" value={data.address_line1 || ""} onChange={(v) => set("address_line1", v)} />
      <FormField label="Address Line 2" value={data.address_line2 || ""} onChange={(v) => set("address_line2", v)} />
      <FormField label="Address Line 1" value={data.address_line1 || ""} onChange={(v) => set("address_line1", v)} />
      <FormField label="Address Line 2" value={data.address_line2 || ""} onChange={(v) => set("address_line2", v)} />
      <FormField
        label="Working hours start"
        value={((data as any).working_hours_start || "09:00").slice(0, 5)}
        onChange={(v) => set("working_hours_start", v)}
        type="time"
      />
      <FormField
        label="Working hours end"
        value={((data as any).working_hours_end || "18:00").slice(0, 5)}
        onChange={(v) => set("working_hours_end", v)}
        type="time"
      />
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Working timezone</label>
        <select
          value={(data as any).working_timezone || "Asia/Kolkata"}
          onChange={(e) => set("working_timezone", e.target.value)}
          className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
          <option value="America/New_York">America/New_York (ET)</option>
          <option value="America/Los_Angeles">America/Los_Angeles (PT)</option>
          <option value="Europe/London">Europe/London (GMT)</option>
          <option value="UTC">UTC</option>
        </select>
      </div>
      <FormField label="Bank Name" value={data.bank_name || ""} onChange={(v) => set("bank_name", v)} />
      <FormField label="Account Number" value={data.bank_account_number || ""} onChange={(v) => set("bank_account_number", v)} />
      <FormField label="IFSC Code" value={data.bank_ifsc || ""} onChange={(v) => set("bank_ifsc", v)} />
      <FormField label="Aadhaar Number" value={data.aadhaar_card || ""} onChange={(v) => set("aadhaar_card", v)} />
      <FormField label="PAN Number" value={data.pan_card || ""} onChange={(v) => set("pan_card", v)} />
      <FormField label="Emergency Contact Name" value={data.emergency_contact_name || ""} onChange={(v) => set("emergency_contact_name", v)} />
      <FormField label="Emergency Contact Phone" value={data.emergency_contact_phone || ""} onChange={(v) => set("emergency_contact_phone", v)} />
    </div>
  );
}

function FormField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-9 text-sm" />
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm text-foreground font-medium capitalize">{value}</p>
    </div>
  );
}

function PackagesMultiSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [open, setOpen] = useState(false);
  const selected = value || [];
  const toggle = (v: string) => {
    if (selected.includes(v)) onChange(selected.filter((s) => s !== v));
    else onChange([...selected, v]);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="w-full min-h-10 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-left hover:border-primary/50 transition-colors flex items-center gap-2 flex-wrap"
        >
          <PackageIcon className="w-4 h-4 text-primary shrink-0" />
          {selected.length === 0 ? (
            <span className="text-muted-foreground">Select packages…</span>
          ) : (
            selected.map((s) => {
              const label = COACH_PACKAGES.find((p) => p.value === s)?.label || s;
              return (
                <Badge
                  key={s}
                  variant="secondary"
                  className="gap-1 bg-primary/10 text-primary hover:bg-primary/15 border border-primary/20"
                >
                  {label}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(s); }}
                    className="ml-0.5 rounded-full hover:bg-primary/20 p-0.5 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </span>
                </Badge>
              );
            })
          )}
          <ChevronDown className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-1.5" align="start">
        <div className="space-y-0.5">
          {COACH_PACKAGES.map((p) => {
            const isSel = selected.includes(p.value);
            return (
              <button
                key={p.value}
                type="button"
                onClick={() => toggle(p.value)}
                className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-sm text-left transition-colors ${
                  isSel ? "bg-primary/10 text-primary" : "hover:bg-muted text-foreground"
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                  isSel ? "bg-primary border-primary text-primary-foreground" : "border-input"
                }`}>
                  {isSel && <Check className="w-3 h-3" />}
                </div>
                <span className="flex-1">{p.label}</span>
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}
