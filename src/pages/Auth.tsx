import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Phone, ArrowLeft, ChevronRight, ShieldCheck, User, ChevronDown, Search, Globe, Mail } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { COUNTRIES, type Country } from "@/lib/countries";
import { fetchAuthRegions, getStoredRegionCode, INDIA_REGION, setStoredRegionCode, type AuthRegion } from "@/lib/regionPricing";

import { saveUser } from "@/lib/userStore";
import { supabase } from "@/integrations/supabase/client";
import { fetchProfile, loadProfileToLocal } from "@/lib/profileService";
import { fetchActiveSubscription } from "@/lib/subscriptionService";
import { isCoachUser, isAdminUser } from "@/lib/roleService";
import { isChannelPartner } from "@/lib/channelPartnerService";
import { EXPLICIT_LOGOUT_KEY, getExistingSessionUnlessLoggedOut } from "@/contexts/AuthContext";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@/components/ui/input-otp";
import logoImg from "@/assets/logo.png";
import AuthHeroCarousel from "@/components/AuthHeroCarousel";
import { toast } from "sonner";
import { persistSupabaseSessionToNative } from "@/lib/nativePersistence";
import { resolvePostAuthRoute } from "@/lib/accessControl";
import { msg91SendOtp, msg91VerifyOtp, startStaffOtp } from "@/lib/msg91";


function withTimeout<T>(promise: Promise<T>, fallback: T, ms = 2500): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

async function resolvePrivilegedRouteFast(userId: string): Promise<string | null> {
  // Role lookups decide whether staff land on their dashboard, so a slow
  // network must never silently downgrade them to the customer plans page.
  const check = async () => {
    const [isAdmin, isCoach, isPartner] = await Promise.all([
      withTimeout(isAdminUser(userId), null as boolean | null, 8000),
      withTimeout(isCoachUser(userId), null as boolean | null, 8000),
      withTimeout(isChannelPartner(userId), null as boolean | null, 8000),
    ]);
    if (isAdmin) return "/admin-dashboard";
    if (isCoach) return "/coach-dashboard";
    if (isPartner) return "/partner-dashboard";
    const inconclusive = isAdmin === null || isCoach === null || isPartner === null;
    return inconclusive ? undefined : null;
  };

  const first = await check();
  if (first !== undefined) return first;
  const second = await check();
  return second ?? null;
}


