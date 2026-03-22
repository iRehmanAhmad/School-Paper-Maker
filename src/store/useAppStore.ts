import { create } from "zustand";
import type { GeneratedPaperBundle, UserProfile } from "@/types/domain";
import { type AISettings } from "@/types/ai";
import { getAISettings } from "@/services/aiSettings";

type ToastAction = {
  label: string;
  onClick: () => void;
};

type Toast = {
  id: string;
  type: "success" | "error";
  message: string;
  action?: ToastAction;
};

type AppState = {
  profile: UserProfile | null;
  activeSchoolId: string | null;
  generatedPaper: GeneratedPaperBundle | null;
  toasts: Toast[];
  aiSettings: AISettings;
  setProfile: (profile: UserProfile | null) => void;
  setAiSettings: (settings: AISettings) => void;
  setGeneratedPaper: (bundle: GeneratedPaperBundle | null) => void;
  pushToast: (type: Toast["type"], message: string, action?: ToastAction) => void;
  removeToast: (id: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  activeSchoolId: null,
  generatedPaper: null,
  toasts: [],
  aiSettings: getAISettings(),
  setProfile: (profile) => set({ profile, activeSchoolId: profile?.school_id ?? null }),
  setAiSettings: (aiSettings) => set({ aiSettings }),
  setGeneratedPaper: (generatedPaper) => set({ generatedPaper }),
  pushToast: (type, message, action) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message, action }],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 4000);
  },
  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));
