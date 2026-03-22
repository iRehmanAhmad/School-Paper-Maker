import { canUseSupabase, supabase } from "@/services/supabase";
import type { PaymentEvent, PaymentIntent, PaymentIntentStatus, PaymentProvider } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";
import { activateSubscriptionAfterPayment, getSchoolSubscription, markSubscriptionPendingPayment } from "./subscriptionService";

let paymentTablesAvailable: boolean | null = null;

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

function nowIso() {
  return new Date().toISOString();
}

export function buildMerchantTxnId(prefix = "PG") {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${stamp}-${rand}`;
}

export async function getPaymentIntents(schoolId?: string) {
  if (canUseSupabase() && paymentTablesAvailable !== false) {
    try {
      let query = supabase.from("payment_intents").select("*").order("created_at", { ascending: false });
      if (schoolId) {
        query = query.eq("school_id", schoolId);
      }
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) {
          paymentTablesAvailable = false;
        }
        throw error;
      }
      paymentTablesAvailable = true;
      return (data ?? []) as PaymentIntent[];
    } catch {
      // local fallback
    }
  }
  ensureSeed();
  return readLocal<PaymentIntent>(DB.paymentIntents)
    .filter((row) => (!schoolId ? true : row.school_id === schoolId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export async function createPaymentIntent(input: {
  school_id: string;
  provider: PaymentProvider;
  amount_pkr: number;
  merchant_txn_id?: string;
  payer_phone?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
  subscription_id?: string | null;
  created_by?: string | null;
}) {
  const merchantTxn = (input.merchant_txn_id || buildMerchantTxnId(input.provider.toUpperCase().slice(0, 3))).trim();
  const payload = {
    school_id: input.school_id,
    subscription_id: input.subscription_id || null,
    provider: input.provider,
    amount_pkr: Math.max(0, Number(input.amount_pkr) || 0),
    status: "pending" as PaymentIntentStatus,
    merchant_txn_id: merchantTxn,
    provider_txn_id: null,
    payer_phone: input.payer_phone || null,
    notes: input.notes || null,
    metadata: input.metadata || null,
    created_by: input.created_by || null,
    paid_at: null,
  };

  if (canUseSupabase() && paymentTablesAvailable !== false) {
    try {
      const { data, error } = await supabase.from("payment_intents").insert(payload).select("*").single();
      if (error) {
        if (isMissingTableError(error)) {
          paymentTablesAvailable = false;
        }
        throw error;
      }
      paymentTablesAvailable = true;
      return data as PaymentIntent;
    } catch {
      // local fallback
    }
  }

  ensureSeed();
  const now = nowIso();
  const row: PaymentIntent = {
    id: crypto.randomUUID(),
    created_at: now,
    updated_at: now,
    ...payload,
  };
  writeLocal(DB.paymentIntents, [row, ...readLocal<PaymentIntent>(DB.paymentIntents)]);
  return row;
}

export async function appendPaymentEvent(input: {
  school_id: string;
  payment_intent_id?: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  signature_valid?: boolean | null;
}) {
  const rowPayload = {
    school_id: input.school_id,
    payment_intent_id: input.payment_intent_id || null,
    event_type: input.event_type,
    payload: input.payload,
    signature_valid: input.signature_valid ?? null,
  };
  if (canUseSupabase() && paymentTablesAvailable !== false) {
    try {
      const { data, error } = await supabase.from("payment_events").insert(rowPayload).select("*").single();
      if (error) {
        if (isMissingTableError(error)) {
          paymentTablesAvailable = false;
        }
        throw error;
      }
      paymentTablesAvailable = true;
      return data as PaymentEvent;
    } catch {
      // local fallback
    }
  }
  ensureSeed();
  const row: PaymentEvent = {
    id: crypto.randomUUID(),
    created_at: nowIso(),
    ...rowPayload,
  };
  writeLocal(DB.paymentEvents, [row, ...readLocal<PaymentEvent>(DB.paymentEvents)]);
  return row;
}

async function updatePaymentIntentByMerchantTxn(
  merchantTxnId: string,
  patch: Partial<PaymentIntent>,
) {
  if (canUseSupabase() && paymentTablesAvailable !== false) {
    try {
      const { data, error } = await supabase
        .from("payment_intents")
        .update({ ...patch, updated_at: nowIso() })
        .eq("merchant_txn_id", merchantTxnId)
        .select("*")
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) {
          paymentTablesAvailable = false;
        }
        throw error;
      }
      paymentTablesAvailable = true;
      return (data as PaymentIntent | null) || null;
    } catch {
      // local fallback
    }
  }
  ensureSeed();
  const rows = readLocal<PaymentIntent>(DB.paymentIntents);
  const row = rows.find((item) => item.merchant_txn_id === merchantTxnId);
  if (!row) return null;
  Object.assign(row, patch, { updated_at: nowIso() });
  writeLocal(DB.paymentIntents, rows);
  return row;
}

async function getPaymentIntentByMerchantTxn(merchantTxnId: string) {
  if (canUseSupabase() && paymentTablesAvailable !== false) {
    try {
      const { data, error } = await supabase
        .from("payment_intents")
        .select("*")
        .eq("merchant_txn_id", merchantTxnId)
        .maybeSingle();
      if (error) {
        if (isMissingTableError(error)) {
          paymentTablesAvailable = false;
        }
        throw error;
      }
      paymentTablesAvailable = true;
      return (data as PaymentIntent | null) || null;
    } catch {
      // local fallback
    }
  }
  ensureSeed();
  return readLocal<PaymentIntent>(DB.paymentIntents).find((item) => item.merchant_txn_id === merchantTxnId) || null;
}

export async function markManualPaymentAndActivate(input: {
  school_id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string;
  amount_pkr: number;
  provider?: PaymentProvider;
  transaction_id: string;
  payer_phone?: string | null;
  notes?: string | null;
  created_by?: string | null;
}) {
  const provider = input.provider || "manual";
  const merchantTxn = buildMerchantTxnId("MAN");
  const intent = await createPaymentIntent({
    school_id: input.school_id,
    provider,
    amount_pkr: input.amount_pkr,
    merchant_txn_id: merchantTxn,
    payer_phone: input.payer_phone || null,
    notes: input.notes || null,
    metadata: {
      plan_id: input.plan_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      mode: "manual_activation",
    },
    created_by: input.created_by || null,
  });

  await appendPaymentEvent({
    school_id: input.school_id,
    payment_intent_id: intent.id,
    event_type: "manual_paid",
    payload: {
      transaction_id: input.transaction_id,
      provider,
      amount_pkr: input.amount_pkr,
    },
    signature_valid: true,
  });

  await updatePaymentIntentByMerchantTxn(intent.merchant_txn_id, {
    status: "success",
    provider_txn_id: input.transaction_id,
    paid_at: nowIso(),
  });

  const subscription = await activateSubscriptionAfterPayment({
    school_id: input.school_id,
    plan_id: input.plan_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    payment_method: provider,
    transaction_id: input.transaction_id,
    paid_at: nowIso(),
    created_by: input.created_by || null,
  });

  return { intent: { ...intent, status: "success", provider_txn_id: input.transaction_id, paid_at: nowIso() } as PaymentIntent, subscription };
}

export async function createPendingPaymentSubscription(input: {
  school_id: string;
  plan_id: string;
  starts_at: string;
  ends_at: string;
  provider: PaymentProvider;
  amount_pkr: number;
  payer_phone?: string | null;
  notes?: string | null;
  created_by?: string | null;
}) {
  const subscription = await markSubscriptionPendingPayment({
    school_id: input.school_id,
    plan_id: input.plan_id,
    starts_at: input.starts_at,
    ends_at: input.ends_at,
    payment_method: input.provider,
    created_by: input.created_by || null,
  });
  const intent = await createPaymentIntent({
    school_id: input.school_id,
    subscription_id: subscription.id,
    provider: input.provider,
    amount_pkr: input.amount_pkr,
    payer_phone: input.payer_phone || null,
    notes: input.notes || null,
    metadata: {
      plan_id: input.plan_id,
      starts_at: input.starts_at,
      ends_at: input.ends_at,
      mode: "payment_pending",
    },
    created_by: input.created_by || null,
  });
  return { subscription, intent };
}

export async function processPaymentWebhook(input: {
  merchant_txn_id: string;
  provider_txn_id?: string | null;
  status: "success" | "failed" | "expired" | "cancelled";
  payload: Record<string, unknown>;
  signature_valid?: boolean | null;
}) {
  const intent = await getPaymentIntentByMerchantTxn(input.merchant_txn_id);
  if (!intent) {
    throw new Error("Payment intent not found");
  }

  await appendPaymentEvent({
    school_id: intent.school_id,
    payment_intent_id: intent.id,
    event_type: `webhook_${input.status}`,
    payload: input.payload,
    signature_valid: input.signature_valid ?? null,
  });

  const patched = await updatePaymentIntentByMerchantTxn(intent.merchant_txn_id, {
    status: input.status,
    provider_txn_id: input.provider_txn_id || intent.provider_txn_id || null,
    paid_at: input.status === "success" ? nowIso() : intent.paid_at || null,
  });

  if (input.status !== "success") {
    return { intent: patched || intent, activated: false };
  }

  const currentSubscription = await getSchoolSubscription(intent.school_id);
  const meta = intent.metadata || {};
  const planId = String(meta.plan_id || currentSubscription?.plan_id || "").trim();
  const startsAt = String(meta.starts_at || currentSubscription?.starts_at || nowIso()).trim();
  const endsAt = String(meta.ends_at || currentSubscription?.ends_at || nowIso()).trim();
  if (!planId) {
    throw new Error("Cannot activate subscription: missing plan_id");
  }

  await activateSubscriptionAfterPayment({
    school_id: intent.school_id,
    plan_id: planId,
    starts_at: startsAt,
    ends_at: endsAt,
    payment_method: intent.provider,
    transaction_id: input.provider_txn_id || intent.provider_txn_id || intent.merchant_txn_id,
    paid_at: nowIso(),
    created_by: currentSubscription?.created_by || null,
  });

  return { intent: patched || intent, activated: true };
}

