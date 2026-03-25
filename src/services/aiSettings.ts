import { canUseSupabase, supabase } from "@/services/supabase";
import { type AIProvider, type AIKeyEntry, type AISettings } from "@/types/ai";
import { useAppStore } from "@/store/useAppStore";

const KEY = "pg_ai_settings";
const AVAIL_KEY = "pg_ai_settings_avail";
let schoolAISettingsTableAvailable: boolean | null = null;

function getTableAvail() {
  if (schoolAISettingsTableAvailable !== null) return schoolAISettingsTableAvailable;
  const cached = localStorage.getItem(AVAIL_KEY);
  if (cached === "false") {
    schoolAISettingsTableAvailable = false;
    return false;
  }
  return true;
}

function setTableAvail(avail: boolean) {
  schoolAISettingsTableAvailable = avail;
  localStorage.setItem(AVAIL_KEY, String(avail));
}

const defaults: AISettings = {
  provider: "groq",
  model: "llama-3.3-70b-versatile",
  openaiApiKey: "",
  groqApiKey: "",
  openrouterApiKey: "",
  togetherApiKey: "",
  geminiApiKey: "",
  deepseekApiKey: "",
  anthropicApiKey: "",
  qwenApiKey: "",
  siliconflowApiKey: "",
  keyPool: [],
  activeKeyId: "",
};

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    const settings = { ...defaults, ...parsed };

    // Self-migration: Move individual keys to pool if pool is empty
    if (!settings.keyPool || settings.keyPool.length === 0) {
      const providers: AIProvider[] = ["groq", "gemini", "deepseek", "qwen", "siliconflow", "openai", "anthropic", "openrouter", "together"];
      providers.forEach(p => {
        const key = settings[`${p}ApiKey` as keyof AISettings];
        if (typeof key === "string" && key) {
          settings.keyPool.push({
            id: `initial-${p}`,
            provider: p,
            key,
            label: "Primary Key",
            usageCount: 0,
            isExhausted: false,
            model: settings.model || defaults.model,
          });
        }
      });
      // Save migrated state
      localStorage.setItem(KEY, JSON.stringify(settings));
    }

    // Migration: collapse multi-model keys to single model
    if (settings.keyPool && settings.keyPool.length) {
      let changed = false;
      const providerCounts: Record<string, number> = {};
      settings.keyPool = settings.keyPool.map((k) => {
        const anyKey = k as unknown as { models?: string[]; model?: string };
        if (!anyKey.model && Array.isArray(anyKey.models) && anyKey.models.length) {
          changed = true;
          k = { ...k, model: anyKey.models[0] };
        }
        if (!k.label || k.label === "Primary Key") {
          providerCounts[k.provider] = (providerCounts[k.provider] || 0) + 1;
          const stamp = new Date().toLocaleDateString() + " " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          k = { ...k, label: `${k.provider} Key #${providerCounts[k.provider]} • ${stamp}` };
          changed = true;
        }
        return k;
      });
      if (changed) {
        localStorage.setItem(KEY, JSON.stringify(settings));
      }
    }

    if (!settings.activeKeyId) {
      settings.activeKeyId = "";
    }

    return settings;
  } catch {
    return defaults;
  }
}

export function updateKeyStatus(keyId: string, updates: Partial<AIKeyEntry>) {
  const settings = getAISettings();
  const idx = settings.keyPool.findIndex(k => k.id === keyId);
  if (idx !== -1) {
    settings.keyPool[idx] = { ...settings.keyPool[idx], ...updates };
    saveAISettings(settings);
    // Sync to store
    useAppStore.getState().setAiSettings(settings);
  }
}

export function saveAISettings(input: AISettings) {
  localStorage.setItem(KEY, JSON.stringify(input));
  // Sync to store
  useAppStore.getState().setAiSettings(input);
}

type SchoolAISettingsRow = {
  school_id: string;
  provider: AIProvider;
  model: string;
  openai_api_key: string;
  groq_api_key: string;
  openrouter_api_key: string;
  together_api_key: string;
  gemini_api_key: string;
  deepseek_api_key: string;
  anthropic_api_key: string;
  qwen_api_key: string;
  siliconflow_api_key: string;
  updated_by?: string | null;
  updated_at?: string;
};

function isMissingTableError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const anyError = error as { status?: number; code?: string; message?: string; details?: string };
  const message = `${anyError.message || ""} ${anyError.details || ""}`.toLowerCase();
  return (
    anyError.status === 404 ||
    anyError.code === "PGRST205" ||
    anyError.code === "42P01" ||
    message.includes("could not find the table") ||
    message.includes("relation") && message.includes("does not exist")
  );
}

function toRow(schoolId: string, input: AISettings, updatedBy?: string | null): SchoolAISettingsRow {
  return {
    school_id: schoolId,
    provider: input.provider,
    model: input.model,
    openai_api_key: input.openaiApiKey || "",
    groq_api_key: input.groqApiKey || "",
    openrouter_api_key: input.openrouterApiKey || "",
    together_api_key: input.togetherApiKey || "",
    gemini_api_key: input.geminiApiKey || "",
    deepseek_api_key: input.deepseekApiKey || "",
    anthropic_api_key: input.anthropicApiKey || "",
    qwen_api_key: input.qwenApiKey || "",
    siliconflow_api_key: input.siliconflowApiKey || "",
    updated_by: updatedBy || null,
    updated_at: new Date().toISOString(),
  };
}

function fromRow(row: Partial<SchoolAISettingsRow>): AISettings {
  return {
    provider: (row.provider as AIProvider) || defaults.provider,
    model: row.model || defaults.model,
    openaiApiKey: row.openai_api_key || "",
    groqApiKey: row.groq_api_key || "",
    openrouterApiKey: row.openrouter_api_key || "",
    togetherApiKey: row.together_api_key || "",
    geminiApiKey: row.gemini_api_key || "",
    deepseekApiKey: row.deepseek_api_key || "",
    anthropicApiKey: row.anthropic_api_key || "",
    qwenApiKey: row.qwen_api_key || "",
    siliconflowApiKey: row.siliconflow_api_key || "",
    keyPool: [],
  };
}
export async function getSchoolAISettings(schoolId: string | null | undefined) {
  if (!schoolId || !canUseSupabase()) {
    return getAISettings();
  }
  if (!getTableAvail()) {
    return getAISettings();
  }
  try {
    const { data, error } = await supabase!
      .from("school_ai_settings")
      .select("*")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        setTableAvail(false);
      }
      throw error;
    }
    setTableAvail(true);
    if (!data) {
      return getAISettings();
    }
    const local = getAISettings();
    const cloud = fromRow(data as Partial<SchoolAISettingsRow>);
    const merged = {
      ...local,
      ...cloud,
      // Keep local vault entries/active key; cloud table currently stores provider keys + model only.
      keyPool: local.keyPool || [],
      activeKeyId: local.activeKeyId || "",
    };
    saveAISettings(merged);
    return merged;
  } catch {
    return getAISettings();
  }
}

export async function saveSchoolAISettings(
  schoolId: string | null | undefined,
  input: AISettings,
  updatedBy?: string | null,
) {
  saveAISettings(input);
  if (!schoolId || !canUseSupabase()) {
    return;
  }
  if (!getTableAvail()) {
    return;
  }
  const row = toRow(schoolId, input, updatedBy);
  const { error } = await supabase!.from("school_ai_settings").upsert(row, { onConflict: "school_id" });
  if (error) {
    if (isMissingTableError(error)) {
      schoolAISettingsTableAvailable = false;
      return;
    }
    throw error;
  }
  schoolAISettingsTableAvailable = true;
}

