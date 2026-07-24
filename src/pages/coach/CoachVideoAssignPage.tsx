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
  package_key: string | null;
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
    (async () => {
      setLoading(true);
      const { data: coach } = await supabase
        .from("coaches" as any)
        .select("id")
        .eq("user_id", user.id)
        .single();
      const cid = (coach as any)?.id ?? null;
      setCoachId(cid);
      if (!cid) {
        setLoading(false);
        return;
      }
      const { data: assignments } = await supabase
        .from("coach_assignments" as any)
        .select("user_id")
        .eq("coach_id", cid)
        .eq("is_active", true);
      const ids = ((assignments as any[]) ?? []).map((a) => a.user_id);
      if (ids.length === 0) {
        setPatients([]);
        setLoading(false);
        return;
      }
      const { data: profiles } = await supabase
        .from("profiles" as any)
        .select("user_id, name, avatar_url, package_key")
        .in("user_id", ids);
      const list: Patient[] = ((profiles as any[]) ?? []).map((p) => ({
        user_id: p.user_id,
        name: p.name || "Patient",
        package_key: p.package_key ?? null,
        avatar_url: p.avatar_url ?? null,
      }));
      list.sort((a, b) => a.name.localeCompare(b.name));
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
    })();
  }, [user, module]);

  // Load assignable catalogue
  useEffect(() => {
    (async () => {
      setItemsLoading(true);
      try {
        if (module === "exercise") {
          const list = await listExercises();
          const enabled = list.filter((e: any) => e.is_enabled !== false);
          setItems(
            enabled.map((e: any) => ({
              key: e.id,
              title: e.name,
              subtitle: `Tier ${e.tier}`,
            })),
          );
        } else {
          const overrides = await fetchVideoMetadataOverrides();
          const disabled = new Set(
            Object.entries(overrides)
              .filter(([, v]: any) => v?.is_enabled === false)
              .map(([k]) => k),
          );
          const base: AssignableItem[] = staticYogaVideos
            .filter((v) => !disabled.has(v.id))
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
            .filter(([, v]: any) => v?.is_custom && v?.is_enabled !== false)
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
    return patients.filter((p) => p.name.toLowerCase().includes(query));
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
            placeholder="Search patient…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="space-y-2">
            {filtered.map((p) => {
              const count = assignedCounts[p.user_id] ?? 0;
              return (
                <li
                  key={p.user_id}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-3"
                >
                  <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-primary font-black text-xs">
                        {(p.name?.[0] ?? "P").toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {count > 0 ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> {count} assigned
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400">Awaiting your plan</span>
                      )}
                    </p>
                  </div>
                  <Button size="sm" variant="secondary" onClick={() => setSelectedPatient(p)}>
                    Manage
                  </Button>
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