export default function Auth() {
  const [step, setStep] = useState<"phone" | "otp" | "name">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState("");
  const [msg91ReqId, setMsg91ReqId] = useState<string | null>(null);
  const [staffOtp, setStaffOtp] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [name, setName] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [emailError, setEmailError] = useState("");
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sessionPreparing, setSessionPreparing] = useState(true);
  const [country, setCountry] = useState<Country>(COUNTRIES[0]);
  const [countrySearch, setCountrySearch] = useState("");
  const [countryOpen, setCountryOpen] = useState(false);
  // Seed from the cached last choice so the correct mode (phone vs email) and
  // flag render on the very first frame — no flash of India before the fetch.
  const [region, setRegion] = useState<AuthRegion>(() => getStoredRegion());
  const [regions, setRegions] = useState<AuthRegion[]>(() => {
    const stored = getStoredRegion();
    return stored.code === INDIA_REGION.code ? [INDIA_REGION] : [INDIA_REGION, stored];
  });
  const [regionOpen, setRegionOpen] = useState(false);
  const [loginEmail, setLoginEmail] = useState("");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawNext = searchParams.get("next");
  const nextPath = rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : null;
  const go = (route: string, options?: { replace?: boolean }) => navigate(nextPath ?? route, options);
  const filteredCountries = COUNTRIES.filter((c) => {
    const q = countrySearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase().includes(q);
  });

  // India signs in with phone + SMS OTP; every other pricing region uses email OTP.
  const isEmailMode = region.method === "email";
  const normalizedLoginEmail = loginEmail.trim().toLowerCase();
  const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedLoginEmail);
  const email = isEmailMode ? normalizedLoginEmail : `${phone}@bbd.app`;
  const password = isEmailMode ? `bbd_email_${normalizedLoginEmail}_secure` : `bbd_${phone}_secure`;


  const persistNativeSession = async (session?: { access_token?: string; refresh_token?: string } | null) => {
    try {
      await persistSupabaseSessionToNative(session);
    } catch {
      /* native storage may be unavailable in preview */
    }
  };

  useEffect(() => {
    let cancelled = false;

    const prepareSession = async () => {
      try {
        if (sessionStorage.getItem("bb_skip_auth_prepare_once") === "1") {
          sessionStorage.removeItem("bb_skip_auth_prepare_once");
          if (!cancelled) setSessionPreparing(false);
          return;
        }
      } catch {
        /* continue with normal preparation */
      }

      try {
        const existingSession = await Promise.race([
          getExistingSessionUnlessLoggedOut(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 1600)),
        ]);
        if (existingSession) {
          const route = await resolvePostAuthRoute(existingSession.user.id, { missingProfileRoute: null });
          if (route) {
            go(route, { replace: true });
            return;
          }
          if (!cancelled) setSessionPreparing(false);
          return;
        }
      } catch {
        /* fall through to fresh login prep */
      }
      if (!cancelled) setSessionPreparing(false);
    };

    prepareSession();


    return () => {
      cancelled = true;
    };
  }, [navigate]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  // Regions come from the same backend configuration that drives package pricing.
  useEffect(() => {
    let cancelled = false;
    fetchAuthRegions()
      .then((list) => {
        if (!cancelled && list.length) setRegions(list);
      })
      .catch(() => {
        /* keep India-only fallback */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Restore the previously chosen region once the list arrives.
  useEffect(() => {
    const stored = getStoredRegionCode();
    const match = regions.find((r) => r.code === stored);
    if (match && match.code !== region.code) setRegion(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regions]);

  // Email-OTP users already gave us their address — carry it into the profile step.
  useEffect(() => {
    if (step === "name" && isEmailMode && !emailInput && normalizedLoginEmail) {
      setEmailInput(normalizedLoginEmail);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, isEmailMode, normalizedLoginEmail]);

  const identifier = `${country.dial.replace(/\D/g, "")}${phone}`;

  // Fixed-code logins used where SMS delivery is unavailable (super admin and
  // the persistent Google Play review account).
  const FIXED_OTP_ACCOUNTS = {
    "8373914073": { code: "2503", destination: "/admin-dashboard" },
    "9000000001": { code: "1111", destination: null },
  } as const;
  const fixedOtpPhone = phone.replace(/\D/g, "").slice(-10) as keyof typeof FIXED_OTP_ACCOUNTS;
  const fixedOtpAccount = isEmailMode ? undefined : FIXED_OTP_ACCOUNTS[fixedOtpPhone];
  const isFixedOtpPhone = Boolean(fixedOtpAccount);
  const otpLength = fixedOtpAccount?.code.length ?? 4;
  const canSubmitIdentity = isEmailMode ? emailLooksValid : phone.length === 10;

  const selectRegion = (next: AuthRegion) => {
    setRegion(next);
    setStoredRegionCode(next.code);
    setRegionOpen(false);
    setOtp("");
    setOtpError("");
    setStep("phone");
    const match = COUNTRIES.find((c) => c.code === next.code);
    if (match) setCountry(match);
  };

  const sendEmailCode = async () => {
    const { data, error } = await supabase.functions.invoke("email-otp", {
      body: { action: "send", email: normalizedLoginEmail },
    });
    if (error || !data?.ok) {
      throw new Error(data?.error || "Could not send the code. Please try again.");
    }
  };

  const sendOtp = async () => {
    if (!canSubmitIdentity || loading) return;
    setLoading(true);
    setOtpError("");

    try {
      if (isEmailMode) {
        setStoredRegionCode(region.code);
        saveUser({ profile: { email: normalizedLoginEmail, country: region.name } as any });
        await sendEmailCode();
        setStaffOtp(false);
        setMsg91ReqId(null);
        setStep("otp");
        setOtp("");
        setResendCooldown(30);
        return;
      }
      setStoredRegionCode(INDIA_REGION.code);
      saveUser({ profile: { phone, country: country.name, country_code: country.dial } as any });
      if (isFixedOtpPhone) {
        setStaffOtp(true);
        setMsg91ReqId(null);
        setStep("otp");
        setOtp("");
        setResendCooldown(30);
        return;
      }
      const staffResult = await startStaffOtp(phone, country.dial);
      const reqId = await msg91SendOtp(identifier);
      setStaffOtp(staffResult.staff);
      setMsg91ReqId(reqId);
      setStep("otp");
      setOtp("");
      setResendCooldown(30);
    } catch (error) {
      toast.error((error as Error).message || "Could not send the code. Please try again.");
    } finally {
      setLoading(false);
    }
  };


  const resendOtp = async () => {
    if (resendCooldown > 0 || loading) return;
    setOtpError("");
    if (isFixedOtpPhone) {
      setOtp("");
      setResendCooldown(30);
      toast.success("Use your fixed access code.");
      return;
    }
    setLoading(true);
    try {
      if (isEmailMode) {
        await sendEmailCode();
      } else {
        const reqId = await msg91SendOtp(identifier);
        setMsg91ReqId(reqId);
      }
      setOtp("");
      setResendCooldown(30);
      toast.success("New verification code sent.");
    } catch (error) {
      toast.error((error as Error).message || "Could not resend the code.");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (code?: string) => {
    const submitted = (code ?? otp).replace(/\D/g, "");
    if (submitted.length < 4 || loading) return;
    setOtpError("");
    setLoading(true);

    if (isFixedOtpPhone) {
      if (submitted !== fixedOtpAccount?.code) {
        setOtpError("Wrong code. Please try again.");
        setOtp("");
        setLoading(false);
        return;
      }
    } else if (isEmailMode) {
      try {
        const { data, error } = await supabase.functions.invoke("email-otp", {
          body: {
            action: "verify",
            email: normalizedLoginEmail,
            code: submitted,
            region_code: region.code,
            country: region.name,
          },
        });
        if (error || !data?.ok) {
          throw new Error(data?.error || "Wrong code. Please try again.");
        }
      } catch (error) {
        setOtpError((error as Error).message || "Wrong code. Please try again.");
        setOtp("");
        setLoading(false);
        return;
      }
    } else {
    try {
      const accessToken = await msg91VerifyOtp(submitted, msg91ReqId);
      const { data, error } = await supabase.functions.invoke("msg91-verify-otp", {
        body: { phone: identifier, otp: submitted, accessToken },
      });
      if (error || !data?.ok) {
        throw new Error(data?.error || "Verification failed. Please try again.");
      }
    } catch (error) {
      setOtpError((error as Error).message || "Wrong code. Please try again.");
      setOtp("");
      setLoading(false);
      return;
    }
    }








    try {
      try { localStorage.removeItem(EXPLICIT_LOGOUT_KEY); } catch {}
      // The fixed superadmin code bypasses the SMS provider, but it must still
      // create/refresh a real backend session before entering the admin area.
      // Re-sync the deterministic phone account first so an old password can
      // never leave this account stuck after a valid 2503 verification.
      if (isFixedOtpPhone) {
        const { data: ensured, error: ensureError } = await supabase.functions.invoke("ensure-phone-user", {
          body: { phone: fixedOtpPhone, country: country.name, country_code: country.dial },
        });
        if (ensureError || !ensured?.ok) {
          throw new Error(ensured?.error || "Could not prepare the superadmin session.");
        }
      }
      // Try sign in first (existing user)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInData?.user) {
        void persistNativeSession(signInData.session);
        const userId = signInData.user.id;

        // Auto-link coach and partner records by phone
        if (!isEmailMode) {
          void Promise.allSettled([
            supabase.rpc("link_coach_to_user" as any, { _user_id: userId, _phone: phone }),
            supabase.rpc("link_partner_to_user" as any, { _user_id: userId, _phone: phone }),
          ]);
        }

        // Existing user — resolve role/profile/payment in parallel for fast OTP handoff.
        const [privilegedRoute, profile, activeSubscription] = await Promise.all([
          resolvePrivilegedRouteFast(userId),
          fetchProfile(userId),
          fetchActiveSubscription(userId),
        ]);
        if (profile) {
          saveUser({
            profile: isEmailMode
              ? ({ email: normalizedLoginEmail, country: region.name } as any)
              : ({ phone, country: country.name, country_code: country.dial } as any),
          });
          loadProfileToLocal(profile);
        }

        // This number is an explicitly configured superadmin. Its database
        // role is still enforced by AdminDashboard; this avoids customer-flow
        // fallback if a role request is briefly slow immediately after login.
        const destination = fixedOtpAccount?.destination ?? privilegedRoute;
        if (destination) {
          setLoading(false);
          go(destination);
          return;
        }
        const route = activeSubscription
          ? "/home"
          : profile?.onboarding_completed
          ? "/plans"
          : profile?.name
          ? "/setup/purpose"
          : null;
        if (route) {
          setLoading(false);
          go(route);
          return;
        }
        setLoading(false);
        setStep("name");
        return;
      }

      // User doesn't exist yet, or an earlier sign-up exists without an active session.
      if (signInError) {
        if (!isEmailMode) {
          const { data: ensureData, error: ensureError } = await supabase.functions.invoke("ensure-phone-user", {
            body: { phone, country: country.name, country_code: country.dial },
          });
          if (ensureError || !ensureData?.ok) {
            toast.error("We couldn't start your secure session. Please try again.");
            setLoading(false);
            return;
          }
        }

        const { data: newSessionData, error: newSessionError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (newSessionError || !newSessionData?.user) {
          toast.error("We couldn't start your secure session. Please enter the OTP again.");
          setLoading(false);
          setStep("otp");
          return;
        }
        void persistNativeSession(newSessionData.session);

        const signedInNewUser = newSessionData.user;

        if (signedInNewUser) {
          // Auto-link coach or partner record by phone if it exists
          const linkResults = isEmailMode
            ? null
            : await Promise.race([
                Promise.allSettled([
                  supabase.rpc("link_coach_to_user" as any, { _user_id: signedInNewUser.id, _phone: phone }),
                  supabase.rpc("link_partner_to_user" as any, { _user_id: signedInNewUser.id, _phone: phone }),
                ]),
                new Promise<null>((resolve) => setTimeout(() => resolve(null), 1200)),
              ]);
          if (linkResults) {
            const [coachResult, partnerResult] = linkResults;
            if (coachResult.status === "fulfilled" && (coachResult.value as any)?.data) {
              setLoading(false);
              go("/coach-dashboard");
              return;
            }
            if (partnerResult.status === "fulfilled" && (partnerResult.value as any)?.data) {
              setLoading(false);
              go("/partner-dashboard");
              return;
            }
          }

          await supabase.from("profiles" as any).upsert(
            isEmailMode
              ? ({
                  user_id: signedInNewUser.id,
                  email: normalizedLoginEmail,
                  country: region.name,
                  region_code: region.code,
                } as any)
              : ({
                  user_id: signedInNewUser.id,
                  phone,
                  country: country.name,
                  country_code: country.dial,
                } as any),
            { onConflict: "user_id" },
          );


          // Referral codes are now applied at payment time.

          // This account may be an existing member (e.g. admin) whose password
          // was just re-synced — resolve their real destination before falling
          // back to the onboarding name step.
          const [privilegedRoute2, profile2, activeSubscription2] = await Promise.all([
            resolvePrivilegedRouteFast(signedInNewUser.id),
            fetchProfile(signedInNewUser.id),
            fetchActiveSubscription(signedInNewUser.id),
          ]);
          if (profile2) loadProfileToLocal(profile2);
          const resolvedRoute =
            privilegedRoute2 ??
            (activeSubscription2
              ? "/home"
              : profile2?.onboarding_completed
              ? "/plans"
              : profile2?.name
              ? "/setup/purpose"
              : null);
          setLoading(false);
          if (resolvedRoute) {
            go(resolvedRoute);
            return;
          }
          setStep("name");
          return;
        }

      }

      if (signInError) {
        toast.error(signInError.message);
      }
    } catch (err) {
      toast.error("Something went wrong. Please try again.");
      console.error(err);
    }

    setLoading(false);
  };

  const submitName = async () => {
    if (name.trim().length < 2) return;
    const trimmedEmail = emailInput.trim();
    if (!trimmedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      setEmailError("Please enter a valid email address");
      return;
    }
    setLoading(true);
    setEmailError("");

    // Email uniqueness check with a hard 4s timeout so we never spin forever.
    // If the check times out or errors, allow the user through — DB unique
    // constraint on profiles.email is the real guard.
    const uniquenessCheck = supabase.rpc("email_exists" as any, { _email: trimmedEmail });
    const timeout = new Promise<{ data: any; error: any }>((resolve) =>
      setTimeout(() => resolve({ data: null, error: null }), 4000)
    );
    const { data: exists, error: checkErr } = (await Promise.race([uniquenessCheck, timeout])) as any;

    // In email-OTP regions the user already owns this email, so skip the clash.
    if (!checkErr && exists === true && trimmedEmail.toLowerCase() !== normalizedLoginEmail) {
      setLoading(false);
      setEmailError("This email is already registered. Please sign in with the phone number linked to it.");
      return;
    }

    const identityFields = isEmailMode
      ? { country: region.name, region_code: region.code }
      : { phone, country: country.name, country_code: country.dial };

    saveUser({ profile: { name: name.trim(), email: trimmedEmail, ...identityFields } as any });

    // Prefer local session (no network) — user just verified OTP moments ago.
    const { data: sessionData } = await supabase.auth.getSession();
    const userId = sessionData.session?.user?.id;

    const profilePayload = { name: name.trim(), email: trimmedEmail, ...identityFields } as any;


    // Fire the profile update + native persistence in the background; don't block navigation.
    if (userId) {
      void supabase
        .from("profiles" as any)
        .update(profilePayload)
        .eq("user_id", userId)
        .then(({ error }) => {
          if (error) console.error("Failed to save name/email:", error);
        });
      void persistNativeSession(sessionData.session);
    } else {
      // No local session — recover in background but don't make the user wait.
      void supabase.auth.signInWithPassword({ email, password }).then(async ({ data }) => {
        if (data?.user) {
          void supabase.from("profiles" as any).update(profilePayload).eq("user_id", data.user.id);
          void persistNativeSession(data.session);
        }
      });
    }

    setLoading(false);
    go("/setup/purpose");
  };

  const stepIndex = step === "phone" ? 0 : step === "otp" ? 1 : 2;

  if (sessionPreparing) {
    return (
      <div className="phone-container min-h-dvh flex items-center justify-center bg-background">
        <div className="w-6 h-6 border-2 border-primary/25 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="phone-container min-h-dvh flex flex-col relative overflow-hidden bg-background">
      {/* Ambient brand orbs */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 w-72 h-72 rounded-full opacity-30 blur-3xl hidden md:block"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)/0.35), transparent 70%)" }} />
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -left-16 w-72 h-72 rounded-full opacity-25 blur-3xl hidden md:block"
        style={{ background: "radial-gradient(circle, hsl(var(--destructive)/0.30), transparent 70%)" }} />

      <div className={`relative z-10 flex flex-col flex-1 ${step === "name" ? "px-6 mobile-bottom-safe pt-[calc(env(safe-area-inset-top)+1rem)]" : ""}`}>
        {/* Top bar only on name step */}
        {step === "name" && (
          <div className="flex items-center justify-between mt-4 mb-8">
            <button onClick={() => { setStep("phone"); setOtp(""); }} className="top-icon-btn" aria-label="Back">
              <ArrowLeft className="w-4 h-4" strokeWidth={2} />
            </button>
            <div className="flex items-center gap-1.5">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  animate={{ width: i === stepIndex ? 22 : 6, opacity: i <= stepIndex ? 1 : 0.25 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="h-1.5 rounded-full bg-primary"
                />
              ))}
            </div>
            <span className="w-10 h-10" />
          </div>
        )}

        <AnimatePresence initial={false} mode="wait">
          {step === "phone" && (
            <motion.div key="phone" className="flex flex-col flex-1"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}

              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>

              {/* Top half hero image — extends to top edge */}
              <div className="relative h-[38vh] min-h-[220px] max-h-[300px] overflow-hidden shadow-card shrink-0">

                <AuthHeroCarousel />
                <div className="absolute inset-x-0 bottom-0 p-6 pb-8 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

              </div>

              {/* Bottom half content */}
              <div className="flex flex-col flex-1 px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+var(--bbdo-native-bottom-guard,0px)+1rem)]">
                {regions.length > 1 && (
                  <Popover open={regionOpen} onOpenChange={setRegionOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="self-start mb-4 flex items-center gap-2 pl-3 pr-2.5 py-1.5 rounded-full bg-white shadow-lift border-2 border-border hover:border-primary/50 transition-colors"
                        aria-label="Select your country or region"
                      >
                        <Globe className="w-3.5 h-3.5 text-primary" strokeWidth={2.4} />
                        <span className="text-lg leading-none">{region.flag}</span>
                        <span className="text-foreground font-bold text-[13px]">{region.name}</span>
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2.5} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="p-0 w-[260px] rounded-2xl overflow-hidden">
                      <div className="max-h-64 overflow-y-auto py-1">
                        {regions.map((r) => (
                          <button
                            key={r.code}
                            type="button"
                            onClick={() => selectRegion(r)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors ${region.code === r.code ? "bg-muted/40" : ""}`}
                          >
                            <span className="text-lg leading-none">{r.flag}</span>
                            <span className="text-foreground text-[14px] font-semibold flex-1 truncate">{r.name}</span>
                            <span className="text-muted-foreground text-[12px] font-bold">{r.currency}</span>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                )}

                <h1 className="text-foreground text-[32px] leading-[1.05] font-black tracking-[-0.03em]">
                  {isEmailMode ? (<>What's your <br /> email address?</>) : (<>What's your <br /> phone number?</>)}
                </h1>
                <p className="text-muted-foreground text-[14px] mt-3 leading-relaxed">
                  {isEmailMode
                    ? "We'll email you a 4-digit code to verify it's you. No spam, ever."
                    : "We'll text you a 4-digit code to verify it's you. No spam, ever."}
                </p>

                <div className="mt-6">
                  {isEmailMode ? (
                    <div className={`relative rounded-full bg-white shadow-lift border-2 px-5 flex items-center gap-3 transition-all ${emailLooksValid ? "border-primary ring-4 ring-primary/20" : "border-border"}`}>
                      <Mail className="w-4 h-4 text-muted-foreground shrink-0" strokeWidth={2.2} />
                      <input
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        placeholder="you@example.com"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                        className="w-full bg-transparent text-foreground font-bold text-[16px] outline-none placeholder:text-muted-foreground/60 placeholder:font-medium py-4"
                      />
                      {emailLooksValid && (
                        <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                          className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <span className="text-primary-foreground text-[11px] font-black">✓</span>
                        </motion.div>
                      )}
                    </div>
                  ) : (
                  <div className="flex items-stretch gap-2.5">
                    <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex items-center gap-2 px-4 rounded-full bg-white shadow-lift border-2 border-border shrink-0 hover:border-primary/50 transition-colors"
                          aria-label="Select country code"
                        >
                          <span className="text-lg leading-none">{country.flag}</span>
                          <span className="text-foreground font-bold text-[15px] tabular">{country.dial}</span>
                          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" strokeWidth={2.5} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="p-0 w-[280px] rounded-2xl overflow-hidden">
                        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
                          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                          <input
                            value={countrySearch}
                            onChange={(e) => setCountrySearch(e.target.value)}
                            placeholder="Search country or code"
                            className="w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/60"
                          />
                        </div>
                        <div className="max-h-64 overflow-y-auto py-1">
                          {filteredCountries.length === 0 ? (
                            <p className="text-muted-foreground text-[13px] px-4 py-6 text-center">No matches</p>
                          ) : filteredCountries.map((c) => (
                            <button
                              key={c.code}
                              type="button"
                              onClick={() => { setCountry(c); setCountryOpen(false); setCountrySearch(""); }}
                              className={`w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/60 transition-colors ${country.code === c.code ? "bg-muted/40" : ""}`}
                            >
                              <span className="text-lg leading-none">{c.flag}</span>
                              <span className="text-foreground text-[14px] font-semibold flex-1 truncate">{c.name}</span>
                              <span className="text-muted-foreground text-[13px] font-bold tabular">{c.dial}</span>
                            </button>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <div className={`relative flex-1 rounded-full bg-white shadow-lift border-2 px-5 flex items-center transition-all ${phone.length === 10 ? "border-primary ring-4 ring-primary/20" : "border-border"}`}>
                      <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel"
                        placeholder="98765 43210"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                        className="w-full bg-transparent text-foreground font-bold text-[18px] tracking-[0.02em] outline-none placeholder:text-muted-foreground/60 placeholder:font-medium py-4 tabular"
                      />

                      {phone.length === 10 && (
                        <motion.div initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }}
                          className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                          <span className="text-primary-foreground text-[11px] font-black">✓</span>
                        </motion.div>
                      )}
                    </div>
                  </div>
                  )}
                </div>


                <label className="text-muted-foreground text-[12px] mt-5 flex items-start gap-2.5 cursor-pointer select-none leading-relaxed">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded-md border-border accent-primary shrink-0 cursor-pointer"
                  />
                  <span>
                    I agree to the{" "}
                    <a href="https://www.byebyediabetesandobesity.com/terms" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline underline-offset-2">Terms</a>{" "}and{" "}
                    <a href="https://www.byebyediabetesandobesity.com/privacy" target="_blank" rel="noopener noreferrer" className="text-foreground font-bold underline underline-offset-2">Privacy Policy</a>.
                  </span>
                </label>

                <div className="ob-bottom">
                  <motion.button
                    onClick={sendOtp}
                    disabled={!canSubmitIdentity || !consent || loading}
                    whileTap={{ scale: 0.98 }}
                    className="ob-cta gradient-blue glow-blue disabled:opacity-40"
                  >
                    {loading
                      ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <>Send verification code <ChevronRight className="w-4 h-4" /></>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}

          {step === "otp" && (
            <motion.div key="otp" className="flex flex-col flex-1"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}

              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}>

              {/* Top half hero image */}
              <div className="relative h-[38vh] min-h-[220px] max-h-[300px] overflow-hidden shadow-card shrink-0">
                <AuthHeroCarousel />
                <button
                  onClick={() => { setStep("phone"); setOtp(""); }}
                  aria-label="Back"
                  className="absolute left-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur flex items-center justify-center shadow-card"
                  style={{ top: "calc(env(safe-area-inset-top) + 0.75rem)" }}
                >
                  <ArrowLeft className="w-4 h-4 text-foreground" strokeWidth={2.4} />
                </button>
                <div className="absolute inset-x-0 bottom-0 p-6 pb-8 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

              </div>

              {/* Bottom half content */}
              <div className="flex flex-col flex-1 px-6 pt-8 pb-[calc(env(safe-area-inset-bottom)+var(--bbdo-native-bottom-guard,0px)+1rem)]">
                <h1 className="text-foreground text-[26px] leading-[1.1] font-black tracking-[-0.03em]">
                  Enter the {otpLength}-digit code
                </h1>
                <p className="text-muted-foreground text-[14px] mt-2 leading-relaxed">
                  Sent to <span className="text-foreground font-bold tabular">{isEmailMode ? normalizedLoginEmail : `${country.dial} ${phone}`}</span>{" "}
                  <button onClick={() => { setStep("phone"); setOtp(""); }} className="text-primary font-bold underline underline-offset-2 ml-1">Change</button>
                </p>

                <div className="mt-6 flex justify-center">
                  <InputOTP
                    maxLength={otpLength}
                    value={otp}
                    disabled={loading}
                    onChange={(v) => {
                      setOtp(v);
                      if (otpError) setOtpError("");
                      if (v.length === otpLength && !loading) void verifyOtp(v);
                    }}
                  >
                    <InputOTPGroup className="gap-2.5">
                      {Array.from({ length: otpLength }, (_, i) => i).map((i) => (
                        <InputOTPSlot
                          key={i}
                          index={i}
                          className={`${otpLength > 4 ? "w-10 h-10" : "w-12 h-12"} !rounded-full bg-white shadow-lift border-2 !border-l-2 border-border text-foreground text-[20px] font-black tabular data-[active=true]:border-primary data-[active=true]:ring-4 data-[active=true]:ring-primary/25 ${otpError ? "ring-4 ring-destructive/30 border-destructive" : ""}`}
                        />
                      ))}
                    </InputOTPGroup>
                  </InputOTP>
                </div>

                {otpError && (
                  <p className="text-destructive text-[13px] text-center mt-4 font-semibold">{otpError}</p>
                )}

                {/* Resend disappears as soon as the code is submitted / being verified. */}
                {!loading && otp.length < otpLength && (
                  <div className="mt-4 text-center">
                    <button
                      onClick={resendOtp}
                      disabled={resendCooldown > 0}
                      className="text-[13px] font-bold text-primary disabled:text-muted-foreground disabled:font-semibold"
                    >
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>
                )}




                <div className="ob-bottom">
                  <motion.button
                    onClick={() => void verifyOtp()}
                    disabled={otp.length < otpLength || loading}

                    whileTap={{ scale: 0.98 }}
                    className="ob-cta gradient-blue glow-blue disabled:opacity-40"
                  >
                    {loading
                      ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      : <>Verify &amp; continue <ChevronRight className="w-4 h-4" /></>}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}


          {step === "name" && (
            <motion.div key="name" className="flex flex-col flex-1" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}>
              <motion.div className="mt-1 mb-6 flex flex-col items-center" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
                <div className="w-24 h-24 rounded-full flex items-center justify-center mb-3 bbdo-card overflow-hidden">
                  <img src={logoImg} alt="Bye Bye Diabetes" className="w-20 h-20 object-cover rounded-full" />
                </div>

                <h1 className="text-foreground font-black text-[19px] tracking-tight">Welcome aboard</h1>
                <p className="text-muted-foreground text-[12px] text-center mt-1 max-w-[240px] leading-relaxed">
                  Just a couple of details to personalise your plan.
                </p>
              </motion.div>

              <h2 className="text-[22px] font-black text-foreground mb-1 tracking-tight">Tell us about you</h2>
              <p className="text-muted-foreground text-[13px] mb-5 leading-relaxed">We'll personalise your experience and send invoices to your email.</p>

              <div className="mb-4">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-2 ml-0.5 block">Full name</label>
                <div className="liquid-glass-input px-4 py-3.5">
                  <input type="text" placeholder="e.g. Arjun, Priya, Rahul…" value={name} onChange={(e) => setName(e.target.value)}
                    className="w-full bg-transparent text-foreground font-medium text-base outline-none placeholder:text-muted-foreground" />
                </div>
              </div>

              <div className="mb-6">
                <label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.18em] mb-2 ml-0.5 block">Email address</label>
                <div className={`liquid-glass-input px-4 py-3.5 ${emailError ? "border-destructive" : ""}`}>
                  <input type="email" inputMode="email" autoComplete="email" placeholder="you@example.com" value={emailInput}
                    onChange={(e) => { setEmailInput(e.target.value); if (emailError) setEmailError(""); }}
                    className="w-full bg-transparent text-foreground font-medium text-base outline-none placeholder:text-muted-foreground" />
                </div>
                {emailError ? (
                  <p className="text-destructive text-[12px] font-semibold mt-2 ml-0.5">{emailError}</p>
                ) : name.trim().length >= 2 && (
                  <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-[12px] font-semibold mt-2 ml-0.5" style={{ color: "hsl(var(--success))" }}>
                    Hello, {name}! Let's build your health plan.
                  </motion.p>
                )}
              </div>

              <div className="ob-bottom">
                <motion.button onClick={submitName} disabled={name.trim().length < 2 || !emailInput.trim() || loading}
                  className="ob-cta gradient-blue glow-blue disabled:opacity-40"
                  whileTap={{ scale: 0.98 }}>
                  {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Let's Go <ChevronRight className="w-4 h-4" /></>}
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
