export type AIProvider = "groq" | "openrouter" | "together" | "openai" | "gemini" | "supabase" | "deepseek" | "anthropic";

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
};

const KEY = "pg_ai_settings";

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
};

export function getAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return { ...defaults, ...parsed };
  } catch {
    return defaults;
  }
}

export function saveAISettings(input: AISettings) {
  localStorage.setItem(KEY, JSON.stringify(input));
}
