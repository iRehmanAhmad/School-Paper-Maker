import { getAISettings, updateKeyStatus, type AIProvider, type AISettings, type AIKeyEntry } from "@/services/aiSettings";
import { hasSupabase, supabase } from "@/services/supabase";
import type { BloomLevel, Difficulty, QuestionLevel, QuestionType } from "@/types/domain";

export type AIGeneratedQuestion = {
  question_text: string;
  options?: string[];
  correct_answer?: string;
  explanation?: string;
  difficulty?: Difficulty;
  bloom_level?: BloomLevel;
  question_level?: QuestionLevel;
  marks?: number;
  diagram_url?: string;
};

type AIInput = {
  file: File;
  questionType: QuestionType;
  count: number;
  difficulty: Difficulty;
  bloomLevel: BloomLevel | "";
  questionLevel: QuestionLevel;
  instructions?: string;
  startPage?: number;
  endPage?: number;
};

export type AISyllabusInput = {
  examBody: string;
  className: string;
  subjectName: string;
  instructions?: string;
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type DiscussionResponse = {
  message: string;
  suggestedConfig?: {
    questionType?: QuestionType;
    count?: number;
    difficulty?: Difficulty;
    bloomLevel?: BloomLevel | "";
    questionLevel?: QuestionLevel;
    instructions?: string;
  };
  generatedQuestions?: AIGeneratedQuestion[];
};

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const out = String(reader.result || "");
      const base64 = out.includes(",") ? out.split(",")[1] : out;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function buildPrompt(input: AIInput) {
  return `Generate ${input.count} ${input.questionType} questions for school exam prep.
Difficulty: ${input.difficulty}
Bloom Level: ${input.bloomLevel}
Source file name: ${input.file.name}
Additional instructions: ${input.instructions || "None"}

Return strict JSON:
{"questions":[{"question_text":"...","options":["..."],"correct_answer":"...","explanation":"...","difficulty":"easy|medium|hard","bloom_level":"remember|understand|apply|analyze|evaluate","marks":1,"diagram_url":"...optional"}]}

Rules:
- mcq => 4 options + correct_answer A/B/C/D
- true_false => correct_answer True/False
- short/long => no options
- matching => mapping format A-2;B-1
- diagram => include diagram_url if possible`;
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string, extraHeaders?: Record<string, string>, keyId?: string) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(extraHeaders || {}),
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    }),
  });

  if (keyId) {
    const remainingReq = response.headers.get("x-ratelimit-remaining-requests");
    const remainingTok = response.headers.get("x-ratelimit-remaining-tokens");
    const quota = remainingReq ? `${remainingReq} req remaining` : remainingTok ? `${remainingTok} tokens remaining` : undefined;

    if (response.ok) {
      const settings = getAISettings();
      const currentEntry = settings.keyPool.find(k => k.id === keyId);
      updateKeyStatus(keyId, {
        usageCount: (currentEntry?.usageCount || 0) + 1,
        lastUsed: new Date().toISOString(),
        quotaRemaining: quota,
        isExhausted: false
      });
    } else if (response.status === 429) {
      updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Rate Limited" });
    }
  }

  if (!response.ok) {
    throw new Error(`AI provider error: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI provider returned empty response");
  }

  const cleaned = String(content).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as { questions?: AIGeneratedQuestion[] };
  return parsed.questions || [];
}

async function callGemini(apiKey: string, model: string, prompt: string, keyId?: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.3 },
    }),
  });

  if (keyId) {
    if (response.ok) {
      const settings = getAISettings();
      const currentEntry = settings.keyPool.find(k => k.id === keyId);
      updateKeyStatus(keyId, {
        usageCount: (currentEntry?.usageCount || 0) + 1,
        lastUsed: new Date().toISOString(),
        isExhausted: false
      });
    } else if (response.status === 429) {
      updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Quota Exceeded" });
    }
  }

  if (!response.ok) {
    throw new Error(`Gemini error: ${await response.text()}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error("Gemini returned empty response");
  }

  const cleaned = String(text).replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as { questions?: AIGeneratedQuestion[] };
  return parsed.questions || [];
}

