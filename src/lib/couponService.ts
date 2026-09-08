import { supabase } from "@/integrations/supabase/client";

export type DiscountType = "percent" | "flat";

export interface CouponCampaign {
  id: string;
  name: string;
  description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  is_limited: boolean;
  coupon_count: number;
  applicable_cycles: string[] | null;
  applicable_plan_keys: string[] | null;
  total_redemption_limit: number | null;
  max_redemptions_per_coupon: number;
  start_date: string;
  end_date: string | null;
  active: boolean;
  created_at: string;
}

export interface Coupon {
  id: string;
  campaign_id: string;
  code: string;
  max_redemptions: number | null;
  redeemed_count: number;
  active: boolean;
  created_at: string;
  assigned_coach_id: string | null;
  assigned_admin_user_id: string | null;
}

export interface CoachCoupon {
  coupon_id: string;
  code: string;
  coupon_active: boolean;
  redeemed_count: number;
  max_redemptions: number | null;
  campaign_name: string;
  campaign_description: string | null;
  discount_type: DiscountType;
  discount_value: number;
  start_date: string;
  end_date: string | null;
  campaign_active: boolean;
  applicable_cycles: string[] | null;
  applicable_plan_keys: string[] | null;
  used_by: string | null;
  used_at: string | null;
  used_plan_key: string | null;
  used_discount_amount: number | null;
}

/** Coaches available for coupon assignment (admin only). */
export async function fetchCoachOptions(): Promise<{ id: string; name: string }[]> {
  const { data } = await (supabase as any).from("coaches").select("id, name").order("name");
  return (data ?? []) as { id: string; name: string }[];
}

/** Super admins available for coupon assignment (admin only). */
export async function fetchAdminOptions(): Promise<{ id: string; name: string }[]> {
  const { data: roles } = await (supabase as any).from("user_roles").select("user_id").eq("role", "admin");
  const ids: string[] = [...new Set(((roles ?? []) as any[]).map((r) => r.user_id))];
  if (ids.length === 0) return [];
  const { data: profs } = await (supabase as any).from("profiles").select("user_id, name, phone").in("user_id", ids);
  return ((profs ?? []) as any[])
    .map((p) => ({ id: p.user_id as string, name: (p.name || p.phone || p.user_id.slice(0, 8)) as string }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Give a coupon code to a coach, a super admin, or nobody. */
export async function assignCouponOwner(
  couponId: string,
  owner: { type: "coach" | "admin"; id: string } | null,
) {
  const { error } = await (supabase as any)
    .from("coupons")
    .update({
      assigned_coach_id: owner?.type === "coach" ? owner.id : null,
      assigned_admin_user_id: owner?.type === "admin" ? owner.id : null,
    })
    .eq("id", couponId);
  if (error) throw error;
}

export async function assignCouponToCoach(couponId: string, coachId: string | null) {
  return assignCouponOwner(couponId, coachId ? { type: "coach", id: coachId } : null);
}

/** Coupons handed to the signed-in coach or super admin, with usage details. */
export async function fetchMyCoachCoupons(): Promise<CoachCoupon[]> {
  const { data, error } = await (supabase as any).rpc("coach_my_coupons");
  if (error) throw error;
  return (data ?? []) as CoachCoupon[];
}


export interface CouponRedemption {
  id: string;
  coupon_id: string;
  campaign_id: string;
  user_id: string;
  code: string;
  plan_key: string | null;
  original_amount: number | null;
  discount_amount: number | null;
  final_amount: number | null;
  created_at: string;
}

export interface CouponValidation {
  valid: boolean;
  reason?: string;
  coupon_id?: string;
  campaign_id?: string;
  code?: string;
  name?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  discount_amount?: number;
  final_amount?: number;
}

export async function fetchCampaigns(): Promise<CouponCampaign[]> {
  const { data } = await (supabase as any)
    .from("coupon_campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as CouponCampaign[];
}

export async function createCampaign(input: {
  name: string;
  description?: string | null;
  discount_type: DiscountType;
  discount_value: number;
  is_limited: boolean;
  max_redemptions_per_coupon?: number;
  start_date: string;
  end_date: string | null;
  applicable_cycles?: string[] | null;
  applicable_plan_keys?: string[] | null;
  total_redemption_limit?: number | null;
}) {
  const { data, error } = await (supabase as any)
    .from("coupon_campaigns")
    .insert({
      name: input.name,
      description: input.description ?? null,
      discount_type: input.discount_type,
      discount_value: input.discount_value,
      is_limited: input.is_limited,
      max_redemptions_per_coupon: input.is_limited ? (input.max_redemptions_per_coupon ?? 1) : 1,
      start_date: input.start_date,
      end_date: input.end_date,
      applicable_cycles: input.applicable_cycles?.length ? input.applicable_cycles : null,
      applicable_plan_keys: input.applicable_plan_keys?.length ? input.applicable_plan_keys : null,
      total_redemption_limit: input.total_redemption_limit ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as CouponCampaign;
}

export async function updateCampaign(id: string, patch: Partial<CouponCampaign>) {
  const { error } = await (supabase as any).from("coupon_campaigns").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteCampaign(id: string) {
  const { error } = await (supabase as any).from("coupon_campaigns").delete().eq("id", id);
  if (error) throw error;
}

export async function generateCoupons(campaignId: string, count: number, prefix?: string): Promise<number> {
  const { data, error } = await (supabase as any).rpc("generate_coupons", {
    _campaign_id: campaignId,
    _count: count,
    _prefix: prefix ?? null,
  });
  if (error) throw error;
  return Number(data ?? 0);
}

export async function fetchCoupons(campaignId: string): Promise<Coupon[]> {
  const { data } = await (supabase as any)
    .from("coupons")
    .select("*")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Coupon[];
}

export async function fetchRedemptions(campaignId?: string): Promise<CouponRedemption[]> {
  let q = (supabase as any)
    .from("coupon_redemptions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (campaignId) q = q.eq("campaign_id", campaignId);
  const { data } = await q;
  return (data ?? []) as CouponRedemption[];
}

/** Look up display names for redemption user ids. */
export async function fetchUserLabels(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {};
  const { data } = await (supabase as any)
    .from("profiles")
    .select("user_id, name, phone")
    .in("user_id", userIds);
  const map: Record<string, string> = {};
  (data ?? []).forEach((p: any) => {
    map[p.user_id] = p.name || p.phone || p.user_id.slice(0, 8);
  });
  return map;
}

export async function validateCoupon(
  code: string,
  amount: number,
  planKey?: string | null,
  billingCycle?: string | null,
): Promise<CouponValidation> {
  const { data, error } = await (supabase as any).rpc("validate_coupon", {
    _code: code,
    _amount: amount,
    _plan_key: planKey ?? null,
    _billing_cycle: billingCycle ?? null,
  });
  if (error) return { valid: false, reason: "Could not verify this coupon" };
  return (data ?? { valid: false, reason: "Invalid coupon code" }) as CouponValidation;
}

export async function redeemCoupon(
  code: string,
  amount: number,
  planKey?: string | null,
  billingCycle?: string | null,
): Promise<CouponValidation> {
  const { data, error } = await (supabase as any).rpc("redeem_coupon", {
    _code: code,
    _amount: amount,
    _plan_key: planKey ?? null,
    _billing_cycle: billingCycle ?? null,
  });
  if (error) return { valid: false, reason: "Could not apply this coupon" };
  return (data ?? { valid: false, reason: "Invalid coupon code" }) as CouponValidation;
}
