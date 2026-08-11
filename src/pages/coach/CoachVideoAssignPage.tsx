import { useEffect, useMemo, useState } from "react";
import { Loader2, Users, Dumbbell, Flower2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared";
import CoachAssignmentSheet, { type AssignableItem } from "@/components/coach/CoachAssignmentSheet";
import { listExercises } from "@/lib/exerciseService";
import { videos as staticYogaVideos } from "@/lib/exerciseData";
import { fetchVideoMetadataOverrides } from "@/lib/videoMetadataService";
import type { AssignmentModule } from "@/lib/coachVideoAssignmentService";

interface Patient {
  user_id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

interface Props {
  module: AssignmentModule;
}

export default function CoachVideoAssignPage({ module }: Props) {
  const { user } = useAuth();
  const [coachId, setCoachId] = useState<string | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<AssignableItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [assignedCounts, setAssignedCounts] = useState<Record<string, number>>({});
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {

      // Resolve coach row: prefer user_id, fall back to phone match + self-heal.
      const resolveCoach = async (): Promise<string | null> => {
        const { data: byUser } = await supabase
          .from("coaches" as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        if ((byUser as any)?.id) return (byUser as any).id;

        // Try phone from the auth user (Supabase phone or bbd.app email prefix).
        const rawPhone: string | undefined =
          (user as any)?.phone ||
          (user.email && user.email.endsWith("@bbd.app") ? user.email.split("@")[0] : undefined);
        if (!rawPhone) return null;

        // Attempt to self-heal by linking, then re-query.
        try {
          await supabase.rpc("link_coach_to_user" as any, { _user_id: user.id, _phone: rawPhone });
        } catch {}
        const { data: byUser2 } = await supabase
          .from("coaches" as any)
          .select("id")
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        return (byUser2 as any)?.id ?? null;
      };

      const cid = await resolveCoach();
      if (cancelled) return;
      setCoachId(cid);
      if (!cid) {
        console.warn("[CoachVideoAssignPage] Could not resolve coach id for user", user.id);
        setPatients([]);
        setLoading(false);
        return;
      }
      const { data: assignments, error: aErr } = await supabase
        .from("coach_assignments" as any)
        .select("user_id")
        .eq("coach_id", cid)
        .eq("is_active", true);
      if (aErr) console.warn("[CoachVideoAssignPage] assignments query error", aErr);
      const ids = ((assignments as any[]) ?? []).map((a) => a.user_id);
      if (ids.length === 0) {
        setPatients([]);
        setLoading(false);
        return;
      }
      const { data: profiles, error: pErr } = await supabase
        .from("profiles" as any)
        .select("user_id, name, phone, avatar_url")
        .in("user_id", ids);
      if (pErr) console.warn("[CoachVideoAssignPage] profiles query error", pErr);
      const profileById = new Map<string, any>();
      ((profiles as any[]) ?? []).forEach((p) => profileById.set(p.user_id, p));
      const list: Patient[] = ids.map((uid) => {
        const p = profileById.get(uid);
        const phone = p?.phone ? `+${String(p.phone).replace(/^\+/, "")}` : "";
        const nm = (p?.name && String(p.name).trim()) || phone || `User ${uid.slice(0, 8)}`;
        return {
          user_id: uid,
          name: nm,
          phone,
          avatar_url: p?.avatar_url ?? null,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      if (cancelled) return;
      setPatients(list);

      const { data: cva } = await supabase
        .from("coach_video_assignments" as any)
        .select("patient_user_id, item_key")
        .eq("coach_id", cid)
        .eq("module", module)
        .in("patient_user_id", ids);
      const counts: Record<string, number> = {};
      ((cva as any[]) ?? []).forEach((r) => {
        counts[r.patient_user_id] = (counts[r.patient_user_id] ?? 0) + 1;
      });
      setAssignedCounts(counts);
      setLoading(false);
      } catch (e: any) {
        if (!cancelled) {
          console.warn("[CoachVideoAssignPage] load error", e);
          toast.error(e?.message || "Failed to load patients");
          setPatients([]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, module]);


  // Load assignable catalogue
  useEffect(() => {
    (async () => {
      setItemsLoading(true);
      try {
        if (module === "exercise") {
          const list = await listExercises();
          setItems(
            list.map((e: any) => ({
              key: e.id,
              title: e.name,
              subtitle: `Tier ${e.tier}`,
            })),
          );
        } else {
          const overrides = await fetchVideoMetadataOverrides();
          const staticIds = new Set(staticYogaVideos.map((v) => v.id));
          const base: AssignableItem[] = staticYogaVideos
            .map((v) => {
              const o: any = overrides[v.id] || {};
              return {
                key: v.id,
                title: o.name || v.name,
                subtitle: o.group_name || v.group,
              };
            });
          // Include custom uploaded videos
          const customs: AssignableItem[] = Object.entries(overrides)
            .filter(([k, v]: any) => v?.is_custom && !staticIds.has(k))
            .map(([k, v]: any) => ({
              key: k,
              title: v.name || "Custom video",
              subtitle: v.group_name || "Custom",
            }));
          setItems([...base, ...customs]);
        }
      } catch (e: any) {
        toast.error(e?.message || "Failed to load catalogue");
      } finally {
        setItemsLoading(false);
      }
    })();
  }, [module]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return patients;
    return patients.filter((p) => p.name.toLowerCase().includes(query) || (p.phone || "").toLowerCase().includes(query));
  }, [patients, q]);

  const Icon = module === "yoga" ? Flower2 : Dumbbell;
  const title = module === "yoga" ? "Yoga" : "Train";
  const description =
    module === "yoga"
      ? "Assign yoga videos to your patients. Anyone without an assignment sees an awaiting state."
      : "Assign exercises to your patients. Anyone without an assignment sees an awaiting state.";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading…
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-black">{title}</h1>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      {patients.length === 0 ? (
        <EmptyState icon={Users} title="No patients yet" description="Patients assigned to you will appear here." />
      ) : (
        <>
          <Input
            placeholder="Search patient by name or phone…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="space-y-3">
            {filtered.map((p) => {
              const count = assignedCounts[p.user_id] ?? 0;
              return (
                <li key={p.user_id} className="rounded-2xl border border-border bg-card px-4 py-3.5">
                  <CoachPatientIdentity
                    name={p.name}
                    phone={p.phone}
                    avatarUrl={p.avatar_url}
                    badges={
                      count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {count} assigned
                        </span>
                      ) : (
                        <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">Awaiting your plan</span>
                      )
                    }
                    actions={
                      <Button size="sm" variant={count > 0 ? "outline" : "default"} onClick={() => setSelectedPatient(p)}>
                        {count > 0 ? "Edit" : "Assign"}
                      </Button>
                    }
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {selectedPatient && coachId && (
        <CoachAssignmentSheet
          open={!!selectedPatient}
          onClose={() => {
            // Refresh counts on close
            const patient = selectedPatient;
            setSelectedPatient(null);
            if (!patient || !coachId) return;
            supabase
              .from("coach_video_assignments" as any)
              .select("item_key")
              .eq("coach_id", coachId)
              .eq("module", module)
              .eq("patient_user_id", patient.user_id)
              .then(({ data }) => {
                setAssignedCounts((prev) => ({
                  ...prev,
                  [patient.user_id]: ((data as any[]) ?? []).length,
                }));
              });
          }}
          coachId={coachId}
          patient={{ user_id: selectedPatient.user_id, name: selectedPatient.name }}
          module={module}
          items={items}
          loadingItems={itemsLoading}
        />
      )}
    </div>
  );
}
