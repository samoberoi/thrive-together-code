import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Camera, User, Phone, Mail, Calendar, Ruler, Scale,
  MapPin, Save, Loader2, CheckCircle, LocateFixed, Heart, Users,
  Cigarette, Wine, Bike, Moon as MoonIcon, Utensils, Activity,
  Pill, Stethoscope, FlaskConical, Brain, Plus, Trash2, ChevronDown, Upload
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getUser, saveUser } from "@/lib/userStore";
import { fetchProfile, updateProfile, normalizeDietSlug } from "@/lib/profileService";
import { calculateBMI, calculateHealthScore, inferClinicalValues } from "@/lib/healthEngine";
import type { BodyMetrics, ClinicalData, LifestyleData, DeepProfilingData } from "@/lib/healthEngine";
import { createNotification } from "@/lib/notificationService";
import { toast } from "sonner";
import { fetchUserResults } from "@/lib/labResultsService";
import { inferConditionsFromLabs } from "@/lib/labInferConditions";
import AllergyAndSubPrefs from "@/components/diet/AllergyAndSubPrefs";
import { loadDietProfile, saveDietProfile } from "@/lib/dietProfileService";
import SymptomsChecklist from "@/components/profile/SymptomsChecklist";
import { loadUserSymptoms, saveUserSymptoms } from "@/lib/symptomsService";
import { COUNTRIES as PHONE_COUNTRIES } from "@/lib/countries";


const Field = ({ label, icon: Icon, value, onChange, placeholder, type = "text", readOnly, hint }: {
  label: string; icon: React.ElementType; value: string;
  onChange: (v: string) => void; placeholder: string; type?: string;
  readOnly?: boolean; hint?: string;
}) => (
  <div className="min-w-0 space-y-1 w-full">
    <Label className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5 leading-tight">
      <Icon className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
      {label}
    </Label>
    <div className="w-full min-w-0 overflow-hidden">
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        style={{ minWidth: 0, maxWidth: "100%", width: "100%" }}
        className={`bg-white border border-border/70 text-foreground text-sm rounded-lg h-10 px-3 py-2 min-w-0 w-full max-w-full box-border shadow-none appearance-none [&::-webkit-date-and-time-value]:text-left [&::-webkit-date-and-time-value]:min-h-0 ${readOnly ? "opacity-70" : ""}`}
      />
    </div>
    {hint && <p className="text-[10px] text-muted-foreground leading-tight">{hint}</p>}
  </div>
);

function computeAgeFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d.getTime())) return null;
  const now = new Date();
  if (d > now) return 0;
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return Math.max(0, age);
}

const formatLabel = (val: string | undefined | null): string => {
  if (!val) return "—";
  return val.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
};

/** Pick the default phone country from the region the user chose at signup. */
function countryFromRegionCode(regionCode?: string | null) {
  if (!regionCode) return null;
  return PHONE_COUNTRIES.find((c) => c.code === regionCode) ?? null;
}

function countryFromDialCode(dial?: string | null) {
  if (!dial) return null;
  return PHONE_COUNTRIES.find((c) => c.dial === dial) ?? null;
}

