import { canUseSupabase, supabase } from "@/services/supabase";
import type { ArtifactType, PaymentProvider, Subscription, SubscriptionPlan, SubscriptionPlanCode, SubscriptionStatus } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

const SUBS_AVAIL_KEY = "pg_sub_tables_avail";
let _subsTablesAvail: boolean | null = null;

function getSubsAvail(): boolean {
  if (_subsTablesAvail !== null) return _subsTablesAvail;
  const cached = localStorage.getItem(SUBS_AVAIL_KEY);
  if (cached === "false") { _subsTablesAvail = false; return false; }
  return true; // default: try Supabase
}

function setSubsAvail(value: boolean) {
  _subsTablesAvail = value;
  localStorage.setItem(SUBS_AVAIL_KEY, String(value));
}

export type SubscriptionSummary = {
  subscription: Subscription | null;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isActive: boolean;
  isExpired: boolean;
  daysRemaining: number;
  maxPaperSets: number;
  canGenerateWorksheets: boolean;
  canGenerateLessonPlans: boolean;
};

type UpsertSubscriptionInput = {
  school_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  starts_at: string;
  ends_at: string;
  payment_method?: PaymentProvider | null;
  transaction_id?: string | null;
  paid_at?: string | null;
  created_by?: string | null;
};

const DEFAULT_BASIC_PLAN: SubscriptionPlan = {
  id: "basic-local-fallback",
  code: "basic",
  name: "Basic",
  description: "Unlimited papers, single variation only.",
  max_paper_sets: 1,
  allow_worksheets: false,
  allow_lesson_plans: false,
  created_at: new Date(0).toISOString(),
};

const DEFAULT_ADVANCED_PLAN: SubscriptionPlan = {
  id: "advanced-local-fallback",
  code: "advanced",
  name: "Advanced",
  description: "Multiple paper variations with worksheets and lesson plans.",
  max_paper_sets: 10,
  allow_worksheets: true,
  allow_lesson_plans: true,
  created_at: new Date(0).toISOString(),
};

function nowMs() {
  return Date.now();
}

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const anyError = error as { status?: number; code?: string; message?: string; details?: string };
  const message = `${anyError.message || ""} ${anyError.details || ""}`.toLowerCase();
  return (
    anyError.status === 404 ||
    anyError.code === "PGRST205" ||
    anyError.code === "42P01" ||
    message.includes("could not find the table") ||
    (message.includes("relation") && message.includes("does not exist"))
  );
}

