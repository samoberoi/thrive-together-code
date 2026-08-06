import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_supplement_plans",
  title: "List my supplement plans",
  description: "List supplement plans assigned to the signed-in member by their coach.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_supplement_plans")
      .select("plan_name, start_date, duration_weeks, status, notes")
      .eq("user_id", ctx.getUserId())
      .order("start_date", { ascending: false })
      .limit(20);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { plans: data ?? [] },
    };
  },
});
