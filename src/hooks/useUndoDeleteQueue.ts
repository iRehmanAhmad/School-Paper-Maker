import { useEffect, useRef } from "react";
import { useAppStore } from "@/store/useAppStore";

type PendingDelete = {
  timer: ReturnType<typeof setTimeout>;
  commit: () => Promise<void>;
  rollback: () => void;
};

type QueueDeleteOptions = {
  label: string;
  commit: () => Promise<void> | void;
  rollback: () => void;
  successMessage?: string;
  failureMessage?: string;
  timeoutMs?: number;
};

export function useUndoDeleteQueue() {
  const toast = useAppStore((s) => s.pushToast);
  const queueRef = useRef<Map<string, PendingDelete>>(new Map());

  function undoDelete(id: string) {
    const entry = queueRef.current.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    queueRef.current.delete(id);
    entry.rollback();
    toast("success", "Delete undone");
  }

  function queueDelete({
    label,
    commit,
    rollback,
    successMessage,
    failureMessage,
    timeoutMs = 3500,
  }: QueueDeleteOptions) {
    const queueId = crypto.randomUUID();

    const runCommit = async () => {
      queueRef.current.delete(queueId);
      try {
        await commit();
        toast("success", successMessage || `${label} deleted`);
      } catch (error) {
        rollback();
        toast("error", failureMessage || `Failed to delete ${label.toLowerCase()}`);
      }
    };

    const timer = setTimeout(() => {
      runCommit();
    }, timeoutMs);

    queueRef.current.set(queueId, { timer, commit: runCommit, rollback });
    toast("success", `${label} removed`, {
      label: "Undo",
      onClick: () => undoDelete(queueId),
    });
  }

  useEffect(() => {
    return () => {
      const pending = Array.from(queueRef.current.values());
      queueRef.current.clear();
      pending.forEach((entry) => {
        clearTimeout(entry.timer);
        entry.commit();
      });
    };
  }, []);

  return { queueDelete };
}
