import { auth, defineMcp } from "@lovable.dev/mcp-js";
import getMyProfile from "./tools/get-my-profile";
import listHealthLogs from "./tools/list-health-logs";
import logHealthEntry from "./tools/log-health-entry";
import getMySubscription from "./tools/get-my-subscription";
import listMySupplementPlans from "./tools/list-my-supplement-plans";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "health-journey",
  title: "Health Journey",
  version: "0.1.0",
  instructions:
    "Tools for the Health Journey app. Every tool acts as the signed-in member: read their health profile, recent health logs, subscription and coach-assigned supplement plans, and log new health entries.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listHealthLogs, logHealthEntry, getMySubscription, listMySupplementPlans],
});
