import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-jazzcash-signature",
};

type WebhookPayload = {
  merchant_txn_id?: string;
  provider_txn_id?: string;
  status?: string;
  amount_pkr?: number;
  payload?: Record<string, unknown>;
};

function normalizeStatus(raw: string | undefined | null) {
  const value = String(raw || "").toLowerCase();
  if (["success", "paid", "completed", "ok"].includes(value)) return "success";
  if (["expired"].includes(value)) return "expired";
  if (["cancelled", "canceled"].includes(value)) return "cancelled";
  return "failed";
}

function verifySignature(req: Request, bodyText: string) {
  const secret = Deno.env.get("JAZZCASH_WEBHOOK_SECRET") || "";
  if (!secret) return true;
  const given = req.headers.get("x-jazzcash-signature") || "";
  if (!given) return false;
  return given === secret || given === bodyText;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ success: false, error: "Missing Supabase env keys" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const bodyText = await req.text();
    const parsed = JSON.parse(bodyText || "{}") as WebhookPayload;
    const merchantTxnId = String(parsed.merchant_txn_id || "").trim();
    if (!merchantTxnId) {
      return new Response(JSON.stringify({ success: false, error: "merchant_txn_id is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const signatureValid = verifySignature(req, bodyText);
    const status = normalizeStatus(parsed.status);
    const providerTxnId = String(parsed.provider_txn_id || "").trim() || null;

    const { data: intent, error: intentError } = await admin
      .from("payment_intents")
      .select("*")
      .eq("merchant_txn_id", merchantTxnId)
      .maybeSingle();
    if (intentError) throw new Error(intentError.message);
    if (!intent) {
      return new Response(JSON.stringify({ success: false, error: "Payment intent not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("payment_events").insert({
      school_id: intent.school_id,
      payment_intent_id: intent.id,
      event_type: `webhook_${status}`,
      payload: parsed.payload || parsed || {},
      signature_valid: signatureValid,
    });

    const { data: updatedIntent, error: updateIntentError } = await admin
      .from("payment_intents")
      .update({
        status,
        provider_txn_id: providerTxnId,
        paid_at: status === "success" ? new Date().toISOString() : intent.paid_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", intent.id)
      .select("*")
      .single();
    if (updateIntentError) throw new Error(updateIntentError.message);

    let activated = false;
    if (status === "success") {
      const meta = (intent.metadata || {}) as Record<string, unknown>;
      const { data: existingSubscription } = await admin
        .from("subscriptions")
        .select("*")
        .eq("school_id", intent.school_id)
        .maybeSingle();
      const planId = String(meta.plan_id || existingSubscription?.plan_id || "").trim();
      if (planId) {
        const startsAt = String(meta.starts_at || existingSubscription?.starts_at || new Date().toISOString());
        const endsAt = String(meta.ends_at || existingSubscription?.ends_at || new Date().toISOString());
        const patch = {
          plan_id: planId,
          status: "active",
          starts_at: startsAt,
          ends_at: endsAt,
          payment_method: intent.provider,
          transaction_id: providerTxnId || intent.merchant_txn_id,
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        if (existingSubscription) {
          const { error: subErr } = await admin.from("subscriptions").update(patch).eq("id", existingSubscription.id);
          if (subErr) throw new Error(subErr.message);
        } else {
          const { error: subErr } = await admin.from("subscriptions").insert({
            school_id: intent.school_id,
            ...patch,
            created_by: intent.created_by || null,
          });
          if (subErr) throw new Error(subErr.message);
        }
        activated = true;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        merchant_txn_id: merchantTxnId,
        status,
        signature_valid: signatureValid,
        activated,
        intent_id: updatedIntent.id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unexpected error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