function mockQuestions(input: AIInput): AIGeneratedQuestion[] {
  const items: AIGeneratedQuestion[] = [];
  for (let i = 1; i <= input.count; i += 1) {
    if (input.questionType === "mcq") {
      items.push({
        question_text: `AI mock MCQ ${i} based on ${input.file.name}`,
        options: ["Option A", "Option B", "Option C", "Option D"],
        correct_answer: "A",
        explanation: "Mock explanation",
        difficulty: input.difficulty,
        bloom_level: input.bloomLevel || undefined,
        question_level: input.questionLevel || "exercise",
        marks: 1,
      });
    } else if (input.questionType === "true_false") {
      items.push({
        question_text: `AI mock True/False ${i} from ${input.file.name}`,
        correct_answer: i % 2 === 0 ? "True" : "False",
        difficulty: input.difficulty,
        bloom_level: input.bloomLevel || undefined,
        question_level: input.questionLevel || "exercise",
        marks: 1,
      });
    } else {
      items.push({
        question_text: `AI mock ${input.questionType} question ${i} from ${input.file.name}`,
        correct_answer: input.questionType === "fill_blanks" || input.questionType === "matching" || input.questionType === "diagram" ? "Sample answer" : undefined,
        difficulty: input.difficulty,
        bloom_level: input.bloomLevel || undefined,
        question_level: input.questionLevel || "exercise",
        marks: input.questionType === "long" ? 5 : input.questionType === "short" ? 2 : 1,
      });
    }
  }
  return items;
}

async function callProvider(provider: AIProvider, settings: AISettings, prompt: string, keyEntry: AIKeyEntry): Promise<AIGeneratedQuestion[]> {
  const model = settings.model || "";
  const apiKey = keyEntry.key;
  const keyId = keyEntry.id;

  if (provider === "groq") {
    return callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", apiKey, model || "llama-3.3-70b-versatile", prompt, undefined, keyId);
  }

  if (provider === "openrouter") {
    return callOpenAICompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      apiKey,
      model || "meta-llama/llama-3.3-70b-instruct:free",
      prompt,
      { "HTTP-Referer": window.location.origin, "X-Title": "Paper Generator" },
      keyId
    );
  }

  if (provider === "together") {
    return callOpenAICompatible("https://api.together.xyz/v1/chat/completions", apiKey, model || "meta-llama/Llama-3.3-70B-Instruct-Turbo", prompt, undefined, keyId);
  }

  if (provider === "openai") {
    return callOpenAICompatible("https://api.openai.com/v1/chat/completions", apiKey, model || "gpt-4o-mini", prompt, undefined, keyId);
  }

  if (provider === "gemini") {
    return callGemini(apiKey, model || "gemini-1.5-flash", prompt, keyId);
  }

  if (provider === "deepseek") {
    return callOpenAICompatible("https://api.deepseek.com/v1/chat/completions", apiKey, model || "deepseek-chat", prompt, undefined, keyId);
  }

  if (provider === "qwen") {
    return callOpenAICompatible("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", apiKey, model || "qwen-plus", prompt, undefined, keyId);
  }

  if (provider === "siliconflow") {
    return callOpenAICompatible("https://api.siliconflow.cn/v1/chat/completions", apiKey, model || "deepseek-ai/DeepSeek-V3", prompt, undefined, keyId);
  }

  if (provider === "anthropic" && settings.anthropicApiKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "dangerously-allow-browser": "true"
      },
      body: JSON.stringify({
        model: model || "claude-3-5-sonnet-20240620",
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const content = data?.content?.[0]?.text;
    if (!content) throw new Error("Anthropic returned empty response");
    const cleaned = String(content).replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned) as { questions?: AIGeneratedQuestion[] };
    return parsed.questions || [];
  }

  throw new Error(`Provider ${provider} not configured or recognized`);
}

