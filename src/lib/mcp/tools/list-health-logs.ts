import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_health_logs",
  title: "List health logs",
  description:
    "List the signed-in member's recent health logs (weight, steps, glucose, blood pressure), newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(20).describe("How many entries to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("health_logs")
      .select("logged_at, log_type, weight_kg, steps_count, glucose_morning, glucose_evening, bp_systolic, bp_diastolic")
      .eq("user_id", ctx.getUserId())
      .order("logged_at", { ascending: false })
      .limit(limit ?? 20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { logs: data ?? [] },
    };
  },
});
