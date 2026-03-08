import { create } from "zustand";
import type { GeneratedPaperBundle, UserProfile } from "@/types/domain";

type Toast = { id: string; type: "success" | "error"; message: string };

type AppState = {
  profile: UserProfile | null;
  activeSchoolId: string | null;
  generatedPaper: GeneratedPaperBundle | null;
  toasts: Toast[];
  setProfile: (profile: UserProfile | null) => void;
  setGeneratedPaper: (bundle: GeneratedPaperBundle | null) => void;
  pushToast: (type: Toast["type"], message: string) => void;
  removeToast: (id: string) => void;
};

export const useAppStore = create<AppState>((set) => ({
  profile: null,
  activeSchoolId: null,
  generatedPaper: null,
  toasts: [],
  setProfile: (profile) => set({ profile, activeSchoolId: profile?.school_id ?? null }),
  setGeneratedPaper: (generatedPaper) => set({ generatedPaper }),
  pushToast: (type, message) => {
    const id = crypto.randomUUID();
    set((state) => ({
      toasts: [...state.toasts, { id, type, message }],
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