function toDaysRemaining(endsAt: string) {
  const diff = new Date(endsAt).getTime() - nowMs();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function resolveStatus(subscription: Subscription | null): SubscriptionStatus {
  if (!subscription) return "expired";
  if (subscription.status === "pending_payment") return "pending_payment";
  if (subscription.status === "cancelled") return "cancelled";
  if (subscription.status === "suspended") return "suspended";
  return new Date(subscription.ends_at).getTime() >= nowMs() ? "active" : "expired";
}

function summaryFromRows(subscription: Subscription | null, plan: SubscriptionPlan | null): SubscriptionSummary {
  const resolvedPlan = plan || DEFAULT_BASIC_PLAN;
  const status = resolveStatus(subscription);
  const isActive = status === "active";
  return {
    subscription,
    plan: resolvedPlan,
    status,
    isActive,
    isExpired: status === "expired",
    daysRemaining: subscription ? toDaysRemaining(subscription.ends_at) : 0,
    maxPaperSets: Math.max(1, Number(resolvedPlan.max_paper_sets) || 1),
    canGenerateWorksheets: isActive && Boolean(resolvedPlan.allow_worksheets),
    canGenerateLessonPlans: isActive && Boolean(resolvedPlan.allow_lesson_plans),
  };
}

function sortPlans(plans: SubscriptionPlan[]) {
  return [...plans].sort((a, b) => {
    const orderA = a.code === "basic" ? 0 : 1;
    const orderB = b.code === "basic" ? 0 : 1;
    if (orderA !== orderB) return orderA - orderB;
    return a.name.localeCompare(b.name);
  });
}

async function ensureSupabaseDefaultSubscription(schoolId: string) {
  if (!canUseSupabase() || !getSubsAvail()) return;
  const { data: existing, error: existingError } = await supabase.from("subscriptions").select("*").eq("school_id", schoolId).maybeSingle();
  if (existingError) {
    if (isMissingTableError(existingError)) { setSubsAvail(false); return; }
    throw existingError;
  }
  if (existing) return;
  const plans = await getSubscriptionPlans();
  const basic = plans.find((plan) => plan.code === "basic") || plans[0];
  if (!basic) return;
  const starts = new Date();
  const ends = new Date(starts);
  ends.setMonth(ends.getMonth() + 1);
  await supabase.from("subscriptions").insert({
    school_id: schoolId, plan_id: basic.id, status: "active",
    starts_at: starts.toISOString(), ends_at: ends.toISOString(), created_by: null,
  });
  setSubsAvail(true);
}

export async function getSubscriptionPlans() {
  if (canUseSupabase() && getSubsAvail()) {
    try {
      const { data, error } = await supabase.from("subscription_plans").select("*");
      if (error) {
        if (isMissingTableError(error)) { setSubsAvail(false); }
        else { throw error; }
      } else {
        setSubsAvail(true);
        return sortPlans((data ?? []) as SubscriptionPlan[]);
      }
    } catch (err) {
      if (isMissingTableError(err)) { setSubsAvail(false); }
    }
  }
  ensureSeed();
  const localPlans = readLocal<SubscriptionPlan>(DB.subscriptionPlans);
  return localPlans.length ? sortPlans(localPlans) : sortPlans([DEFAULT_BASIC_PLAN, DEFAULT_ADVANCED_PLAN]);
}

export async function getSchoolSubscription(schoolId: string) {
  if (canUseSupabase() && getSubsAvail()) {
    try {
      await ensureSupabaseDefaultSubscription(schoolId);
      if (!getSubsAvail()) {
        return readLocal<Subscription>(DB.subscriptions).find((row) => row.school_id === schoolId) || null;
      }
      const { data, error } = await supabase.from("subscriptions").select("*").eq("school_id", schoolId).maybeSingle();
      if (error) {
        if (isMissingTableError(error)) { setSubsAvail(false); }
        else { throw error; }
      } else {
        setSubsAvail(true);
        return (data as Subscription | null) || null;
      }
    } catch (err) {
      if (isMissingTableError(err)) { setSubsAvail(false); }
    }
  }
  ensureSeed();
  return readLocal<Subscription>(DB.subscriptions).find((row) => row.school_id === schoolId) || null;
}

export async function upsertSchoolSubscription(input: UpsertSubscriptionInput) {
  if (canUseSupabase()) {
    if (!getSubsAvail()) {
      ensureSeed();
      const rows = readLocal<Subscription>(DB.subscriptions);
      const existingIndex = rows.findIndex((row) => row.school_id === input.school_id);
      const now = new Date().toISOString();
      if (existingIndex >= 0) {
        const updated: Subscription = {
          ...rows[existingIndex],
          plan_id: input.plan_id,
          status: input.status,
          starts_at: input.starts_at,
          ends_at: input.ends_at,
          payment_method: input.payment_method ?? rows[existingIndex].payment_method ?? null,
          transaction_id: input.transaction_id ?? rows[existingIndex].transaction_id ?? null,
          paid_at: input.paid_at ?? rows[existingIndex].paid_at ?? null,
          updated_at: now,
        };
        rows[existingIndex] = updated;
        writeLocal(DB.subscriptions, rows);
        return updated;
      }
      const row: Subscription = {
        id: crypto.randomUUID(),
        school_id: input.school_id,
        plan_id: input.plan_id,
        status: input.status,
        starts_at: input.starts_at,
        ends_at: input.ends_at,
        payment_method: input.payment_method || null,
        transaction_id: input.transaction_id || null,
        paid_at: input.paid_at || null,
        created_by: input.created_by || null,
        created_at: now,
        updated_at: now,
      };
      writeLocal(DB.subscriptions, [row, ...rows]);
      return row;
    }
    try {
      const existing = await getSchoolSubscription(input.school_id);
      if (existing) {
        const { data, error } = await supabase
          .from("subscriptions")
          .update({
            plan_id: input.plan_id,
            status: input.status,
            starts_at: input.starts_at,
            ends_at: input.ends_at,
            payment_method: input.payment_method ?? existing.payment_method ?? null,
            transaction_id: input.transaction_id ?? existing.transaction_id ?? null,
            paid_at: input.paid_at ?? existing.paid_at ?? null,
            updated_at: new Date().toISOString(),
            created_by: input.created_by || existing.created_by || null,
          })
          .eq("id", existing.id)
          .select("*")
          .single();
        if (error) {
          if (isMissingTableError(error)) { setSubsAvail(false); }
          throw error;
        }
        setSubsAvail(true);
        return data as Subscription;
      }
      const { data, error } = await supabase.from("subscriptions").insert(input).select("*").single();
      if (error) {
        if (isMissingTableError(error)) { setSubsAvail(false); }
        throw error;
      }
      setSubsAvail(true);
      return data as Subscription;
    } catch {
      // Fall through to local storage fallback when cloud table is unavailable.
    }
  }
  ensureSeed();
  const rows = readLocal<Subscription>(DB.subscriptions);
  const existingIndex = rows.findIndex((row) => row.school_id === input.school_id);
  const now = new Date().toISOString();
  if (existingIndex >= 0) {
    const updated: Subscription = {
      ...rows[existingIndex],
      plan_id: input.plan_id,
      status: input.status,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      payment_method: input.payment_method ?? rows[existingIndex].payment_method ?? null,
      transaction_id: input.transaction_id ?? rows[existingIndex].transaction_id ?? null,
      paid_at: input.paid_at ?? rows[existingIndex].paid_at ?? null,
      updated_at: now,
    };
    rows[existingIndex] = updated;
    writeLocal(DB.subscriptions, rows);
    return updated;
  }
  const row: Subscription = {
    id: crypto.randomUUID(),
    school_id: input.school_id,
    plan_id: input.plan_id,
    status: input.status,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    payment_method: input.payment_method || null,
    transaction_id: input.transaction_id || null,
    paid_at: input.paid_at || null,
    created_by: input.created_by || null,
    created_at: now,
    updated_at: now,
  };
  writeLocal(DB.subscriptions, [row, ...rows]);
  return row;
}

export async function getSubscriptionSummary(schoolId: string): Promise<SubscriptionSummary> {
  const [plans, subscription] = await Promise.all([getSubscriptionPlans(), getSchoolSubscription(schoolId)]);
  const plan = plans.find((row) => row.id === subscription?.plan_id) || plans.find((row) => row.code === "basic") || plans[0] || null;
  return summaryFromRows(subscription, plan);
}

export async function assertCanGeneratePaper(schoolId: string, requestedSets: number) {
  const summary = await getSubscriptionSummary(schoolId);
  if (!summary.isActive) {
    throw new Error("Subscription inactive or expired. Please renew from admin.");
  }
  const sets = Math.max(1, Math.floor(requestedSets || 1));
  if (sets > summary.maxPaperSets) {
    throw new Error(`Your ${summary.plan.name} plan allows up to ${summary.maxPaperSets} paper variation(s).`);
  }
  return summary;
}

export async function assertCanGenerateArtifact(schoolId: string, artifact: ArtifactType) {
  const summary = await getSubscriptionSummary(schoolId);
  if (!summary.isActive) {
    throw new Error("Subscription inactive or expired. Please renew from admin.");
  }
  if (artifact === "worksheet" && !summary.canGenerateWorksheets) {
    throw new Error("Worksheets are available on Advanced plan only.");
  }
  if (artifact === "lesson_plan" && !summary.canGenerateLessonPlans) {
    throw new Error("Lesson plans are available on Advanced plan only.");
  }
  return summary;
}

export async function markSubscriptionPendingPayment(input: {
  school_id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string;
  payment_method?: PaymentProvider | null;
  created_by?: string | null;
}) {
  return upsertSchoolSubscription({
    school_id: input.school_id,
    plan_id: input.plan_id,
    status: "pending_payment",
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    payment_method: input.payment_method || null,
    transaction_id: null,
    paid_at: null,
    created_by: input.created_by || null,
  });
}

export async function activateSubscriptionAfterPayment(input: {
  school_id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string;
  payment_method: PaymentProvider;
  transaction_id?: string | null;
  paid_at?: string | null;
  created_by?: string | null;
}) {
  return upsertSchoolSubscription({
    school_id: input.school_id,
    plan_id: input.plan_id,
    status: "active",
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    payment_method: input.payment_method,
    transaction_id: input.transaction_id || null,
    paid_at: input.paid_at || new Date().toISOString(),
    created_by: input.created_by || null,
  });
}

export function planCodeToLabel(code: SubscriptionPlanCode) {
  return code === "advanced" ? "Advanced" : "Basic";
}

