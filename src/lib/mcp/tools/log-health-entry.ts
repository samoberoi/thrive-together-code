import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "log_health_entry",
  title: "Log a health entry",
  description:
    "Record a health log for the signed-in member. Provide at least one measurement (weight, steps, glucose or blood pressure).",
  inputSchema: {
    log_type: z.string().trim().min(1).default("manual").describe("Entry type, e.g. weight, glucose, activity."),
    logged_at: z.string().trim().min(1).nullable().default(null).describe("ISO timestamp; defaults to now."),
    weight_kg: z.number().positive().max(500).nullable().default(null),
    steps_count: z.number().int().min(0).max(200000).nullable().default(null),
    glucose_morning: z.number().min(0).max(1000).nullable().default(null),
    glucose_evening: z.number().min(0).max(1000).nullable().default(null),
    bp_systolic: z.number().int().min(0).max(300).nullable().default(null),
    bp_diastolic: z.number().int().min(0).max(300).nullable().default(null),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const measurements = {
      weight_kg: input.weight_kg,
      steps_count: input.steps_count,
      glucose_morning: input.glucose_morning,
      glucose_evening: input.glucose_evening,
      bp_systolic: input.bp_systolic,
      bp_diastolic: input.bp_diastolic,
    };
    if (Object.values(measurements).every((value) => value === null || value === undefined)) {
      return {
        content: [{ type: "text", text: "Provide at least one measurement to log." }],
        isError: true,
      };
    }

    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("health_logs")
      .insert({
        user_id: ctx.getUserId(),
        log_type: input.log_type ?? "manual",
        logged_at: input.logged_at ?? new Date().toISOString(),
        ...measurements,
      })
      .select()
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Logged: ${JSON.stringify(data)}` }],
      structuredContent: { log: data },
    };
  },
});
