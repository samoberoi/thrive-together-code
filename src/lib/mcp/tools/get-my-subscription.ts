import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_subscription",
  title: "Get my subscription",
  description: "Fetch the signed-in member's current plan, status, start date and expiry.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan_name, plan_price, duration_months, started_at, expires_at, status, change_type")
      .eq("user_id", ctx.getUserId())
      .order("started_at", { ascending: false })
      .limit(5);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { subscriptions: data ?? [] },
    };
  },
});
