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
    model?: string;
    lastError?: string;
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
    activeKeyId?: string;
};
