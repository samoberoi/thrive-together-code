import { useEffect, useState, lazy, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { useNavigate } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import PageTransition from "@/components/PageTransition";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import BiometricGate from "@/components/BiometricGate";
import { isNative } from "@/lib/biometric";
import { isNativeVideoTransitionActive } from "@/lib/nativeVideoSession";

import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { ProfileSyncProvider } from "@/components/ProfileSyncProvider";
import { ConfirmProvider } from "@/components/ConfirmProvider";
import { LanguageProvider } from "@/contexts/LanguageContext";
import AutoTranslator from "@/components/AutoTranslator";
import { subscribeToNotifications, fetchUnreadCount } from "@/lib/notificationService";
import { setAppBadgeCount, clearAppBadge } from "@/lib/appBadge";
import { App as CapApp } from "@capacitor/app";
import { PushNotifications } from "@capacitor/push-notifications";
import { getNotificationSoundSettings } from "@/lib/notificationSoundService";
import { playNotificationSound } from "@/lib/soundEngine";
import { fireRealtimeHealthNotificationAlert, sendLocalHealthAlert } from "@/lib/healthAlerts";
import { currentPlatform, isNativePushSupported, registerNativePush } from "@/lib/nativePush";
import { resolvePostAuthRoute, resolveProtectedAccess } from "@/lib/accessControl";

// Eager: splash + onboarding entry (paint instantly on cold start)
import Splash from "./pages/Splash";
import LanguageSelect from "./pages/LanguageSelect";
import Auth from "./pages/Auth";
import RealityHook from "./pages/onboarding/RealityHook";
import TensionScreen from "./pages/onboarding/TensionScreen";
import BreakPattern from "./pages/onboarding/BreakPattern";
import NotFound from "./pages/NotFound";

// Lazy: setup, onboarding tail, product, admin/coach/partner
const BasicDetails = lazy(() => import("./pages/setup/BasicDetails"));
const BodyStats = lazy(() => import("./pages/setup/BodyStats"));
const ClinicalData = lazy(() => import("./pages/setup/ClinicalData"));
const LifestyleQuestions = lazy(() => import("./pages/setup/LifestyleQuestions"));
const HealthScore = lazy(() => import("./pages/setup/HealthScore"));
const Purpose = lazy(() => import("./pages/setup/Purpose"));
const HealthQuestions = lazy(() => import("./pages/setup/HealthQuestions"));
const DeepProfiling = lazy(() => import("./pages/setup/DeepProfiling"));
const Plans = lazy(() => import("./pages/Plans"));
const Payment = lazy(() => import("./pages/Payment"));
const TestPay = lazy(() => import("./pages/TestPay"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Tour = lazy(() => import("./pages/Tour"));
const CoachDashboard = lazy(() => import("./pages/CoachDashboard"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const AdminUsersInsights = lazy(() => import("./pages/admin/AdminUsersInsights"));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage"));
const PartnerDashboard = lazy(() => import("./pages/PartnerDashboard"));

const TransformationStory = lazy(() => import("./pages/onboarding/TransformationStory"));
const AuthorityStatement = lazy(() => import("./pages/onboarding/AuthorityStatement"));
const PunchFramework = lazy(() => import("./pages/onboarding/PunchFramework"));
const StartAssessment = lazy(() => import("./pages/onboarding/StartAssessment"));
const AnalyzingScreen = lazy(() => import("./pages/onboarding/AnalyzingScreen"));
const InsightScreen = lazy(() => import("./pages/onboarding/InsightScreen"));
const HopeScreen = lazy(() => import("./pages/onboarding/HopeScreen"));
const ProjectionPreview = lazy(() => import("./pages/onboarding/ProjectionPreview"));
const ProcessingScreen = lazy(() => import("./pages/onboarding/ProcessingScreen"));
const ScoreInterpretation = lazy(() => import("./pages/onboarding/ScoreInterpretation"));
const TrajectoryScreen = lazy(() => import("./pages/onboarding/TrajectoryScreen"));
const CommitmentScreen = lazy(() => import("./pages/onboarding/CommitmentScreen"));

const RouteFallback = () => (
  <div className="min-h-dvh w-full bg-background flex items-center justify-center text-foreground">
    <div className="h-6 w-6 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
  </div>
);



const queryClient = new QueryClient();

const PUBLIC_ENTRY_ROUTES = new Set([
  "/",
  "/language",
  "/reality-hook",
  "/tension",
  "/break-pattern",
  "/transformation",
  "/authority",
  "/punch",
  "/start-assessment",
  "/auth",
]);

const PAID_APP_ROUTES = new Set([
  "/home",
  "/dashboard",
  "/tour",
  "/notifications",
]);

function NativeSessionRedirect() {
  const { session, loading, ready } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative() || loading || !ready || !session) return;
    if (PUBLIC_ENTRY_ROUTES.has(location.pathname)) {
      let cancelled = false;
      void resolvePostAuthRoute(session.user.id, { missingProfileRoute: null }).then((route) => {
        if (!cancelled && route && route !== location.pathname) {
          navigate(route, { replace: true });
        }
      });
      return () => {
        cancelled = true;
      };
    }
  }, [loading, location.pathname, navigate, ready, session]);

  return null;
}

function SubscriptionGate({ children }: { children: ReactNode }) {
  const { session, loading, ready } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [allowedPath, setAllowedPath] = useState<string | null>(null);
  const paidRoute = PAID_APP_ROUTES.has(location.pathname);

  useEffect(() => {
    if (!paidRoute) {
      setChecking(false);
      setAllowedPath(null);
      return;
    }

    if (loading || !ready) {
      setChecking(true);
      return;
    }

    if (!session) {
      setChecking(false);
      setAllowedPath(null);
      navigate("/auth", { replace: true });
      return;
    }

    let cancelled = false;
    setChecking(true);
    void resolveProtectedAccess(session.user.id)
      .then((decision) => {
        if (cancelled) return;
        if (!decision.allowed) {
          setAllowedPath(null);
          navigate(decision.redirectTo ?? "/plans", { replace: true });
          return;
        }
        setAllowedPath(location.pathname);
        setChecking(false);
      })
      .catch(() => {
        if (!cancelled) {
          setAllowedPath(null);
          navigate("/plans", { replace: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loading, navigate, paidRoute, ready, session, location.pathname]);

  const nativeVideoTransition = isNative() && isNativeVideoTransitionActive() && (loading || !!session);

  if (!nativeVideoTransition && paidRoute && (loading || !ready || checking || !session || allowedPath !== location.pathname)) {
    return (
      <div className="min-h-dvh w-full bg-background flex items-center justify-center text-foreground">
        <div className="h-6 w-6 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}

function GlobalRealtimeAlerts() {
  const { user } = useAuth();

  // Keep the iOS/Android app icon badge in sync with the real unread count.
  useEffect(() => {
    if (!user) {
      void clearAppBadge();
      return;
    }
    let cancelled = false;

    const syncBadge = async () => {
      try {
        const count = await fetchUnreadCount(user.id);
        if (!cancelled) await setAppBadgeCount(count);
      } catch (error) {
        console.warn("[badge] unread sync failed", error);
      }
    };

    // Initial sync + refresh whenever the app returns to the foreground.
    void syncBadge();
    let appListener: { remove: () => void } | null = null;
    if (isNativePushSupported()) {
      void CapApp.addListener("appStateChange", (state) => {
        if (state.isActive) {
          // Clear the OS notification tray and resync badge to the real count.
          void PushNotifications.removeAllDeliveredNotifications().catch(() => {});
          void syncBadge();
          void registerNativePush(user.id).catch((error) => {
            console.warn("[push] resume registration failed", error);
          });
        }
      }).then((l) => {
        appListener = l;
      });
    }

    const unsub = subscribeToNotifications(user.id, (notification) => {
      // Any incoming notification → re-fetch true unread count and update badge.
      void syncBadge();
      // Android does not show FCM notification banners while the WebView is in
      // the foreground, so mirror the live database notification into a local
      // native banner. iOS foreground presentation is already handled by APNs.
      if (isNativePushSupported()) {
        if (currentPlatform() === "android") {
          void sendLocalHealthAlert(notification.title, notification.body);
        }
        return;
      }
      void getNotificationSoundSettings().then((settings) => {
        if (!settings.enabled) return;
        if (notification.type === "health_alert") {
          fireRealtimeHealthNotificationAlert(notification);
        } else {
          playNotificationSound(settings.variant);
        }
      });
    });

    // Also resync when the user marks notifications read/cleared elsewhere.
    const onLocalChange = () => void syncBadge();
    window.addEventListener("notifications:changed", onLocalChange);

    return () => {
      cancelled = true;
      unsub();
      appListener?.remove();
      window.removeEventListener("notifications:changed", onLocalChange);
    };
  }, [user]);

  return null;
}

function NativeAuthStartupGate({ children }: { children: ReactNode }) {
  const { loading, ready, session } = useAuth();

  // Prefetch the heavy Dashboard/Plans chunks as soon as we have a session,
  // so onboarding → Home doesn't stall on chunk download after the lazy split.
  useEffect(() => {
    if (!session) return;
    const idle = (cb: () => void) =>
      (window as any).requestIdleCallback
        ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 300);
    idle(() => {
      void import("./pages/Dashboard");
      void import("./pages/Plans");
      void import("./pages/NotificationsPage");
    });
  }, [session]);

  if (isNative() && !isNativeVideoTransitionActive() && (loading || !ready)) {
    return (
      <div className="min-h-dvh w-full bg-background flex items-center justify-center text-foreground">
        <div className="h-6 w-6 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
      </div>
    );
  }

  return <>{children}</>;
}


function AnimatedRoutes() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [location.pathname]);
  return (
    <AnimatePresence mode="wait" initial={false}>
      <Suspense fallback={<RouteFallback />}>
      <Routes location={location} key={location.pathname}>


        {/* Phase 0 — Entry */}
        <Route path="/" element={<PageTransition><Splash /></PageTransition>} />
        <Route path="/language" element={<PageTransition><LanguageSelect /></PageTransition>} />

        <Route path="/reality-hook" element={<PageTransition><RealityHook /></PageTransition>} />
        <Route path="/tension" element={<PageTransition><TensionScreen /></PageTransition>} />
        <Route path="/break-pattern" element={<PageTransition><BreakPattern /></PageTransition>} />

        {/* Phase 1 — Proof & Hope */}
        <Route path="/transformation" element={<PageTransition><TransformationStory /></PageTransition>} />
        <Route path="/authority" element={<PageTransition><AuthorityStatement /></PageTransition>} />
        <Route path="/punch" element={<PageTransition><PunchFramework /></PageTransition>} />
        <Route path="/start-assessment" element={<PageTransition><StartAssessment /></PageTransition>} />

        {/* Phase 2 — Smart Screening */}
        <Route path="/auth" element={<PageTransition><Auth /></PageTransition>} />
        <Route path="/setup/purpose" element={<PageTransition><Purpose /></PageTransition>} />
        <Route path="/setup/basic-details" element={<PageTransition><BasicDetails /></PageTransition>} />
        <Route path="/setup/stats" element={<PageTransition><BodyStats /></PageTransition>} />
        <Route path="/setup/clinical" element={<PageTransition><ClinicalData /></PageTransition>} />
        <Route path="/setup/lifestyle" element={<PageTransition><LifestyleQuestions /></PageTransition>} />
        <Route path="/setup/health" element={<PageTransition><HealthQuestions /></PageTransition>} />

        {/* Phase 3 — Transformation Insight */}
        <Route path="/analyzing" element={<PageTransition><AnalyzingScreen /></PageTransition>} />
        <Route path="/insight" element={<PageTransition><InsightScreen /></PageTransition>} />
        <Route path="/hope" element={<PageTransition><HopeScreen /></PageTransition>} />
        <Route path="/projection-preview" element={<PageTransition><ProjectionPreview /></PageTransition>} />

        {/* Phase 4 — Deep Profiling */}
        <Route path="/setup/deep-profiling" element={<PageTransition><DeepProfiling /></PageTransition>} />

        {/* Phase 5 — Result Engine */}
        <Route path="/processing" element={<PageTransition><ProcessingScreen /></PageTransition>} />
        <Route path="/setup/score" element={<PageTransition><HealthScore /></PageTransition>} />
        <Route path="/score-interpretation" element={<PageTransition><ScoreInterpretation /></PageTransition>} />

        {/* Phase 6 — Trajectory */}
        <Route path="/trajectory" element={<PageTransition><TrajectoryScreen /></PageTransition>} />

        {/* Phase 7 — Plans */}
        <Route path="/plans" element={<PageTransition><Plans /></PageTransition>} />

        {/* Phase 8 — Commitment */}
        <Route path="/commitment" element={<PageTransition><CommitmentScreen /></PageTransition>} />

        {/* Phase 8 — Payment */}
        <Route path="/payment" element={<PageTransition><Payment /></PageTransition>} />
        <Route path="/test-pay" element={<PageTransition><TestPay /></PageTransition>} />

        {/* Phase 9 — Day One */}
        

        {/* Product */}
        <Route path="/tour" element={<PageTransition><Tour /></PageTransition>} />
        <Route path="/home" element={<PageTransition><Dashboard /></PageTransition>} />
        <Route path="/dashboard" element={<PageTransition><Dashboard /></PageTransition>} />
        <Route path="/coach-dashboard" element={<PageTransition><CoachDashboard /></PageTransition>} />
        <Route path="/admin-dashboard" element={<PageTransition><AdminDashboard /></PageTransition>} />
        <Route path="/admin/users-insights" element={<PageTransition><AdminUsersInsights /></PageTransition>} />
        <Route path="/partner-dashboard" element={<PageTransition><PartnerDashboard /></PageTransition>} />
        <Route path="/notifications" element={<PageTransition><NotificationsPage /></PageTransition>} />


        <Route path="*" element={<PageTransition><NotFound /></PageTransition>} />
      </Routes>
      </Suspense>
    </AnimatePresence>
  );
}


const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <LanguageProvider>
            <AutoTranslator />
            <ProfileSyncProvider>
              <ConfirmProvider>
                <AppErrorBoundary>
                  <SubscriptionGate>
                    <BiometricGate>
                      <NativeAuthStartupGate>
                        <NativeSessionRedirect />
                        <GlobalRealtimeAlerts />
                        <AnimatedRoutes />
                      </NativeAuthStartupGate>
                    </BiometricGate>
                  </SubscriptionGate>
                </AppErrorBoundary>
              </ConfirmProvider>
            </ProfileSyncProvider>
          </LanguageProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