async function tryClientSideProviders(input: AIInput): Promise<AIGeneratedQuestion[] | null> {
  const settings = getAISettings();
  const prompt = buildPrompt(input);

  const providers: AIProvider[] = [
    "groq", "gemini", "deepseek", "qwen", "siliconflow", "openrouter", "together", "openai", "anthropic"
  ];
  const providerPriority = providers;

  const keyChain = [...settings.keyPool]
    .filter(k => !k.isExhausted)
    .sort((a, b) => {
      if (a.provider === settings.provider && b.provider !== settings.provider) return -1;
      if (a.provider !== settings.provider && b.provider === settings.provider) return 1;
      const aIdx = providerPriority.indexOf(a.provider);
      const bIdx = providerPriority.indexOf(b.provider);
      return aIdx - bIdx;
    });

  if (!keyChain.length) return null;

  for (const keyEntry of keyChain) {
    try {
      if (keyEntry.provider !== settings.provider) {
        console.log(`[AI] Primary ${settings.provider} failed or skipped, falling back to ${keyEntry.provider} (Key: ${keyEntry.label || keyEntry.id})`);
      }
      return await callProvider(keyEntry.provider, settings, prompt, keyEntry);
    } catch (err) {
      console.warn(`[AI] Key ${keyEntry.label || keyEntry.id} (${keyEntry.provider}) failed:`, err);
      updateKeyStatus(keyEntry.id, { isExhausted: true });
    }
  }

  return null;
}

async function trySupabaseFunction(input: AIInput): Promise<AIGeneratedQuestion[] | null> {
  if (!hasSupabase || !supabase) {
    return null;
  }

  const pdfBase64 = await toBase64(input.file);
  const { data, error } = await supabase.functions.invoke("ai-generate-questions", {
    body: {
      pdf_base64: pdfBase64,
      file_name: input.file.name,
      question_type: input.questionType,
      count: input.count,
      difficulty: input.difficulty,
      bloom_level: input.bloomLevel,
      instructions: input.instructions || "",
    },
  });

  if (error) {
    throw new Error(error.message || "AI generation failed");
  }

  const questions = (data?.questions || []) as AIGeneratedQuestion[];
  if (!Array.isArray(questions) || !questions.length) {
    throw new Error("AI returned no questions");
  }

  return questions;
}

export async function generateQuestionsFromPdf(input: AIInput): Promise<AIGeneratedQuestion[]> {
  try {
    const direct = await tryClientSideProviders(input);
    if (direct && direct.length) {
      return direct;
    }
  } catch {
    // fallback to supabase/mocks
  }

  try {
    const fromSupabase = await trySupabaseFunction(input);
    if (fromSupabase && fromSupabase.length) {
      return fromSupabase;
    }
  } catch {
    // fallback to mocks
  }

  return mockQuestions(input);
}

export async function generateSyllabus(input: AISyllabusInput): Promise<string[]> {
  const settings = getAISettings();
  const prompt = `Generate a standard chapter-wise syllabus list for:
Exam Body: ${input.examBody}
Class: ${input.className}
Subject: ${input.subjectName}
${input.instructions ? `Special Instructions: ${input.instructions}` : ""}

Return ONLY a strict JSON object with a "chapters" array of strings. 
Example response: {"chapters": ["Introduction to Physics", "Kinematics", "Dynamics"]}
Do not include chapter numbers in the titles.`;

  const providerPriority: AIProvider[] = [
    "groq", "gemini", "deepseek", "qwen", "siliconflow", "openrouter", "together", "openai", "anthropic"
  ];

  const keyChain = [...settings.keyPool]
    .filter(k => !k.isExhausted)
    .sort((a, b) => {
      if (a.provider === settings.provider && b.provider !== settings.provider) return -1;
      if (a.provider !== settings.provider && b.provider === settings.provider) return 1;
      const aIdx = providerPriority.indexOf(a.provider);
      const bIdx = providerPriority.indexOf(b.provider);
      return aIdx - bIdx;
    });

  for (const keyEntry of keyChain) {
    const provider = keyEntry.provider;
    const apiKey = keyEntry.key;
    const keyId = keyEntry.id;
    try {
      let content = "";
      if (provider === "gemini") {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model || "gemini-1.5-flash"}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
        });
        if (response.ok) {
          const data = await response.json();
          content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString() });
        } else if (response.status === 429) {
          updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Quota Exceeded" });
        }
      } else {
        const urlMap: Record<string, string> = {
          groq: "https://api.groq.com/openai/v1/chat/completions",
          openai: "https://api.openai.com/v1/chat/completions",
          openrouter: "https://openrouter.ai/api/v1/chat/completions",
          deepseek: "https://api.deepseek.com/v1/chat/completions",
          qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
          siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
          together: "https://api.together.xyz/v1/chat/completions",
        };
        const url = urlMap[provider];
        const model = settings.model || (provider === "groq" ? "llama-3.3-70b-versatile" : provider === "openai" ? "gpt-4o-mini" : "");

        if (url && apiKey) {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
          });
          if (resp.ok) {
            const data = await resp.json();
            content = data?.choices?.[0]?.message?.content || "";
            updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString() });
          } else if (resp.status === 429) {
            updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Rate Limited" });
          }
        }
      }

      if (content) {
        const cleaned = content.replace(/```json|```/g, "").trim();
        const parsed = JSON.parse(cleaned);
        if (Array.isArray(parsed.chapters)) return parsed.chapters;
      }
    } catch (err) {
      console.warn(`[AI Syllabus] Provider ${provider} (Key ${keyId}) failed:`, err);
    }
  }

  return ["Chapter 1: Introduction", "Chapter 2: Fundamental Concepts", "Chapter 3: Advanced Topics"];
}