const ToggleChip = ({ label, options, value, onChange }: {
  label: string; options: { id: string; label: string }[]; value: string;
  onChange: (v: string) => void;
}) => (
  <div className="space-y-1.5">
    <Label className="text-muted-foreground text-xs leading-tight break-words">{label}</Label>
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold leading-tight break-words transition-colors ${value === o.id ? "bg-primary text-primary-foreground" : "liquid-glass text-muted-foreground"}`}>
          {o.label}
        </button>
      ))}
    </div>
  </div>
);

// Common diabetes/metabolic medicines for dropdown
const COMMON_MEDICINES = [
  "Metformin", "Glimepiride", "Gliclazide", "Glipizide",
  "Sitagliptin", "Vildagliptin", "Teneligliptin", "Linagliptin",
  "Empagliflozin", "Dapagliflozin", "Canagliflozin",
  "Pioglitazone", "Voglibose", "Acarbose",
  "Insulin Glargine", "Insulin Aspart", "Insulin Lispro", "Insulin NPH",
  "Amlodipine", "Telmisartan", "Losartan", "Olmesartan", "Ramipril", "Enalapril",
  "Atorvastatin", "Rosuvastatin", "Fenofibrate",
  "Levothyroxine", "Aspirin", "Clopidogrel",
  "Pantoprazole", "Rabeprazole",
];

const DOSAGE_OPTIONS = ["250mg", "500mg", "750mg", "1000mg", "5mg", "10mg", "15mg", "20mg", "25mg", "40mg", "50mg", "80mg", "100mg", "10 units", "20 units", "30 units", "50 units"];
const TIMING_OPTIONS = ["Before Breakfast", "After Breakfast", "Before Lunch", "After Lunch", "Before Dinner", "After Dinner", "Bedtime", "Morning Empty Stomach", "Twice Daily", "Thrice Daily"];

const COUNTRY_DIAL_CODES: { code: string; name: string }[] = [
  { code: "+91", name: "India" },
  { code: "+1", name: "USA / Canada" },
  { code: "+44", name: "United Kingdom" },
  { code: "+971", name: "UAE" },
  { code: "+966", name: "Saudi Arabia" },
  { code: "+65", name: "Singapore" },
  { code: "+61", name: "Australia" },
  { code: "+64", name: "New Zealand" },
  { code: "+49", name: "Germany" },
  { code: "+33", name: "France" },
  { code: "+34", name: "Spain" },
  { code: "+39", name: "Italy" },
  { code: "+31", name: "Netherlands" },
  { code: "+41", name: "Switzerland" },
  { code: "+46", name: "Sweden" },
  { code: "+353", name: "Ireland" },
  { code: "+81", name: "Japan" },
  { code: "+82", name: "South Korea" },
  { code: "+86", name: "China" },
  { code: "+852", name: "Hong Kong" },
  { code: "+60", name: "Malaysia" },
  { code: "+62", name: "Indonesia" },
  { code: "+63", name: "Philippines" },
  { code: "+66", name: "Thailand" },
  { code: "+84", name: "Vietnam" },
  { code: "+880", name: "Bangladesh" },
  { code: "+92", name: "Pakistan" },
  { code: "+94", name: "Sri Lanka" },
  { code: "+977", name: "Nepal" },
  { code: "+27", name: "South Africa" },
  { code: "+254", name: "Kenya" },
  { code: "+234", name: "Nigeria" },
  { code: "+20", name: "Egypt" },
  { code: "+55", name: "Brazil" },
  { code: "+52", name: "Mexico" },
];

const COUNTRIES = [
  "India", "United States", "Canada", "United Kingdom", "UAE", "Saudi Arabia",
  "Singapore", "Australia", "New Zealand", "Germany", "France", "Spain", "Italy",
  "Netherlands", "Switzerland", "Sweden", "Ireland", "Japan", "South Korea",
  "China", "Hong Kong", "Malaysia", "Indonesia", "Philippines", "Thailand",
  "Vietnam", "Bangladesh", "Pakistan", "Sri Lanka", "Nepal", "South Africa",
  "Kenya", "Nigeria", "Egypt", "Brazil", "Mexico", "Other",
];

interface MedicineEntry {
  name: string;
  dosage: string;
  timing: string;
}

function MedicationListEditor({ medications, onChange }: { medications: MedicineEntry[]; onChange: (m: MedicineEntry[]) => void }) {
  const addMedicine = () => onChange([...medications, { name: "", dosage: "", timing: "" }]);
  const removeMedicine = (idx: number) => onChange(medications.filter((_, i) => i !== idx));
  const updateMedicine = (idx: number, field: keyof MedicineEntry, value: string) => {
    const updated = [...medications];
    updated[idx] = { ...updated[idx], [field]: value };
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <AnimatePresence>
        {medications.map((med, idx) => (
          <motion.div
            key={idx}
            className="liquid-glass rounded-xl p-3 space-y-2.5"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Medicine {idx + 1}</span>
              <button onClick={() => removeMedicine(idx)} className="text-destructive p-1 rounded-lg hover:bg-destructive/10">
                <Trash2 className="w-3.5 h-3.5" strokeWidth={1.8} />
              </button>
            </div>

            {/* Medicine Name */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px]">Medicine Name</label>
              <Select value={med.name} onValueChange={(v) => updateMedicine(idx, "name", v)}>
                <SelectTrigger className="bg-accent/50 border-border/50 text-foreground rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Select medicine" />
                </SelectTrigger>
                <SelectContent className="max-h-60">
                  {COMMON_MEDICINES.map((m) => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                  <SelectItem value="__custom" className="text-xs text-primary font-semibold">+ Type custom name</SelectItem>
                </SelectContent>
              </Select>
              {med.name === "__custom" && (
                <Input
                  type="text"
                  placeholder="Enter medicine name"
                  className="bg-accent/50 border-border/50 text-foreground rounded-xl h-10 text-xs mt-1"
                  onChange={(e) => updateMedicine(idx, "name", e.target.value)}
                />
              )}
            </div>

            {/* Dosage */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px]">Dosage</label>
              <Select value={med.dosage} onValueChange={(v) => updateMedicine(idx, "dosage", v)}>
                <SelectTrigger className="bg-accent/50 border-border/50 text-foreground rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Select dosage" />
                </SelectTrigger>
                <SelectContent>
                  {DOSAGE_OPTIONS.map((d) => (
                    <SelectItem key={d} value={d} className="text-xs">{d}</SelectItem>
                  ))}
                  <SelectItem value="__custom_dosage" className="text-xs text-primary font-semibold">+ Custom dosage</SelectItem>
                </SelectContent>
              </Select>
              {med.dosage === "__custom_dosage" && (
                <Input
                  type="text"
                  placeholder="e.g. 15mg"
                  className="bg-accent/50 border-border/50 text-foreground rounded-xl h-10 text-xs mt-1"
                  onChange={(e) => updateMedicine(idx, "dosage", e.target.value)}
                />
              )}
            </div>

            {/* Timing */}
            <div className="space-y-1">
              <label className="text-muted-foreground text-[10px]">When to take</label>
              <Select value={med.timing} onValueChange={(v) => updateMedicine(idx, "timing", v)}>
                <SelectTrigger className="bg-accent/50 border-border/50 text-foreground rounded-xl h-10 text-xs">
                  <SelectValue placeholder="Select timing" />
                </SelectTrigger>
                <SelectContent>
                  {TIMING_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      <button
        onClick={addMedicine}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-primary/30 text-primary text-xs font-semibold hover:bg-primary/5 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" strokeWidth={2} />
        Add Medicine
      </button>
    </div>
  );
}

interface EditProfileProps {
  onBack: () => void;
  /** When editing another user (coach mode), pass their user_id */
  targetUserId?: string;
  /** Display name for header when in coach mode */
  targetName?: string;
  /** True when a coach is editing a patient */
  coachMode?: boolean;
  /** Called after a successful save */
  onSaved?: () => void;
}

export default function EditProfile({ onBack, targetUserId, targetName, coachMode = false, onSaved }: EditProfileProps) {
  const { user } = useAuth();
  const effectiveUserId = targetUserId ?? user?.id ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // In coach mode, don't seed from the coach's own localStorage — start empty
  // and populate purely from the target patient's backend profile.
  const stored = coachMode ? ({ profile: {}, bodyMetrics: {} } as any) : getUser();

  const [name, setName] = useState(stored.profile.name ?? "");
  const [age, setAge] = useState(stored.profile.age?.toString() ?? "");
  const [gender, setGender] = useState((stored.profile.gender ?? "").toLowerCase());
  const [phone, setPhone] = useState("");
  // International (email-OTP) users never provided a phone — let them add one.
  const [phoneLocked, setPhoneLocked] = useState(true);
  const [countryCode, setCountryCode] = useState("+91");
  const [email, setEmail] = useState(stored.profile.email ?? "");
  const [height, setHeight] = useState(stored.bodyMetrics.height?.toString() ?? "");
  const [weight, setWeight] = useState(stored.bodyMetrics.weight?.toString() ?? "");
  const [waist, setWaist] = useState((stored.bodyMetrics as any).waist?.toString() ?? "");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [pincode, setPincode] = useState("");
  const [country, setCountry] = useState("India");
  const [memberSince, setMemberSince] = useState<string | null>(null);

  // New fields
  const [birthDate, setBirthDate] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [anniversaryDate, setAnniversaryDate] = useState("");
  const [spouseName, setSpouseName] = useState("");


  // Lifestyle, clinical, deep profiling from backend
  const [lifestyle, setLifestyle] = useState<Record<string, any>>({});
  const [clinical, setClinical] = useState<Record<string, any>>({});
  const [deepProfiling, setDeepProfiling] = useState<Record<string, any>>({});

  // Diet preferences + allergies (loaded from user_diet_profiles)
  const [dietPrefs, setDietPrefs] = useState<string[]>([]);
  const [dietRowLoaded, setDietRowLoaded] = useState(false);
  const [subPreferences, setSubPreferences] = useState<string[]>([]);
  const [allergenFoodIds, setAllergenFoodIds] = useState<string[]>([]);

  // List of symptoms (user_symptoms)
  const [symptomKeys, setSymptomKeys] = useState<string[]>([]);
  const [symptomNotes, setSymptomNotes] = useState("");

  useEffect(() => {
    if (!effectiveUserId) return;

    fetchProfile(effectiveUserId).then((profile) => {
      if (!profile) return;
      if (profile.phone) setPhone(profile.phone);
      setPhoneLocked(Boolean(profile.phone && String(profile.phone).trim()));
      if ((profile as any).country_code) setCountryCode((profile as any).country_code);
      if ((profile as any).email) setEmail((profile as any).email);
      if (profile.avatar_url) setAvatarUrl(profile.avatar_url);
      if (profile.address_line1) setAddressLine1(profile.address_line1);
      if (profile.address_line2) setAddressLine2(profile.address_line2);
      if (profile.city) setCity(profile.city);
      if (profile.state) setState(profile.state);
      if (profile.pincode) setPincode(profile.pincode);
      if ((profile as any).country) setCountry((profile as any).country);
      if (profile.name) setName(profile.name);
      if (profile.age) setAge(profile.age.toString());
      if (profile.gender) setGender(profile.gender.toLowerCase());
      if (profile.height) setHeight(profile.height.toString());
      if (profile.weight) setWeight(profile.weight.toString());
      if (profile.waist) setWaist(profile.waist.toString());
      if (profile.created_at) setMemberSince(profile.created_at);
      if (profile.birth_date) {
        setBirthDate(profile.birth_date);
        const derived = computeAgeFromDob(profile.birth_date);
        if (derived != null) setAge(String(derived));
      }
      if (profile.marital_status) setMaritalStatus(profile.marital_status);
      if (profile.anniversary_date) setAnniversaryDate(profile.anniversary_date);
      if (profile.spouse_name) setSpouseName(profile.spouse_name);
      if (profile.lifestyle) setLifestyle(typeof profile.lifestyle === 'object' ? profile.lifestyle as Record<string, any> : {});
      if (profile.clinical) setClinical(typeof profile.clinical === 'object' ? profile.clinical as Record<string, any> : {});
      if (profile.deep_profiling) setDeepProfiling(typeof profile.deep_profiling === 'object' ? profile.deep_profiling as Record<string, any> : {});
    });

    // Smart inference: auto-fill hypo/hyper thyroid, uric acid, kidney disease,
    // iron deficiency and fatty liver from the most recent blood test.
    fetchUserResults(effectiveUserId).then((results) => {
      const inferred = inferConditionsFromLabs(results);
      if (Object.keys(inferred).length === 0) return;
      setDeepProfiling((prev) => {
        const next = { ...prev };
        (Object.keys(inferred) as (keyof typeof inferred)[]).forEach((k) => {
          const cur = (next as any)[k];
          if (k === "uricAcid") { (next as any)[k] = inferred[k]; return; }
          if (cur == null || cur === "" || cur === "no" || cur === "unsure") {
            (next as any)[k] = inferred[k];
          }
        });
        return next;
      });
    }).catch(() => { /* ignore — lab pull is best-effort */ });

    // Load the symptom checklist for this user
    loadUserSymptoms(effectiveUserId).then((s) => {
      setSymptomKeys(s.symptomKeys);
      setSymptomNotes(s.notes);
    });

    // Load diet preferences + allergies so coach/user can edit allergens.
    loadDietProfile(effectiveUserId).then((dp) => {
      const arr = ((dp as any)?.diet_preferences as string[] | null) || [];
      const fromArr = arr.map(normalizeDietSlug).filter(Boolean) as string[];
      const single = normalizeDietSlug(dp?.diet_preference);
      const finalPrefs = fromArr.length ? fromArr : single ? [single] : [];
      setDietPrefs(finalPrefs);
      setDietRowLoaded(true);
      setSubPreferences((dp as any)?.sub_preferences ?? []);
      setAllergenFoodIds((dp as any)?.allergen_food_ids ?? []);
    }).catch(() => { setDietRowLoaded(true); });
  }, [effectiveUserId]);

  // Fallback: brand-new users may not have a user_diet_profiles row yet (it is
  // written by the debounced onboarding sync). Until then, show the diet choice
  // captured during onboarding (profiles.lifestyle.diet) instead of "nothing selected".
  useEffect(() => {
    if (!dietRowLoaded) return;
    if (dietPrefs.length > 0) return;
    const slug = normalizeDietSlug((lifestyle as any)?.diet);
    if (slug) setDietPrefs([slug]);
  }, [dietRowLoaded, dietPrefs.length, lifestyle]);



  const uploadAvatarBlob = async (blob: Blob, ext: string) => {
    if (!effectiveUserId) return;
    setUploading(true);
    try {
      const path = `${effectiveUserId}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, blob, { upsert: true, contentType: blob.type || `image/${ext}` });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${data.publicUrl}?t=${Date.now()}`;
      setAvatarUrl(url);
      if (!coachMode) saveUser({ avatarUrl: url });
      await updateProfile(effectiveUserId, { avatar_url: url });
      toast.success("Photo updated!");
    } catch (err: any) {
      console.error(err);
      toast.error("Failed to upload photo");
    } finally {
      setUploading(false);
    }
  };


  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    await uploadAvatarBlob(file, ext);
    e.target.value = "";
  };

  // --- Live camera capture ---
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraStarting, setCameraStarting] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const stopCamera = () => {
    const s = cameraStreamRef.current;
    if (s) s.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  const openCamera = () => {
    // IMPORTANT: call getUserMedia synchronously inside the user gesture so
    // the browser permission prompt fires. Do not await anything before this.
    if (!navigator.mediaDevices?.getUserMedia) {
      // Fallback to native file picker with capture hint (mobile only).
      cameraInputRef.current?.click();
      return;
    }
    setPhotoMenuOpen(false);
    setCameraOpen(true);
    setCameraStarting(true);
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false })
      .then((stream) => {
        cameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      })
      .catch((err) => {
        console.error(err);
        const name = err?.name || "";
        if (name === "NotAllowedError") {
          toast.error("Camera permission denied. Enable it in your browser settings.");
        } else if (name === "NotFoundError") {
          toast.error("No camera found on this device.");
        } else if (name === "NotReadableError") {
          toast.error("Camera is in use by another app.");
        } else {
          toast.error("Couldn't open camera. Try uploading from gallery instead.");
        }
        setCameraOpen(false);
      })
      .finally(() => setCameraStarting(false));
  };

  const closeCamera = () => {
    stopCamera();
    setCameraOpen(false);
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setCapturing(true);
    try {
      const size = Math.min(video.videoWidth, video.videoHeight);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas unavailable");
      // Center-crop square, mirror to match preview
      const sx = (video.videoWidth - size) / 2;
      const sy = (video.videoHeight - size) / 2;
      ctx.translate(size, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Capture failed"))), "image/jpeg", 0.92),
      );
      closeCamera();
      await uploadAvatarBlob(blob, "jpg");
    } catch (err) {
      console.error(err);
      toast.error("Couldn't capture photo");
    } finally {
      setCapturing(false);
    }
  };

  useEffect(() => () => stopCamera(), []);


  const handleDetectLocation = async () => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude } = position.coords;
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`,
            { headers: { "Accept-Language": "en" } }
          );
          const data = await res.json();
          const addr = data.address || {};
          setAddressLine1(addr.road || addr.neighbourhood || "");
          setAddressLine2(addr.suburb || addr.county || "");
          setCity(addr.city || addr.town || addr.village || addr.state_district || "");
          setState(addr.state || "");
          setPincode(addr.postcode || "");
          toast.success("Location detected!");
        } catch {
          toast.error("Failed to detect address");
        } finally {
          setDetecting(false);
        }
      },
      (err) => {
        setDetecting(false);
        toast.error(err.code === 1 ? "Location permission denied" : "Failed to get location");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const requestSave = () => {
    if (coachMode) {
      setConfirmOpen(true);
      return;
    }
    void handleSave();
  };

  const handleSave = async () => {
    if (!effectiveUserId) return;
    setConfirmOpen(false);
    setSaving(true);

    setSaving(true);

    // Recompute health score with current data
    const h = height ? parseFloat(height) : 165;
    const w = weight ? parseFloat(weight) : 70;
    const { bmi, bmiCategory } = calculateBMI(h, w);

    const bodyMetrics: BodyMetrics = {
      height: h, weight: w, bmi, bmiCategory,
      waist: waist ? parseFloat(waist) : undefined,
    };

    const clinicalData: ClinicalData = inferClinicalValues({
      hba1c: clinical.hba1c ?? deepProfiling.hba1cInput ?? 5.5,
      systolicBP: clinical.systolicBP ?? 120,
      diastolicBP: clinical.diastolicBP ?? 80,
      hasDiabetes: clinical.hasDiabetes ?? false,
      hasHypertension: clinical.hasHypertension ?? false,
      hasCardiovascular: clinical.hasCardiovascular ?? false,
      familyHistoryDiabetes: clinical.familyHistoryDiabetes ?? false,
      familyHistoryHeart: clinical.familyHistoryHeart ?? false,
      diabetesType: clinical.diabetesType ?? deepProfiling.diabetesType,
    });

    // Map the unified diet preference (veg/non_veg/vegan/eggitarian/jain) into
    // the legacy lifestyle.diet slug (vegetarian/non_vegetarian/vegan) so
    // health-score and other legacy consumers keep working.
    const mapDietPrefToLifestyle = (p?: string): string | undefined => {
      switch (p) {
        case "veg":
        case "jain":
          return "vegetarian";
        case "non_veg":
        case "eggitarian":
          return "non_vegetarian";
        case "vegan":
          return "vegan";
        default:
          return lifestyle.diet;
      }
    };
    const derivedLifestyleDiet = mapDietPrefToLifestyle(dietPrefs[0]);

    const lifestyleData: LifestyleData = {
      smoking: lifestyle.smoking ?? false,
      alcohol: lifestyle.alcohol ?? "none",
      activity: lifestyle.activity ?? "moderate",
      sleepHours: lifestyle.sleepHours ?? 7,
      diet: derivedLifestyleDiet,
    };


    const dp: DeepProfilingData = {
      fastingGlucose: deepProfiling.fastingGlucose,
      postMealGlucose: deepProfiling.postMealGlucose,
      hba1cInput: deepProfiling.hba1cInput,
      diabetesDuration: deepProfiling.diabetesDuration,
      medications: deepProfiling.medications,
      medicationCount: deepProfiling.medicationCount,
      bpMedication: deepProfiling.bpMedication,
      lipidMedication: deepProfiling.lipidMedication,
      thyroidMedication: deepProfiling.thyroidMedication,
      thyroid: deepProfiling.thyroid,
      thyroidType: deepProfiling.thyroidType,
      vitaminD: deepProfiling.vitaminD,
      fattyLiver: deepProfiling.fattyLiver,
      pcos: deepProfiling.pcos,
      uricAcid: deepProfiling.uricAcid,
      kidneyDisease: deepProfiling.kidneyDisease,
      kidneyStones: deepProfiling.kidneyStones,
      ironDeficiency: deepProfiling.ironDeficiency,
      stressLevel: deepProfiling.stressLevel,
      bellyFat: deepProfiling.bellyFat,
      dietQuality: deepProfiling.dietQuality,
      waterIntake: deepProfiling.waterIntake,
      medicationsList: deepProfiling.medicationsList ?? [],
    };

    const assessment = calculateHealthScore(bodyMetrics, clinicalData, lifestyleData, dp, gender?.toLowerCase());

    // Validate email if provided
    const trimmedEmail = email.trim();
    if (trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      toast.error("Please enter a valid email address");
      setSaving(false);
      return;
    }

    // If DOB is set, derive age from it to keep them consistent
    const effectiveAge = birthDate
      ? computeAgeFromDob(birthDate)
      : age
        ? parseInt(age)
        : undefined;

    // Update localStorage only when the signed-in user is editing themselves
    if (!coachMode) {
      saveUser({
        profile: { name, age: effectiveAge, gender, email: trimmedEmail || undefined } as any,
        bodyMetrics: bodyMetrics as any,
        lifestyle: lifestyleData as any,
        clinical: clinicalData as any,
        deepProfiling: deepProfiling,
        assessment,
      });
    }

    const currentProfile = await fetchProfile(effectiveUserId);

    const previousScore = currentProfile?.assessment?.healthScore ?? null;
    const initialScore = currentProfile?.initial_health_score ?? previousScore ?? assessment.healthScore;
    const newScore = assessment.healthScore;

    // Update backend after capturing previous score state
    const ok = await updateProfile(effectiveUserId, {
      name,
      age: effectiveAge ?? null,
      gender: gender || null,
      // phone is the login identifier once set — only writable when it was never captured
      ...(phoneLocked ? {} : { phone: phone.trim() || null }),
      country_code: countryCode || null,
      country: country || null,
      email: trimmedEmail || null,
      height: h,
      weight: w,
      waist: waist ? parseFloat(waist) : null,
      bmi,
      bmi_category: bmiCategory,
      address_line1: addressLine1 || null,
      address_line2: addressLine2 || null,
      city: city || null,
      state: state || null,
      pincode: pincode || null,
      birth_date: birthDate || null,
      marital_status: maritalStatus || null,
      anniversary_date: anniversaryDate || null,
      spouse_name: spouseName || null,
      lifestyle: { ...lifestyle, diet: derivedLifestyleDiet },
      clinical: clinical,
      deep_profiling: deepProfiling,
      assessment: assessment as any,
    } as any);

    // Persist diet prefs + allergies (may fail silently if row missing — best-effort)
    await saveDietProfile(effectiveUserId, {
      diet_preference: dietPrefs[0] ?? undefined,
      diet_preferences: dietPrefs,
      sub_preferences: subPreferences,
      allergen_food_ids: allergenFoodIds,
    });

    // Persist symptom checklist
    await saveUserSymptoms(effectiveUserId, { symptomKeys, notes: symptomNotes });

    // Set initial score if not yet set
    if (!currentProfile?.initial_health_score && currentProfile?.initial_health_score !== 0) {
      await updateProfile(effectiveUserId, {
        initial_health_score: previousScore ?? newScore,
        initial_assessment_date: currentProfile?.created_at ?? new Date().toISOString(),
      } as any);
    }

    if (ok && !coachMode) {

      // Load coach assignment once (used for score-decline alert + BMI push)
      const { data: assignment } = await supabase
        .from("coach_assignments" as any)
        .select("coach_id, coaches:coach_id ( user_id, name )")
        .eq("user_id", effectiveUserId)
        .eq("is_active", true)
        .maybeSingle();
      const coachRow: any = (assignment as any)?.coaches ?? null;
      const coachUserId: string | null = coachRow?.user_id ?? null;
      const patientFirstName = (name || currentProfile?.name || "Your client").split(" ")[0];

      const scoreDelta = previousScore !== null ? newScore - previousScore : 0;

      // If score declined, create an alert for the coach (DB trigger emits push)
      if (previousScore !== null && scoreDelta < 0 && assignment) {
        await supabase.from("health_score_alerts" as any).insert({
          user_id: effectiveUserId,
          coach_id: (assignment as any).coach_id,
          previous_score: previousScore,
          new_score: newScore,
          score_delta: scoreDelta,
          alert_type: scoreDelta <= -5 ? "critical_decline" : "decline",
        } as any);
      }

      // Additional attention alerts to coach (BMI risk thresholds) -> push
      if (coachUserId) {
        const risks: string[] = [];
        if (bmi && bmi >= 35) risks.push(`BMI ${bmi} (obese class II+)`);
        else if (bmi && bmi >= 30) risks.push(`BMI ${bmi} (obese)`);
        if (risks.length > 0) {
          await createNotification({
            user_id: coachUserId,
            title: `⚠️ ${patientFirstName} needs attention`,
            body: risks.join(" • ") + ". Tap to review.",
            type: "health_alert",
            icon: "⚠️",
            action_url: "/coach?tab=patients",
          });
        }
      }

      // If score improved meaningfully, create user-facing compliment + share prompt notifications
      if (scoreDelta >= 3) {
        const firstName = (name || currentProfile?.name || "Champion").split(" ")[0];
        const coachName = currentProfile?.coach_name || "Your Coach";
        const metricValue = `+${scoreDelta} points`;
        const message = `${coachName}: "${firstName}, your health score jumped by ${scoreDelta} points! You're building real momentum — keep going! 🚀"`;

        await Promise.all([
          supabase.from("compliments" as any).insert({
            user_id: effectiveUserId,
            compliment_type: "health_score",
            message,
            emoji: "🚀",
            metric_value: metricValue,
          } as any),
          createNotification({
            user_id: effectiveUserId,
            title: "🚀 Health Score Up!",
            body: message,
            type: "compliment",
            icon: "🚀",
            action_url: "/home?tab=profile",
          }),
          createNotification({
            user_id: effectiveUserId,
            title: "📣 Share your win!",
            body: `Your health score improved by ${metricValue}. Tap to inspire the community 🎉`,
            type: "achievement_share",
            icon: "📣",
            action_url: `/home?tab=community&share=health_score&metric=${encodeURIComponent(metricValue)}`,
          }),
        ]);
      }
    }

    setSaving(false);
    if (ok) {
      if (coachMode) {
        toast.success("Client profile updated");
      } else {
        const delta = newScore - initialScore;
        const deltaStr = delta > 0 ? `+${delta}` : `${delta}`;
        const emoji = delta > 0 ? "📈" : delta < 0 ? "📉" : "➡️";
        toast.success(`${emoji} Health score: ${newScore} (${deltaStr} from start)`);
      }
      window.dispatchEvent(new CustomEvent("health-log-saved"));
      onSaved?.();
      onBack();
    } else {
      toast.error("Failed to save profile");
    }
  };


  const genders = ["Male", "Female", "Other"];
  const maritalOptions = ["Single", "Married", "Divorced", "Widowed"];

  

  return (
    <div className="min-h-dvh flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-14 pb-4 bg-background border-b border-border">
        <button onClick={onBack} className="w-9 h-9 shrink-0 rounded-full liquid-glass flex items-center justify-center">
          <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={1.8} />
        </button>
        <h2 className="min-w-0 text-lg font-black text-foreground leading-tight break-words">
          {coachMode ? `Edit — ${targetName || "Client"}` : "Edit Profile"}
        </h2>

      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 space-y-6">
        {/* Avatar */}
        <motion.div
          className="flex flex-col items-center gap-3"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="relative">
            <button
              type="button"
              onClick={() => setPhotoMenuOpen(true)}
              disabled={uploading}
              className="w-28 h-28 rounded-3xl overflow-hidden bg-primary/10 shadow-lg flex items-center justify-center disabled:opacity-60"
            >
              {avatarUrl ? (
                <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <span className="text-primary font-black text-5xl">
                  {name ? name.charAt(0).toUpperCase() : "?"}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setPhotoMenuOpen(true)}
              disabled={uploading}
              className="absolute -bottom-2 -right-2 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shadow-lg disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" strokeWidth={2} />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarUpload}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <button
            type="button"
            onClick={() => setPhotoMenuOpen(true)}
            disabled={uploading}
            className="text-primary text-xs font-semibold hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Browse photo"}
          </button>
          {memberSince && (
            <p className="text-muted-foreground text-xs">
              Member since {new Date(memberSince).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}
            </p>
          )}
        </motion.div>

        {/* Photo source menu */}
        <AnimatePresence>
          {photoMenuOpen && (
            <motion.div
              className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-foreground/40 backdrop-blur-sm p-0 sm:p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setPhotoMenuOpen(false)}
            >
              <motion.div
                className="w-full max-w-sm bg-background rounded-t-3xl sm:rounded-3xl p-6 pb-7 shadow-2xl ring-1 ring-border/60"
                initial={{ y: 24, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 24, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="w-10 h-1 rounded-full bg-border mx-auto mb-5 sm:hidden" />
                <div className="text-center mb-5">
                  <h3 className="text-foreground font-black text-lg tracking-tight">Profile photo</h3>
                  <p className="text-muted-foreground text-xs mt-1">Choose how you'd like to upload</p>
                </div>

                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={openCamera}

                    className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-card ring-1 ring-border hover:ring-primary/40 hover:bg-primary/[0.03] transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                      <Camera className="w-5 h-5 text-primary" strokeWidth={2.2} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">Take photo</p>
                      <p className="text-[11px] text-muted-foreground">Use your camera</p>
                    </div>
                    <span className="text-muted-foreground/60 text-lg leading-none">›</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setPhotoMenuOpen(false);
                    }}
                    className="group w-full flex items-center gap-3 px-3 py-3 rounded-2xl bg-card ring-1 ring-border hover:ring-primary/40 hover:bg-primary/[0.03] transition-all"
                  >
                    <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/15 transition-colors">
                      <Upload className="w-5 h-5 text-primary" strokeWidth={2.2} />
                    </div>
                    <div className="text-left flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground">Choose from gallery</p>
                      <p className="text-[11px] text-muted-foreground">Select an existing photo</p>
                    </div>
                    <span className="text-muted-foreground/60 text-lg leading-none">›</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setPhotoMenuOpen(false)}
                  className="w-full mt-4 py-3 rounded-2xl text-foreground/70 text-sm font-bold hover:bg-muted/60 transition-colors"
                >
                  Cancel
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Live camera capture */}
        <AnimatePresence>
          {cameraOpen && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/80 backdrop-blur-sm p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
            >
              <motion.div
                className="w-full max-w-sm bg-background rounded-3xl p-5 shadow-2xl ring-1 ring-border/60"
                initial={{ y: 16, opacity: 0, scale: 0.98 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: 16, opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-foreground font-black text-base tracking-tight">Take a photo</h3>
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="text-muted-foreground hover:text-foreground text-sm font-bold px-2 py-1 rounded-lg hover:bg-muted/60"
                  >
                    Close
                  </button>
                </div>

                <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-foreground/90 ring-1 ring-border">
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="absolute inset-0 w-full h-full object-cover scale-x-[-1]"
                  />
                  {cameraStarting && (
                    <div className="absolute inset-0 flex items-center justify-center text-background/90 text-xs">
                      <Loader2 className="w-5 h-5 animate-spin mr-2" /> Starting camera…
                    </div>
                  )}
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeCamera}
                    className="flex-1 py-3 rounded-2xl text-foreground/70 text-sm font-bold hover:bg-muted/60 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={capturePhoto}
                    disabled={cameraStarting || capturing}
                    className="flex-1 py-3 rounded-2xl bg-[var(--bbdo-red)] text-white text-sm font-black inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {capturing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                    {capturing ? "Saving…" : "Capture"}
                  </button>
                </div>

                <p className="text-[10px] text-muted-foreground text-center mt-2">
                  If the camera doesn't open, allow camera access in your browser's site settings.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* Personal Info */}
        <motion.div
          className="liquid-glass rounded-2xl p-5 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <h3 className="text-foreground font-bold text-sm leading-tight break-words">Personal Information</h3>
          <Field label="Full Name" icon={User} value={name} onChange={setName} placeholder="Your name" />
          <div className="space-y-1 min-w-0">
            <Label className="text-muted-foreground text-[11px] font-medium flex items-center gap-1.5 leading-tight">
              <Phone className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              Phone
            </Label>
            <div className="flex gap-2 min-w-0">
              {phoneLocked ? (
                <div className="bg-muted/40 border border-border/70 text-muted-foreground text-sm rounded-lg h-10 w-24 shrink-0 flex items-center justify-center">
                  {countryCode || "+91"}
                </div>
              ) : (
                <Input
                  type="tel"
                  inputMode="tel"
                  value={countryCode}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^\d+]/g, "").slice(0, 5);
                    setCountryCode(raw.startsWith("+") ? raw : `+${raw.replace(/\+/g, "")}`);
                  }}
                  placeholder="+1"
                  aria-label="Country code"
                  className="w-24 shrink-0 text-center bg-background border border-border/70 text-foreground text-sm rounded-lg h-10 px-2 py-2 shadow-none"
                />
              )}
              <Input
                type="tel"
                inputMode="tel"
                value={phone}
                onChange={phoneLocked ? undefined : (e) => setPhone(e.target.value.replace(/[^\d]/g, "").slice(0, 15))}
                readOnly={phoneLocked}
                disabled={phoneLocked}
                aria-readonly={phoneLocked}
                title={phoneLocked ? "Phone number is your login ID and can't be changed" : undefined}
                placeholder="Phone number"
                className={
                  phoneLocked
                    ? "flex-1 min-w-0 bg-muted/40 border border-border/70 text-muted-foreground text-sm rounded-lg h-10 px-3 py-2 shadow-none cursor-not-allowed"
                    : "flex-1 min-w-0 bg-background border border-border/70 text-foreground text-sm rounded-lg h-10 px-3 py-2 shadow-none"
                }
              />
            </div>
            <p className="text-[10px] text-muted-foreground/80 leading-tight">
              {phoneLocked
                ? "Phone number is your login ID and can't be changed."
                : "Add your phone number so your coach can reach you. Once saved, it can't be changed."}
            </p>
          </div>
          <Field label="Email" icon={Mail} value={email} onChange={setEmail} placeholder="you@example.com" type="email" />
          <div className="grid grid-cols-2 gap-3 min-w-0">
            <Field
              label="Date of Birth"
              icon={Calendar}
              value={birthDate}
              onChange={(v) => {
                setBirthDate(v);
                const derived = computeAgeFromDob(v);
                if (derived != null) setAge(String(derived));
              }}
              placeholder="YYYY-MM-DD"
              type="date"
            />
            <Field
              label="Age"
              icon={Calendar}
              value={age}
              onChange={setAge}
              placeholder="Age"
              type="number"
              readOnly={!!birthDate}
              hint={birthDate ? "Auto from DOB" : undefined}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs leading-tight break-words">Gender</Label>
            <div className="flex gap-2">
              {genders.map((g) => (
                <button
                  key={g}
                  onClick={() => setGender(g.toLowerCase())}
                  className={`flex-1 min-w-0 py-2.5 px-2 rounded-xl text-xs font-semibold leading-tight break-words transition-colors ${
                    gender === g.toLowerCase()
                      ? "bg-primary text-primary-foreground"
                      : "liquid-glass text-muted-foreground"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Family & Marital */}
        <motion.div
          className="liquid-glass rounded-2xl p-5 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
        >
          <h3 className="text-foreground font-bold text-sm leading-tight break-words">Family Details</h3>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs flex items-start gap-1.5 leading-tight break-words">
              <Heart className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              Marital Status
            </Label>
            <div className="grid grid-cols-4 gap-1.5">
              {maritalOptions.map((m) => (
                <button
                  key={m}
                  onClick={() => setMaritalStatus(m)}
                  className={`py-2 px-1 rounded-xl text-[10px] font-semibold leading-tight transition-colors ${
                    maritalStatus === m
                      ? "bg-primary text-primary-foreground"
                      : "liquid-glass text-muted-foreground"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {maritalStatus === "Married" && (
            <>
              <Field label="Spouse Name" icon={Users} value={spouseName} onChange={setSpouseName} placeholder="Partner's name" />
              <Field label="Anniversary Date" icon={Heart} value={anniversaryDate} onChange={setAnniversaryDate} placeholder="YYYY-MM-DD" type="date" />
            </>
          )}
        </motion.div>

        {/* Body Metrics */}
        <motion.div
          className="liquid-glass rounded-2xl p-5 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <h3 className="text-foreground font-bold text-sm leading-tight break-words">Body Metrics</h3>
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
            <Field label="Height (cm)" icon={Ruler} value={height} onChange={setHeight} placeholder="170" type="number" />
            <Field label="Weight (kg)" icon={Scale} value={weight} onChange={setWeight} placeholder="75" type="number" />
          </div>
          <Field label="Waist (inches)" icon={Ruler} value={waist} onChange={setWaist} placeholder="32" type="number" />
        </motion.div>

        {/* Address */}
        <motion.div
          className="liquid-glass rounded-2xl p-5 space-y-4"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="min-w-0 text-foreground font-bold text-sm leading-tight break-words">Address</h3>
            <button
              onClick={handleDetectLocation}
              disabled={detecting}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold leading-tight hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {detecting ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LocateFixed className="w-3.5 h-3.5" strokeWidth={2} />
              )}
              {detecting ? "Detecting..." : "Detect Location"}
            </button>
          </div>
          <Field label="Address Line 1" icon={MapPin} value={addressLine1} onChange={setAddressLine1} placeholder="House/Flat No., Street" />
          <Field label="Address Line 2" icon={MapPin} value={addressLine2} onChange={setAddressLine2} placeholder="Area, Landmark" />
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-3">
            <Field label="City" icon={MapPin} value={city} onChange={setCity} placeholder="City" />
            <Field label="State" icon={MapPin} value={state} onChange={setState} placeholder="State" />
          </div>
          <Field label="Pincode" icon={MapPin} value={pincode} onChange={setPincode} placeholder="560001" />
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs flex items-start gap-1.5 leading-tight break-words">
              <MapPin className="w-3.5 h-3.5 shrink-0" strokeWidth={1.8} />
              Country
            </Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger className="bg-white border border-border/70 text-foreground text-sm rounded-lg h-10 shadow-none">
                <SelectValue placeholder="Select country" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {COUNTRIES.map((c) => (
                  <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </motion.div>

        {/* Lifestyle Info */}
        {(

          <motion.div
            className="liquid-glass rounded-2xl p-5 space-y-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
          >
            <h3 className="text-foreground font-bold text-sm flex items-start gap-2 leading-tight break-words">
              <Bike className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.8} />
              Lifestyle
            </h3>
            <ToggleChip label="Smoking" value={lifestyle.smoking ? "yes" : "no"} onChange={(v) => setLifestyle({ ...lifestyle, smoking: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip label="Alcohol" value={lifestyle.alcohol ?? ""} onChange={(v) => setLifestyle({ ...lifestyle, alcohol: v })} options={[{ id: "none", label: "None" }, { id: "moderate", label: "Moderate" }, { id: "high", label: "High" }]} />
            <ToggleChip label="Activity Level" value={lifestyle.activity ?? ""} onChange={(v) => setLifestyle({ ...lifestyle, activity: v })} options={[{ id: "sedentary", label: "Sedentary" }, { id: "light", label: "Light" }, { id: "moderate", label: "Moderate" }, { id: "active", label: "Active" }]} />
            {/* Diet moved to the Diet & Allergies section — single source of truth */}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground text-xs">Sleep ({lifestyle.sleepHours ?? 7} hrs)</Label>
              <input type="range" min={3} max={12} step={0.5} value={lifestyle.sleepHours ?? 7} onChange={(e) => setLifestyle({ ...lifestyle, sleepHours: parseFloat(e.target.value) })} className="w-full h-2 rounded-full appearance-none cursor-pointer" style={{ background: `linear-gradient(to right, hsl(var(--primary)) 0%, hsl(var(--primary)) ${(((lifestyle.sleepHours ?? 7) - 3) / 9) * 100}%, hsl(var(--border)) ${(((lifestyle.sleepHours ?? 7) - 3) / 9) * 100}%, hsl(var(--border)) 100%)` }} />
            </div>
          </motion.div>
        )}

        {/* Clinical / Health Conditions */}
        {(
          <motion.div className="liquid-glass rounded-2xl p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.22 }}>
            <h3 className="text-foreground font-bold text-sm flex items-start gap-2 leading-tight break-words">
              <Activity className="w-4 h-4 shrink-0 text-destructive" strokeWidth={1.8} />
              Health Conditions
            </h3>
            <ToggleChip label="Diabetes" value={clinical.hasDiabetes ? "yes" : "no"} onChange={(v) => setClinical({ ...clinical, hasDiabetes: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            {clinical.hasDiabetes && (
              <ToggleChip label="Diabetes Type" value={clinical.diabetesType ?? ""} onChange={(v) => setClinical({ ...clinical, diabetesType: v })} options={[{ id: "type1", label: "Type 1" }, { id: "type2", label: "Type 2" }, { id: "prediabetes", label: "Prediabetes" }]} />
            )}
            <ToggleChip label="Hypertension" value={clinical.hasHypertension ? "yes" : "no"} onChange={(v) => setClinical({ ...clinical, hasHypertension: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip label="Cardiovascular" value={clinical.hasCardiovascular ? "yes" : "no"} onChange={(v) => setClinical({ ...clinical, hasCardiovascular: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
          </motion.div>
        )}

        {/* Deep Profiling */}
        {(
          <motion.div className="liquid-glass rounded-2xl p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.26 }}>
            <h3 className="text-foreground font-bold text-sm flex items-start gap-2 leading-tight break-words">
              <FlaskConical className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.8} />
              Detailed Health Profile
            </h3>
            <Field label="HbA1c (%)" icon={FlaskConical} value={deepProfiling.hba1cInput?.toString() ?? ""} onChange={(v) => setDeepProfiling({ ...deepProfiling, hba1cInput: v ? parseFloat(v) : null })} placeholder="5.7" type="number" />
            <Field label="Fasting Glucose (mg/dL)" icon={FlaskConical} value={deepProfiling.fastingGlucose?.toString() ?? ""} onChange={(v) => setDeepProfiling({ ...deepProfiling, fastingGlucose: v ? parseFloat(v) : null })} placeholder="100" type="number" />
            <ToggleChip label="Belly Fat" value={deepProfiling.bellyFat ? "yes" : "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, bellyFat: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip label="Medications Count" value={deepProfiling.medicationCount ?? "none"} onChange={(v) => setDeepProfiling({ ...deepProfiling, medicationCount: v })} options={[{ id: "none", label: "None" }, { id: "0_1", label: "0-1" }, { id: "2_3", label: "2-3" }, { id: "4_plus", label: "4+" }]} />
            
            {/* Detailed Medication List */}
            {deepProfiling.medicationCount && deepProfiling.medicationCount !== "none" && (
              <div className="space-y-2">
                <Label className="text-foreground text-xs font-bold flex items-center gap-1.5">
                  <Pill className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} />
                  My Medicines
                </Label>
                <p className="text-muted-foreground text-[10px]">Add each medicine you take with dosage and timing</p>
                <MedicationListEditor
                  medications={deepProfiling.medicationsList ?? []}
                  onChange={(list) => setDeepProfiling({ ...deepProfiling, medicationsList: list })}
                />
              </div>
            )}

            <ToggleChip label="Insulin" value={deepProfiling.medications ?? "none"} onChange={(v) => setDeepProfiling({ ...deepProfiling, medications: v })} options={[{ id: "none", label: "No" }, { id: "insulin", label: "Insulin Only" }, { id: "insulin_plus", label: "Insulin + Oral" }]} />
            <ToggleChip label="BP Medication" value={deepProfiling.bpMedication ? "yes" : "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, bpMedication: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip label="Lipid Medication" value={deepProfiling.lipidMedication ? "yes" : "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, lipidMedication: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip label="Thyroid Medication" value={deepProfiling.thyroidMedication ? "yes" : "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, thyroidMedication: v === "yes" })} options={[{ id: "yes", label: "Yes" }, { id: "no", label: "No" }]} />
            <ToggleChip
              label="Thyroid"
              value={
                deepProfiling.thyroid === "hypothyroid" || deepProfiling.thyroid === "hyperthyroid"
                  ? "yes"
                  : (deepProfiling.thyroid ?? "no")
              }
              onChange={(v) => setDeepProfiling({
                ...deepProfiling,
                thyroid: v,
                // Clear the sub-type when the user says No so the follow-up hides cleanly
                thyroidType: v === "yes" ? (deepProfiling.thyroidType ?? "unsure") : undefined,
              })}
              options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]}
            />
            {(deepProfiling.thyroid === "yes"
              || deepProfiling.thyroid === "hypothyroid"
              || deepProfiling.thyroid === "hyperthyroid") && (
              <ToggleChip
                label="Thyroid Type"
                value={
                  deepProfiling.thyroidType
                    ?? (deepProfiling.thyroid === "hypothyroid" || deepProfiling.thyroid === "hyperthyroid"
                        ? deepProfiling.thyroid
                        : "unsure")
                }
                onChange={(v) => setDeepProfiling({ ...deepProfiling, thyroid: "yes", thyroidType: v })}
                options={[{ id: "hypothyroid", label: "Hypothyroid" }, { id: "hyperthyroid", label: "Hyperthyroid" }, { id: "unsure", label: "Not Sure" }]}
              />
            )}
            <ToggleChip label="Vitamin D Deficient" value={deepProfiling.vitaminD ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, vitaminD: v })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]} />
            <ToggleChip label="Fatty Liver" value={deepProfiling.fattyLiver ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, fattyLiver: v })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]} />
            <ToggleChip label="Kidney Disease" value={deepProfiling.kidneyDisease ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, kidneyDisease: v, kidneyStones: v === "yes" ? (deepProfiling.kidneyStones ?? "no") : undefined })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]} />
            {deepProfiling.kidneyDisease === "yes" && (
              <ToggleChip label="Kidney Stones" value={deepProfiling.kidneyStones ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, kidneyStones: v })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }]} />
            )}
            <ToggleChip label="Iron Deficiency" value={deepProfiling.ironDeficiency ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, ironDeficiency: v })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]} />
            {gender === "female" && (
              <ToggleChip label="PMOS" value={deepProfiling.pcos ?? "no"} onChange={(v) => setDeepProfiling({ ...deepProfiling, pcos: v })} options={[{ id: "no", label: "No" }, { id: "yes", label: "Yes" }, { id: "unsure", label: "Not Sure" }]} />
            )}
            <Field label="Uric Acid (mg/dL)" icon={FlaskConical} value={deepProfiling.uricAcid?.toString() ?? ""} onChange={(v) => setDeepProfiling({ ...deepProfiling, uricAcid: v ? parseFloat(v) : null })} placeholder="5.5" type="number" />
            <ToggleChip label="Diet Quality" value={deepProfiling.dietQuality ?? "average"} onChange={(v) => setDeepProfiling({ ...deepProfiling, dietQuality: v })} options={[{ id: "poor", label: "Poor" }, { id: "average", label: "Average" }, { id: "good", label: "Good" }]} />
            <ToggleChip label="Stress Level" value={deepProfiling.stressLevel ?? "moderate"} onChange={(v) => setDeepProfiling({ ...deepProfiling, stressLevel: v })} options={[{ id: "low", label: "Low" }, { id: "moderate", label: "Moderate" }, { id: "high", label: "High" }]} />
          </motion.div>
        )}

        {/* Diet & Allergies */}
        <motion.div className="liquid-glass rounded-2xl p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.28 }}>
          <h3 className="text-foreground font-bold text-sm flex items-start gap-2 leading-tight break-words">
            <Utensils className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.8} />
            Diet & Allergies
          </h3>
          <ToggleChip
            label="Diet Preference"
            value={dietPrefs[0] ?? ""}
            onChange={(v) => setDietPrefs(v ? [v] : [])}
            options={[
              { id: "veg", label: "Vegetarian" },
              { id: "non_veg", label: "Non-Veg" },
              { id: "vegan", label: "Vegan" },
              { id: "eggitarian", label: "Eggetarian" },
              { id: "jain", label: "Jain" },
            ]}
          />
          <AllergyAndSubPrefs
            dietPrefs={dietPrefs}
            subPreferences={subPreferences}
            allergenFoodIds={allergenFoodIds}
            onSubChange={setSubPreferences}
            onAllergensChange={setAllergenFoodIds}
          />
        </motion.div>

        {/* List of symptoms */}
        <motion.div className="liquid-glass rounded-2xl p-5 space-y-3" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
          <h3 className="text-foreground font-bold text-sm flex items-start gap-2 leading-tight break-words">
            <Activity className="w-4 h-4 shrink-0 text-primary" strokeWidth={1.8} />
            List of Symptoms
          </h3>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Tick anything currently experienced. {coachMode ? "Visible to the client too." : "Your coach can see and update this."}
          </p>
          <SymptomsChecklist
            selectedKeys={symptomKeys}
            notes={symptomNotes}
            gender={gender}
            onSelectionChange={setSymptomKeys}
            onNotesChange={setSymptomNotes}
          />
        </motion.div>

        <motion.button
          onClick={requestSave}
          disabled={saving}
          className="w-full gradient-blue text-primary-foreground font-bold py-4 rounded-2xl glow-blue flex items-center justify-center gap-2 disabled:opacity-50"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          whileTap={{ scale: 0.98 }}
        >
          {saving ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
          ) : (
            <><Save className="w-4 h-4" strokeWidth={2} /> {coachMode ? "Save changes" : "Save Profile"}</>
          )}
        </motion.button>

        <div className="h-8" />
      </div>

      {/* Coach override confirmation */}
      {coachMode && confirmOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-foreground/40 backdrop-blur-sm p-4" onClick={() => setConfirmOpen(false)}>
          <div className="w-full max-w-sm bg-background rounded-2xl p-5 shadow-2xl ring-1 ring-border/60" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-foreground font-black text-base">Save changes?</h3>
            <p className="text-muted-foreground text-sm mt-1">
              You're overriding {targetName || "the client"}'s profile. Continue?
            </p>
            <div className="mt-4 flex gap-2">
              <button
                className="flex-1 py-3 rounded-xl bg-muted text-foreground text-sm font-bold"
                onClick={() => setConfirmOpen(false)}
              >
                Cancel
              </button>
              <button
                className="flex-1 py-3 rounded-xl bg-[var(--bbdo-red)] text-white text-sm font-black"
                onClick={() => { void handleSave(); }}
              >
                Yes, save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

  );
}
