import { hasSupabase, supabase } from "@/services/supabase";
import type { AuditLog } from "@/types/domain";
import { DB, ensureSeed, readLocal, writeLocal } from "./baseService";

let auditTableAvailable: boolean | null = null;

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

export async function getAuditLogs(input?: { schoolId?: string | null; limit?: number }) {
  const schoolId = input?.schoolId || null;
  const limit = Math.max(1, Math.min(500, input?.limit || 100));

  if (hasSupabase && supabase && auditTableAvailable !== false) {
    try {
      let query = supabase.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(limit);
      if (schoolId) {
        query = query.eq("school_id", schoolId);
      }
      const { data, error } = await query;
      if (error) {
        if (isMissingTableError(error)) {
          auditTableAvailable = false;
        }
        throw error;
      }
      auditTableAvailable = true;
      return (data ?? []) as AuditLog[];
    } catch {
      // local fallback
    }
  }

  ensureSeed();
  return readLocal<AuditLog>(DB.auditLogs)
    .filter((row) => (!schoolId ? true : row.school_id === schoolId))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, limit);
}

export async function logAuditEvent(input: {
  school_id?: string | null;
  actor_id?: string | null;
  actor_name?: string | null;
  action: string;
  target_type?: string | null;
  target_id?: string | null;
  details?: Record<string, unknown> | null;
}) {
  const payload = {
    school_id: input.school_id || null,
    actor_id: input.actor_id || null,
    actor_name: input.actor_name || null,
    action: input.action.trim(),
    target_type: input.target_type || null,
    target_id: input.target_id || null,
    details: input.details || null,
  };

  if (!payload.action) {
    throw new Error("Audit action is required");
  }

  if (hasSupabase && supabase && auditTableAvailable !== false) {
    try {
      const { data, error } = await supabase.from("audit_logs").insert(payload).select("*").single();
      if (error) {
        if (isMissingTableError(error)) {
          auditTableAvailable = false;
        }
        throw error;
      }
      auditTableAvailable = true;
      return data as AuditLog;
    } catch {
      // local fallback
    }
  }

  ensureSeed();
  const row: AuditLog = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...payload,
  };
  writeLocal(DB.auditLogs, [row, ...readLocal<AuditLog>(DB.auditLogs)]);
  return row;
}