export async function discussGenerationStrategy(history: ChatMessage[], file?: File): Promise<DiscussionResponse> {
  const settings = getAISettings();
  const systemPrompt = `You are an expert Paper Architect. Your goal is to help teachers plan and generate questions.
When the user describes what they need, provide helpful advice.
If the user asks to "generate" or "create" questions (and a file is attached), return them in a "generatedQuestions" array.
If you have enough information to suggest a configuration, include a "suggestedConfig" object.

Valid values for config:
- questionType: "mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"
- difficulty: "easy", "medium", "hard"
- bloomLevel: "remember", "understand", "apply", "analyze", "evaluate", ""
- questionLevel: "exercise", "additional", "past_papers", "examples", "conceptual"

Return JSON in this format:
{
  "message": "Your conversational response here...",
  "suggestedConfig": { ...optional settings... },
  "generatedQuestions": [ ...optional generated questions... ]
}`;

  let promptPrefix = "";
  if (file) {
    promptPrefix = `[Attached File: ${file.name}]\n`;
  }

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.map((m, i) => (i === history.length - 1 ? { ...m, content: promptPrefix + m.content } : m))
  ];

  const providerPriority: AIProvider[] = [
    "groq", "gemini", "deepseek", "qwen", "siliconflow", "openrouter", "together", "openai", "anthropic"
  ];

  const keyChain = [...settings.keyPool]
    .filter(k => !k.isExhausted)
    .sort((a, b) => {
      if (a.provider === settings.provider && b.provider !== settings.provider) return -1;
      if (a.provider !== settings.provider && b.provider === settings.provider) return 1;
      const aIdx = providerPriority.indexOf(a.provider);
      const bIdx = providerPriority.indexOf(b.provider);
      return aIdx - bIdx;
    });

  for (const keyEntry of keyChain) {
    const provider = keyEntry.provider;
    const apiKey = keyEntry.key;
    const keyId = keyEntry.id;
    try {
      let content = "";
      if (provider === "gemini") {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model || "gemini-1.5-flash"}:generateContent?key=${apiKey}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }),
        });
        if (response.ok) {
          const data = await response.json();
          content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
          updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString() });
        } else if (response.status === 429) {
          updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Quota Exceeded" });
        }
      } else {
        const urlMap: Record<string, string> = {
          groq: "https://api.groq.com/openai/v1/chat/completions",
          openai: "https://api.openai.com/v1/chat/completions",
          openrouter: "https://openrouter.ai/api/v1/chat/completions",
          deepseek: "https://api.deepseek.com/v1/chat/completions",
          qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
          siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
          together: "https://api.together.xyz/v1/chat/completions",
        };
        const url = urlMap[provider];
        const model = settings.model || (provider === "groq" ? "llama-3.3-70b-versatile" : provider === "openai" ? "gpt-4o-mini" : "");

        if (url && apiKey) {
          const resp = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.7,
              response_format: { type: "json_object" }
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            content = data?.choices?.[0]?.message?.content || "";
            updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString() });
          } else if (resp.status === 429) {
            updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Rate Limited" });
          }
        }
      }

      if (content) {
        const cleaned = content.replace(/```json|```/g, "").trim();
        return JSON.parse(cleaned) as DiscussionResponse;
      }
    } catch (err) {
      console.warn(`[AI Chat] Provider ${provider} (Key ${keyId}) failed:`, err);
    }
  }

  return { message: "All configured AI providers failed. Please check your API keys and try again." };
}
