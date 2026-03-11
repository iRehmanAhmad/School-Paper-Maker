import { hasSupabase, supabase } from "@/services/supabase";

export type AIProvider = "groq" | "openrouter" | "together" | "openai" | "gemini" | "supabase" | "deepseek" | "anthropic" | "qwen" | "siliconflow";

export type AIKeyEntry = {
  id: string;
  provider: AIProvider;
  key: string;
  label?: string;
  usageCount: number;
  lastUsed?: string;
  isExhausted?: boolean;
  quotaRemaining?: string;
};

export type AISettings = {
  provider: AIProvider;
  model: string;
  openaiApiKey: string;
  groqApiKey: string;
  openrouterApiKey: string;
  togetherApiKey: string;
  geminiApiKey: string;
  deepseekApiKey: string;
  anthropicApiKey: string;
  qwenApiKey: string;
  siliconflowApiKey: string;
  keyPool: AIKeyEntry[];
};

const KEY = "pg_ai_settings";
let schoolAISettingsTableAvailable: boolean | null = null;

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
          });
        }
      });
      // Save migrated state
      localStorage.setItem(KEY, JSON.stringify(settings));
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
  }
}

export function saveAISettings(input: AISettings) {
  localStorage.setItem(KEY, JSON.stringify(input));
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
  if (!schoolId || !hasSupabase || !supabase) {
    return getAISettings();
  }
  if (schoolAISettingsTableAvailable === false) {
    return getAISettings();
  }
  try {
    const { data, error } = await supabase
      .from("school_ai_settings")
      .select("*")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (error) {
      if (isMissingTableError(error)) {
        schoolAISettingsTableAvailable = false;
      }
      throw error;
    }
    schoolAISettingsTableAvailable = true;
    if (!data) {
      return getAISettings();
    }
    const merged = { ...getAISettings(), ...fromRow(data as Partial<SchoolAISettingsRow>) };
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
  if (!schoolId || !hasSupabase || !supabase) {
    return;
  }
  if (schoolAISettingsTableAvailable === false) {
    return;
  }
  const row = toRow(schoolId, input, updatedBy);
  const { error } = await supabase.from("school_ai_settings").upsert(row, { onConflict: "school_id" });
  if (error) {
    if (isMissingTableError(error)) {
      schoolAISettingsTableAvailable = false;
      return;
    }
    throw error;
  }
  schoolAISettingsTableAvailable = true;
}
