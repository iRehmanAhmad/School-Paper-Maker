import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  addSchool,
  addUserProfile,
  createPendingPaymentSubscription,
  getAuditLogs,
  getPaymentIntents,
  getSchools,
  getSubscriptionPlans,
  getSubscriptionSummary,
  getUsers,
  logAuditEvent,
  markManualPaymentAndActivate,
  processPaymentWebhook,
  upsertSchoolSubscription,
} from "@/services/repositories";
import { useAppStore } from "@/store/useAppStore";
import type { AuditLog, PaymentIntent, PaymentProvider, SubscriptionPlan, SubscriptionStatus, UserProfile } from "@/types/domain";
import type { SubscriptionSummary } from "@/services/subscriptionService";

type SchoolRow = {
  school: {
    id: string;
    name: string;
  };
  summary: SubscriptionSummary;
  users: UserProfile[];
};

type SaleMode = "paid" | "pending";

function toDateInput(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function fromDateInput(value: string) {
  if (!value) return new Date().toISOString();
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function oneMonthWindow() {
  const start = new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start: toDateInput(start.toISOString()), end: toDateInput(end.toISOString()) };
}

function todayDateInput() {
  return toDateInput(new Date().toISOString());
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

const statusClassMap: Record<SubscriptionStatus, string> = {
  pending_payment: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  expired: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  suspended: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  cancelled: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

export function SubscriptionsPage() {
  const profile = useAppStore((s) => s.profile);
  const toast = useAppStore((s) => s.pushToast);

  const [rows, setRows] = useState<SchoolRow[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedSchoolId, setSelectedSchoolId] = useState("");
  const [paymentIntents, setPaymentIntents] = useState<PaymentIntent[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [updatePlanId, setUpdatePlanId] = useState("");
  const [updateStatus, setUpdateStatus] = useState<SubscriptionStatus>("active");
  const [updateStartsAt, setUpdateStartsAt] = useState(oneMonthWindow().start);
  const [updateEndsAt, setUpdateEndsAt] = useState(oneMonthWindow().end);
  const [updatePaymentMethod, setUpdatePaymentMethod] = useState<PaymentProvider>("manual");
  const [updateTxnId, setUpdateTxnId] = useState("");

  const [newSchoolName, setNewSchoolName] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("client123");
  const [newPlanId, setNewPlanId] = useState("");
  const [newSaleMode, setNewSaleMode] = useState<SaleMode>("paid");
  const [newProvider, setNewProvider] = useState<PaymentProvider>("manual");
  const [newAmount, setNewAmount] = useState("2000");
  const [newPhone, setNewPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newTxnId, setNewTxnId] = useState("");
  const [newStartsAt, setNewStartsAt] = useState(oneMonthWindow().start);
  const [newEndsAt, setNewEndsAt] = useState(oneMonthWindow().end);
  const [createdLoginHint, setCreatedLoginHint] = useState("");
  const [schoolSearch, setSchoolSearch] = useState("");

  const selectedRow = useMemo(() => rows.find((row) => row.school.id === selectedSchoolId) || null, [rows, selectedSchoolId]);
  const filteredRows = useMemo(() => {
    const query = schoolSearch.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) => row.school.name.toLowerCase().includes(query));
  }, [rows, schoolSearch]);

  const totals = useMemo(() => {
    let active = 0;
    let pending = 0;
    let suspended = 0;
    let basic = 0;
    let advanced = 0;
    rows.forEach((row) => {
      if (row.summary.status === "active") active += 1;
      if (row.summary.status === "pending_payment") pending += 1;
      if (row.summary.status === "suspended") suspended += 1;
      if (row.summary.plan.code === "basic") basic += 1;
      if (row.summary.plan.code === "advanced") advanced += 1;
    });
    return { totalSchools: rows.length, active, pending, suspended, basic, advanced };
  }, [rows]);

  useEffect(() => {
    void loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedSchoolId) {
      setPaymentIntents([]);
      setAuditLogs([]);
      return;
    }
    void loadPaymentIntents(selectedSchoolId);
    void loadAuditLogs(selectedSchoolId);
  }, [selectedSchoolId]);

  useEffect(() => {
    const fallbackPlan = plans[0]?.id || "";
    if (!fallbackPlan) return;
    if (!newPlanId) setNewPlanId(fallbackPlan);
    if (!updatePlanId) setUpdatePlanId(fallbackPlan);
  }, [plans, newPlanId, updatePlanId]);

  useEffect(() => {
    if (!selectedRow) return;
    const sub = selectedRow.summary.subscription;
    setUpdatePlanId(sub?.plan_id || selectedRow.summary.plan.id);
    setUpdateStatus(selectedRow.summary.status);
    setUpdateStartsAt(toDateInput(sub?.starts_at) || oneMonthWindow().start);
    setUpdateEndsAt(toDateInput(sub?.ends_at) || oneMonthWindow().end);
    setUpdatePaymentMethod(sub?.payment_method || "manual");
    setUpdateTxnId(sub?.transaction_id || "");
  }, [selectedRow]);

  async function loadPageData(targetSchoolId?: string) {
    setLoading(true);
    try {
      const [schoolRows, allUsers, planRows] = await Promise.all([getSchools(), getUsers(), getSubscriptionPlans()]);
      const mapped: SchoolRow[] = await Promise.all(
        schoolRows.map(async (school) => {
          const summary = await getSubscriptionSummary(school.id);
          const users = allUsers.filter((row) => row.school_id === school.id);
          return { school: { id: school.id, name: school.name }, summary, users };
        }),
      );
      mapped.sort((a, b) => a.school.name.localeCompare(b.school.name));
      setRows(mapped);
      setPlans(planRows);
      setSelectedSchoolId((current) => {
        if (targetSchoolId && mapped.some((row) => row.school.id === targetSchoolId)) return targetSchoolId;
        if (current && mapped.some((row) => row.school.id === current)) return current;
        return mapped[0]?.school.id || "";
      });
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load subscriptions");
    } finally {
      setLoading(false);
    }
  }

  async function loadPaymentIntents(schoolId: string) {
    try {
      const rows = await getPaymentIntents(schoolId);
      setPaymentIntents(rows.slice(0, 12));
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load payment history");
    }
  }

  async function loadAuditLogs(schoolId: string) {
    try {
      const rows = await getAuditLogs({ schoolId, limit: 80 });
      setAuditLogs(rows);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to load audit logs");
    }
  }

  async function writeAudit(input: {
    schoolId?: string | null;
    action: string;
    targetType?: string;
    targetId?: string;
    details?: Record<string, unknown>;
  }) {
    try {
      await logAuditEvent({
        school_id: input.schoolId || null,
        actor_id: profile?.id || null,
        actor_name: profile?.full_name || null,
        action: input.action,
        target_type: input.targetType || null,
        target_id: input.targetId || null,
        details: input.details || null,
      });
    } catch {
      // Non-blocking: business action should still complete.
    }
  }

  function downloadAuditLogFile() {
    if (!selectedRow || !auditLogs.length) {
      toast("error", "No logs found for selected school");
      return;
    }
    const lines = [
      `Paper Generator Audit Log`,
      `School: ${selectedRow.school.name}`,
      `Generated At: ${new Date().toLocaleString()}`,
      "",
      ...auditLogs.map((log, index) => {
        const actor = log.actor_name || "System";
        const details = log.details ? JSON.stringify(log.details) : "{}";
        return `${index + 1}. [${formatDateTime(log.created_at)}] ${log.action} | actor=${actor} | target=${log.target_type || "-"}:${log.target_id || "-"} | details=${details}`;
      }),
    ];

    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeSchool = selectedRow.school.name.replace(/[^a-z0-9-_]+/gi, "_");
    link.href = url;
    link.download = `audit_log_${safeSchool}_${todayDateInput()}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function submitUpdateSubscription(event: FormEvent) {
    event.preventDefault();
    if (!selectedRow) return;
    if (!updatePlanId) {
      toast("error", "Select a plan first");
      return;
    }
    setBusy(true);
    try {
      await upsertSchoolSubscription({
        school_id: selectedRow.school.id,
        plan_id: updatePlanId,
        status: updateStatus,
        starts_at: fromDateInput(updateStartsAt),
        ends_at: fromDateInput(updateEndsAt),
        payment_method: updatePaymentMethod,
        transaction_id: updateTxnId.trim() || null,
        paid_at: updateStatus === "active" ? new Date().toISOString() : null,
        created_by: profile?.id || null,
      });
      await writeAudit({
        schoolId: selectedRow.school.id,
        action: "subscription_updated",
        targetType: "subscription",
        targetId: selectedRow.summary.subscription?.id || selectedRow.school.id,
        details: {
          plan_id: updatePlanId,
          status: updateStatus,
          starts_at: updateStartsAt,
          ends_at: updateEndsAt,
          payment_method: updatePaymentMethod,
        },
      });
      toast("success", "Subscription updated");
      await loadPageData(selectedRow.school.id);
      await loadPaymentIntents(selectedRow.school.id);
      await loadAuditLogs(selectedRow.school.id);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update subscription");
    } finally {
      setBusy(false);
    }
  }

  async function activateOneMonth(planCode: "basic" | "advanced") {
    if (!selectedRow) return;
    const plan = plans.find((row) => row.code === planCode);
    if (!plan) {
      toast("error", "Plan not found");
      return;
    }
    const window = oneMonthWindow();
    setBusy(true);
    try {
      await markManualPaymentAndActivate({
        school_id: selectedRow.school.id,
        plan_id: plan.id,
        starts_at: fromDateInput(window.start),
        ends_at: fromDateInput(window.end),
        amount_pkr: planCode === "advanced" ? 4500 : 2500,
        provider: "manual",
        transaction_id: `ADMIN-${Date.now()}`,
        created_by: profile?.id || null,
      });
      await writeAudit({
        schoolId: selectedRow.school.id,
        action: "subscription_activated",
        targetType: "plan",
        targetId: plan.id,
        details: {
          plan: plan.code,
          duration: "1_month",
          mode: "manual_quick_action",
        },
      });
      toast("success", `${plan.name} activated for 1 month`);
      await loadPageData(selectedRow.school.id);
      await loadPaymentIntents(selectedRow.school.id);
      await loadAuditLogs(selectedRow.school.id);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to activate plan");
    } finally {
      setBusy(false);
    }
  }

  async function cancelSelectedNow() {
    if (!selectedRow) return;
    const subscription = selectedRow.summary.subscription;
    const nowIso = new Date().toISOString();
    const endsToday = fromDateInput(todayDateInput());
    setBusy(true);
    try {
      await upsertSchoolSubscription({
        school_id: selectedRow.school.id,
        plan_id: subscription?.plan_id || selectedRow.summary.plan.id,
        status: "cancelled",
        starts_at: subscription?.starts_at || nowIso,
        ends_at: endsToday,
        payment_method: subscription?.payment_method || "manual",
        transaction_id: subscription?.transaction_id || null,
        paid_at: subscription?.paid_at || null,
        created_by: profile?.id || null,
      });
      await writeAudit({
        schoolId: selectedRow.school.id,
        action: "subscription_cancelled_now",
        targetType: "subscription",
        targetId: subscription?.id || selectedRow.school.id,
        details: {
          previous_status: selectedRow.summary.status,
          cancelled_at: nowIso,
          end_date: todayDateInput(),
        },
      });
      toast("success", `Subscription cancelled for ${selectedRow.school.name}`);
      await loadPageData(selectedRow.school.id);
      await loadPaymentIntents(selectedRow.school.id);
      await loadAuditLogs(selectedRow.school.id);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to cancel subscription");
    } finally {
      setBusy(false);
    }
  }

  async function submitCreateClient(event: FormEvent) {
    event.preventDefault();
    if (!newSchoolName.trim() || !newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim() || !newPlanId) {
      toast("error", "Fill school, user, email, password and plan");
      return;
    }
    if (newUserPassword.trim().length < 6) {
      toast("error", "Temporary password must be at least 6 characters");
      return;
    }
    if (newSaleMode === "paid" && !newTxnId.trim()) {
      toast("error", "Transaction ID is required for paid activation");
      return;
    }
    setBusy(true);
    setCreatedLoginHint("");
    try {
      const school = await addSchool(newSchoolName.trim());
      await addUserProfile({
        email: newUserEmail.trim().toLowerCase(),
        full_name: newUserName.trim(),
        role: "teacher",
        school_id: school.id,
        password: newUserPassword.trim(),
      });

      const amount = Math.max(0, Number(newAmount) || 0);
      if (newSaleMode === "paid") {
        await markManualPaymentAndActivate({
          school_id: school.id,
          plan_id: newPlanId,
          starts_at: fromDateInput(newStartsAt),
          ends_at: fromDateInput(newEndsAt),
          amount_pkr: amount,
          provider: newProvider,
          transaction_id: newTxnId.trim(),
          payer_phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
          created_by: profile?.id || null,
        });
      } else {
        await createPendingPaymentSubscription({
          school_id: school.id,
          plan_id: newPlanId,
          starts_at: fromDateInput(newStartsAt),
          ends_at: fromDateInput(newEndsAt),
          provider: newProvider,
          amount_pkr: amount,
          payer_phone: newPhone.trim() || null,
          notes: newNotes.trim() || null,
          created_by: profile?.id || null,
        });
      }

      await writeAudit({
        schoolId: school.id,
        action: "client_onboarded",
        targetType: "school",
        targetId: school.id,
        details: {
          school_name: school.name,
          client_email: newUserEmail.trim().toLowerCase(),
          plan_id: newPlanId,
          sale_mode: newSaleMode,
          provider: newProvider,
          amount_pkr: Number(newAmount) || 0,
        },
      });

      setCreatedLoginHint(
        `Client created. Login: ${newUserEmail.trim().toLowerCase()} / ${newUserPassword.trim()} (user can change later).`,
      );
      setNewSchoolName("");
      setNewUserName("");
      setNewUserEmail("");
      setNewUserPassword("client123");
      setNewTxnId("");
      setNewPhone("");
      setNewNotes("");
      await loadPageData(school.id);
      await loadPaymentIntents(school.id);
      await loadAuditLogs(school.id);
      toast("success", "Client onboarded with subscription");
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to create client");
    } finally {
      setBusy(false);
    }
  }

  async function markIntentPaid(intent: PaymentIntent) {
    setBusy(true);
    try {
      await processPaymentWebhook({
        merchant_txn_id: intent.merchant_txn_id,
        provider_txn_id: `SIM-${Date.now()}`,
        status: "success",
        payload: { source: "admin-ui", note: "manual simulation" },
        signature_valid: true,
      });
      await writeAudit({
        schoolId: intent.school_id,
        action: "payment_marked_success",
        targetType: "payment_intent",
        targetId: intent.id,
        details: {
          merchant_txn_id: intent.merchant_txn_id,
          provider: intent.provider,
          amount_pkr: intent.amount_pkr,
        },
      });
      toast("success", "Payment marked paid and subscription activated");
      await loadPageData(intent.school_id);
      await loadPaymentIntents(intent.school_id);
      await loadAuditLogs(intent.school_id);
    } catch (error) {
      toast("error", error instanceof Error ? error.message : "Failed to update payment");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink">Subscriptions</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Create clients, assign plans, and track paid/pending subscriptions.</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <StatCard label="Schools" value={String(totals.totalSchools)} />
        <StatCard label="Active" value={String(totals.active)} className="border-emerald-200 dark:border-emerald-900/40" />
        <StatCard label="Pending" value={String(totals.pending)} className="border-amber-200 dark:border-amber-900/40" />
        <StatCard label="Suspended" value={String(totals.suspended)} className="border-rose-200 dark:border-rose-900/40" />
        <StatCard label="Basic" value={String(totals.basic)} />
        <StatCard label="Advanced" value={String(totals.advanced)} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(540px,1.2fr)_1fr]">
        <div className="rounded-2xl border border-slate-200 bg-card p-4 shadow-soft dark:border-slate-800">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Schools</h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {filteredRows.length}/{rows.length}
            </span>
          </div>
          <label className="mt-3 block text-xs font-semibold text-slate-600 dark:text-slate-300">
            Search School
            <input
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              value={schoolSearch}
              onChange={(e) => setSchoolSearch(e.target.value)}
              placeholder="Type school name..."
            />
          </label>
          <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
            {loading ? (
              <p className="p-3 text-sm text-slate-500 dark:text-slate-400">Loading schools...</p>
            ) : filteredRows.length ? (
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/40">
                  <tr className="border-b border-slate-200 text-[11px] uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <th className="px-2 py-2">School</th>
                    <th className="px-2 py-2">Plan</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-center">Users</th>
                    <th className="px-2 py-2">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row) => (
                    <tr
                      key={row.school.id}
                      onClick={() => setSelectedSchoolId(row.school.id)}
                      className={`cursor-pointer border-b border-slate-100 transition hover:bg-brand/5 dark:border-slate-800/70 ${
                        selectedSchoolId === row.school.id ? "bg-brand/10" : ""
                      }`}
                    >
                      <td className="px-2 py-2 font-semibold text-ink">{row.school.name}</td>
                      <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{row.summary.plan.name}</td>
                      <td className="px-2 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClassMap[row.summary.status]}`}>
                          {row.summary.status.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-center text-slate-700 dark:text-slate-300">{row.users.length}</td>
                      <td className="px-2 py-2 text-slate-700 dark:text-slate-300">{formatDate(row.summary.subscription?.ends_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="p-3 text-sm text-slate-500 dark:text-slate-400">No schools found.</p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedRow ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-card p-4 shadow-soft dark:border-slate-800">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="font-display text-xl font-bold text-ink">{selectedRow.school.name}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Users: {selectedRow.users.length} | Plan: {selectedRow.summary.plan.name}
                    </p>
                  </div>
                  <span className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${statusClassMap[selectedRow.summary.status]}`}>
                    {selectedRow.summary.status.replace("_", " ")}
                  </span>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <InfoCard label="Days Remaining" value={String(selectedRow.summary.daysRemaining)} />
                  <InfoCard label="Paper Variations" value={`Up to ${selectedRow.summary.maxPaperSets}`} />
                  <InfoCard
                    label="Worksheet / Lesson Plan"
                    value={`${selectedRow.summary.canGenerateWorksheets ? "Enabled" : "Locked"} / ${
                      selectedRow.summary.canGenerateLessonPlans ? "Enabled" : "Locked"
                    }`}
                  />
                </div>
              </div>

              <form onSubmit={submitUpdateSubscription} className="rounded-2xl border border-slate-200 bg-card p-4 shadow-soft dark:border-slate-800">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Update Selected School</h3>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Plan
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updatePlanId}
                      onChange={(e) => setUpdatePlanId(e.target.value)}
                    >
                      {plans.map((plan) => (
                        <option key={plan.id} value={plan.id}>
                          {plan.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Status
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updateStatus}
                      onChange={(e) => setUpdateStatus(e.target.value as SubscriptionStatus)}
                    >
                      <option value="active">active</option>
                      <option value="pending_payment">pending_payment</option>
                      <option value="suspended">suspended</option>
                      <option value="cancelled">cancelled</option>
                      <option value="expired">expired</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Start Date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updateStartsAt}
                      onChange={(e) => setUpdateStartsAt(e.target.value)}
                    />
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    End Date
                    <input
                      type="date"
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updateEndsAt}
                      onChange={(e) => setUpdateEndsAt(e.target.value)}
                    />
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Payment Method
                    <select
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updatePaymentMethod}
                      onChange={(e) => setUpdatePaymentMethod(e.target.value as PaymentProvider)}
                    >
                      <option value="manual">manual</option>
                      <option value="jazzcash">jazzcash</option>
                      <option value="easypaisa">easypaisa</option>
                    </select>
                  </label>
                  <label className="text-sm text-slate-700 dark:text-slate-300">
                    Transaction ID (optional)
                    <input
                      className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                      value={updateTxnId}
                      onChange={(e) => setUpdateTxnId(e.target.value)}
                      placeholder="TXN-12345"
                    />
                  </label>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={busy}
                    className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    Save Subscription
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void activateOneMonth("basic")}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    Activate Basic (1 month)
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void activateOneMonth("advanced")}
                    className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    Activate Advanced (1 month)
                  </button>
                  <button
                    type="button"
                    disabled={busy || selectedRow.summary.status === "cancelled"}
                    onClick={() => void cancelSelectedNow()}
                    className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/20"
                  >
                    Cancel Now
                  </button>
                </div>
              </form>

              <div className="rounded-2xl border border-slate-200 bg-card p-4 shadow-soft dark:border-slate-800">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment History</h3>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="px-2 py-2">Created</th>
                        <th className="px-2 py-2">Provider</th>
                        <th className="px-2 py-2">Amount</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Merchant Txn</th>
                        <th className="px-2 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentIntents.length ? (
                        paymentIntents.map((intent) => (
                          <tr key={intent.id} className="border-b border-slate-100 dark:border-slate-800/70">
                            <td className="px-2 py-2">{formatDateTime(intent.created_at)}</td>
                            <td className="px-2 py-2">{intent.provider}</td>
                            <td className="px-2 py-2">PKR {Number(intent.amount_pkr || 0).toFixed(0)}</td>
                            <td className="px-2 py-2">
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  intent.status === "success"
                                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                                    : intent.status === "pending"
                                      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                                      : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                                }`}
                              >
                                {intent.status}
                              </span>
                            </td>
                            <td className="px-2 py-2">{intent.merchant_txn_id}</td>
                            <td className="px-2 py-2">
                              {intent.status === "pending" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void markIntentPaid(intent)}
                                  className="rounded border border-emerald-300 px-2 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
                                >
                                  Mark Paid
                                </button>
                              ) : (
                                <span className="text-xs text-slate-400">-</span>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-2 py-3 text-slate-500 dark:text-slate-400" colSpan={6}>
                            No payment intents yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-card p-4 shadow-soft dark:border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Activity Log</h3>
                  <button
                    type="button"
                    onClick={downloadAuditLogFile}
                    disabled={!auditLogs.length}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
                  >
                    Download Log File
                  </button>
                </div>
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[680px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500 dark:border-slate-800 dark:text-slate-400">
                        <th className="px-2 py-2">Time</th>
                        <th className="px-2 py-2">Action</th>
                        <th className="px-2 py-2">Actor</th>
                        <th className="px-2 py-2">Target</th>
                        <th className="px-2 py-2">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.length ? (
                        auditLogs.map((log) => (
                          <tr key={log.id} className="border-b border-slate-100 dark:border-slate-800/70">
                            <td className="px-2 py-2">{formatDateTime(log.created_at)}</td>
                            <td className="px-2 py-2 font-medium text-ink">{log.action}</td>
                            <td className="px-2 py-2">{log.actor_name || "System"}</td>
                            <td className="px-2 py-2">{`${log.target_type || "-"}:${log.target_id || "-"}`}</td>
                            <td className="max-w-[300px] truncate px-2 py-2 text-xs text-slate-500 dark:text-slate-400">
                              {log.details ? JSON.stringify(log.details) : "{}"}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td className="px-2 py-3 text-slate-500 dark:text-slate-400" colSpan={5}>
                            No activity logs yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-card p-6 text-sm text-slate-500 shadow-soft dark:border-slate-800 dark:text-slate-400">
              Select a school to manage subscription details.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-card p-5 shadow-soft dark:border-slate-800">
        <h2 className="font-display text-2xl font-bold text-ink">Create Client + Assign Subscription</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Use this to onboard a new school, create client login, and set paid/pending plan in one flow.
        </p>
        <form onSubmit={submitCreateClient} className="mt-4 space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              School Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newSchoolName}
                onChange={(e) => setNewSchoolName(e.target.value)}
                placeholder="Al Noor School"
                required
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Client Name
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newUserName}
                onChange={(e) => setNewUserName(e.target.value)}
                placeholder="Ali Raza"
                required
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Login Email
              <input
                type="email"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newUserEmail}
                onChange={(e) => setNewUserEmail(e.target.value)}
                placeholder="client@school.pk"
                required
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Temporary Password
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newUserPassword}
                onChange={(e) => setNewUserPassword(e.target.value)}
                placeholder="client123"
                required
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Plan
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newPlanId}
                onChange={(e) => setNewPlanId(e.target.value)}
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Start Date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
                required
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              End Date
              <input
                type="date"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newEndsAt}
                onChange={(e) => setNewEndsAt(e.target.value)}
                required
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Payment Mode</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setNewSaleMode("paid")}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${newSaleMode === "paid" ? "bg-brand text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                Paid & Activate
              </button>
              <button
                type="button"
                onClick={() => setNewSaleMode("pending")}
                className={`rounded-full px-3 py-1 text-sm font-semibold ${newSaleMode === "pending" ? "bg-brand text-white" : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"}`}
              >
                Pending Payment
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Provider
              <select
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newProvider}
                onChange={(e) => setNewProvider(e.target.value as PaymentProvider)}
              >
                <option value="manual">manual</option>
                <option value="jazzcash">jazzcash</option>
                <option value="easypaisa">easypaisa</option>
              </select>
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Amount (PKR)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                type="number"
                min={0}
                step={1}
                value={newAmount}
                onChange={(e) => setNewAmount(e.target.value)}
                required
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Phone (optional)
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newPhone}
                onChange={(e) => setNewPhone(e.target.value)}
                placeholder="+92..."
              />
            </label>
            <label className="text-sm text-slate-700 dark:text-slate-300">
              Txn ID {newSaleMode === "paid" ? "(required)" : "(optional)"}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
                value={newTxnId}
                onChange={(e) => setNewTxnId(e.target.value)}
                placeholder="JC-984534"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700 dark:text-slate-300">
            Notes (optional)
            <textarea
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              rows={2}
              value={newNotes}
              onChange={(e) => setNewNotes(e.target.value)}
              placeholder="Manual payment verified by admin."
            />
          </label>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-60">
              {busy ? "Processing..." : "Create Client & Assign Plan"}
            </button>
            {createdLoginHint ? <p className="text-sm text-emerald-600 dark:text-emerald-300">{createdLoginHint}</p> : null}
          </div>
        </form>
      </section>
    </div>
  );
}

function StatCard({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-card px-4 py-3 shadow-soft dark:border-slate-800 ${className || ""}`}>
      <p className="text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-ink">{value}</p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-bg px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}
