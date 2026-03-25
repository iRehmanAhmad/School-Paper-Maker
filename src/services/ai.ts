import { getAISettings, updateKeyStatus } from "@/services/aiSettings";
import { type AIProvider, type AISettings, type AIKeyEntry } from "@/types/ai";
import { canUseSupabase, supabase } from "@/services/supabase";
import type { ArtifactType, BloomLevel, Difficulty, QuestionLevel, QuestionType } from "@/types/domain";

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

export type AISubjectOutlineChapter = {
  title: string;
  topics: string[];
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractUnitsFromText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const units: string[] = [];
  const seen = new Set<string>();

  const unitRegex = /^(unit|chapter|lesson|section|block)\s*[\d.]*[:.\-)\s]*(.+)$/i;
  const numberedTitle = /^(\d{1,3})[.)\-\s]+([A-Za-z].{3,120})$/;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    let title = "";
    const unitMatch = line.match(unitRegex);
    if (unitMatch) {
      title = unitMatch[2].trim();
      if (title.length < 3 && index + 1 < lines.length) {
        const nextLine = lines[index + 1].trim();
        if (nextLine && nextLine.length <= 120 && /^[A-Za-z]/.test(nextLine)) {
          title = nextLine;
        }
      }
    } else {
      const numberedMatch = line.match(numberedTitle);
      if (numberedMatch && /^[A-Z]/.test(numberedMatch[2].trim())) {
        title = numberedMatch[2].trim();
        if (title.length < 3 && index + 1 < lines.length) {
          const nextLine = lines[index + 1].trim();
          if (nextLine && nextLine.length <= 120 && /^[A-Za-z]/.test(nextLine)) {
            title = nextLine;
          }
        }
      }
    }

    if (title) {
      const clean = title.replace(/\s{2,}/g, " ").replace(/[:.\-)\s]+$/, "").trim();
      if (clean.length >= 4 && clean.length <= 100) {
        const key = clean.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          units.push(clean);
        }
      }
    }
  }

  return units;
}

function extractUnitsFromTextLoose(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const units: string[] = [];
  const seen = new Set<string>();

  const unitRegex = /^(unit|chapter|lesson)\s*\d*[:.\-)\s]*(.+)$/i;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const unitMatch = line.match(unitRegex);
    if (unitMatch) {
      let title = unitMatch[2].trim();
      if (title.length < 3 && index + 1 < lines.length) {
        const nextLine = lines[index + 1].trim();
        if (nextLine && nextLine.length <= 120 && /^[A-Za-z]/.test(nextLine)) {
          title = nextLine;
        }
      }
      const clean = title.replace(/\s{2,}/g, " ").replace(/[:.\-)\s]+$/, "").trim();
      if (clean.length >= 3 && clean.length <= 80) {
        const key = clean.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          units.push(clean);
        }
      }
    }
  }
  return units;
}

const UNIT_STOP_WORDS = [
  "learning outcomes",
  "objectives",
  "overview",
  "introduction",
  "exercises",
  "exercise",
  "review",
  "summary",
  "activities",
  "activity",
  "assessment",
  "practice",
  "teacher guide",
  "teaching guide",
  "project",
  "worksheet",
  "topic",
];

function cleanUnitTitle(rawTitle: string) {
  let title = rawTitle.replace(/\s{2,}/g, " ").trim();
  const lower = title.toLowerCase();
  for (const stop of UNIT_STOP_WORDS) {
    const idx = lower.indexOf(stop);
    if (idx > 0) {
      title = title.slice(0, idx).trim();
      break;
    }
  }
  title = title.replace(/^(unit|chapter|lesson)\s*\d+\s*[:.\-)\s]*/i, "");
  return title.replace(/[:.\-)\s]+$/, "").trim();
}

function extractUnitsFromTextAnywhere(text: string) {
  const units: string[] = [];
  const seen = new Set<string>();
  const regex = /(unit|chapter|lesson)\s*\d{1,3}\s*[:.\-)\s]*([^\n]{1,120})/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const rawTitle = match[2] || "";
    const clean = cleanUnitTitle(rawTitle);
    if (clean.length >= 3 && clean.length <= 100) {
      const key = clean.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        units.push(clean);
      }
    }
  }
  return units;
}

function parseOutlineFromLooseText(raw: string): AISubjectOutlineChapter[] | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;

  const chapters: AISubjectOutlineChapter[] = [];
  let current: AISubjectOutlineChapter | null = null;

  const chapterRegex = /^(unit|chapter|lesson)\s*\d*[:.\-)\s]+(.+)$/i;
  const numberedRegex = /^(\d{1,2})[.)\-\s]+(.+)$/;

  for (const line of lines) {
    const chapterMatch = line.match(chapterRegex);
    const numberedMatch = line.match(numberedRegex);

    if (chapterMatch) {
      if (current) chapters.push(current);
      current = { title: chapterMatch[2].trim(), topics: [] };
      continue;
    }

    if (numberedMatch && !current) {
      current = { title: numberedMatch[2].trim(), topics: [] };
      continue;
    }

    if (current) {
      const bulletMatch = line.match(/^[-•*]\s*(.+)$/);
      if (bulletMatch) {
        current.topics.push(bulletMatch[1].trim());
      } else if (line.toLowerCase().startsWith("topics:")) {
        const topics = line.replace(/topics:/i, "").split(/[;,]/).map((t) => t.trim()).filter(Boolean);
        current.topics.push(...topics);
      } else if (line.includes(",")) {
        const topics = line.split(",").map((t) => t.trim()).filter(Boolean);
        if (topics.length >= 2) {
          current.topics.push(...topics);
        }
      }
    }
  }

  if (current) chapters.push(current);
  const cleaned = chapters
    .map((ch) => ({
      title: ch.title.replace(/^chapter\s*\d*[:.\-)\s]*/i, "").trim(),
      topics: Array.from(new Set(ch.topics.filter(Boolean))),
    }))
    .filter((ch) => ch.title.length > 0);
  return cleaned.length ? cleaned : null;
}

function normalizeForMatch(value: string) {
  return value
    .toLowerCase()
    .replace(/^(unit|chapter|lesson|section|block|part|ch|topic|module|lec)\s*[\d.]*[:.\-)\s]*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .replace(/(.)\s(?=.)/g, "$1") // De-space (optional, for "U N I T" cases)
    .trim();
}

function getSimilarity(s1: string, s2: string): number {
  const n1 = normalizeForMatch(s1);
  const n2 = normalizeForMatch(s2);
  if (n1 === n2) return 1.0;
  if (!n1 || !n2) return 0;
  
  const bigrams1 = new Set<string>();
  for (let i = 0; i < n1.length - 1; i++) bigrams1.add(n1.substring(i, i + 2));
  const bigrams2 = new Set<string>();
  for (let i = 0; i < n2.length - 1; i++) bigrams2.add(n2.substring(i, i + 2));
  
  let intersect = 0;
  for (const b of bigrams1) if (bigrams2.has(b)) intersect++;
  
  return (2.0 * intersect) / (bigrams1.size + bigrams2.size || 1);
}

function buildOutlineExcerpt(rawText: string, maxChars: number) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const unitLineRegex = /^(unit|chapter|lesson|section|block)\s*[\d.]*[:.\-)\s]*.+$/i;
  const numberedTitle = /^(\d{1,3})[.)\-\s]+[A-Za-z].{3,120}$/;
  const unitLines = lines.filter((line) => unitLineRegex.test(line) || numberedTitle.test(line)).slice(0, 180);
  if (unitLines.length >= 3) {
    return unitLines.join("\n").slice(0, maxChars);
  }

  const lower = rawText.toLowerCase();
  const markers = ["table of contents", "contents", "syllabus", "units", "chapters"];
  let markerIndex = -1;
  for (const marker of markers) {
    const idx = lower.indexOf(marker);
    if (idx !== -1 && (markerIndex === -1 || idx < markerIndex)) {
      markerIndex = idx;
    }
  }
  if (markerIndex !== -1) {
    return rawText.slice(markerIndex, markerIndex + maxChars);
  }

  return rawText.slice(0, maxChars);
}

function filterOutlineBySourceText(sourceText: string, outline: AISubjectOutlineChapter[], unitsOnly = false) {
  const haystackMatch = normalizeForMatch(sourceText);
  const haystackLower = sourceText.toLowerCase();

  return outline
    .map((chapter) => {
      const titleLower = chapter.title.toLowerCase();
      const titleNorm = normalizeForMatch(chapter.title);
      
      // Strict match in normalized haystack
      let titleOk = titleNorm.length > 2 && haystackMatch.includes(titleNorm);
      
      // Fuzzy match in lower source
      if (!titleOk && unitsOnly && titleNorm.length > 5) {
        titleOk = haystackLower.includes(titleLower) || getSimilarity(chapter.title, sourceText) > 0.3; // Very loose for units
      }
      
      if (!titleOk) {
        console.log(`[AI Filter] Rejecting title: "${chapter.title}" (Norm: "${titleNorm}") - Not found in source.`);
      }

      const topics = (chapter.topics || []).filter((topic) => {
        const topicLower = topic.toLowerCase();
        const topicNorm = normalizeForMatch(topic);
        const ok = topicNorm.length > 2 && (haystackMatch.includes(topicNorm) || haystackLower.includes(topicLower));
        if (!ok) console.log(`[AI Filter] Rejecting topic: "${topic}" in "${chapter.title}"`);
        return ok;
      });

      return titleOk ? { ...chapter, topics } : null;
    })
    .filter((row): row is AISubjectOutlineChapter => Boolean(row));
}

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
  const result = await requestGeminiContent(apiKey, model || "gemini-1.5-flash", prompt, 1500, false);
  if (keyId) {
    if (result.ok) {
      const settings = getAISettings();
      const currentEntry = settings.keyPool.find(k => k.id === keyId);
      updateKeyStatus(keyId, {
        usageCount: (currentEntry?.usageCount || 0) + 1,
        lastUsed: new Date().toISOString(),
        isExhausted: false,
        lastError: undefined,
      });
    } else if (result.status === 429) {
      updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Quota Exceeded", lastError: "Rate Limited" });
    } else if (result.status === 401 || result.status === 403) {
      updateKeyStatus(keyId, { lastError: "Invalid Key (401/403)" });
    } else if (result.status === 404) {
      updateKeyStatus(keyId, { lastError: `Model not found (${result.model || "unknown"})` });
    } else if (result.status) {
      updateKeyStatus(keyId, { lastError: `HTTP ${result.status}` });
    }
  }

  if (!result.ok) {
    throw new Error(`Gemini error: HTTP ${result.status || 0}`);
  }

  const text = result.content;
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
  const result = await requestProviderContent(provider, settings, keyEntry, {
    prompt,
    maxTokens: 1500,
    temperature: 0.3,
    forceJson: true,
  });
  applyProviderResultStatus(keyEntry, result);
  if (!result.ok) {
    throw new Error(`Provider request failed (${result.status || 0}).`);
  }
  const parsed = extractJsonObject(result.content) as { questions?: AIGeneratedQuestion[] };
  return parsed.questions || [];
}

const PROVIDER_KEY_FIELD_MAP: Partial<Record<AIProvider, keyof AISettings>> = {
  groq: "groqApiKey",
  gemini: "geminiApiKey",
  deepseek: "deepseekApiKey",
  qwen: "qwenApiKey",
  siliconflow: "siliconflowApiKey",
  openrouter: "openrouterApiKey",
  together: "togetherApiKey",
  openai: "openaiApiKey",
  anthropic: "anthropicApiKey",
};

function buildRuntimeKeyChain(settings: AISettings, providerPriority: AIProvider[]) {
  const pool = Array.isArray(settings.keyPool) ? settings.keyPool : [];
  const priorityProviders = Array.from(new Set([...providerPriority, settings.provider]));

  const seededFromProviderFields: AIKeyEntry[] = priorityProviders
    .map((provider) => {
      const fieldName = PROVIDER_KEY_FIELD_MAP[provider];
      if (!fieldName) return null;
      const key = String(settings[fieldName] || "").trim();
      if (!key) return null;
      const existsInPool = pool.some(
        (entry) => entry.provider === provider && String(entry.key || "").trim() === key,
      );
      if (existsInPool) return null;
      return {
        id: `field-${provider}`,
        provider,
        key,
        label: `${provider} Primary`,
        usageCount: 0,
        isExhausted: false,
        model: provider === settings.provider ? settings.model : "",
      } as AIKeyEntry;
    })
    .filter((entry): entry is AIKeyEntry => Boolean(entry));

  const combined = [...pool, ...seededFromProviderFields].filter((entry) => String(entry.key || "").trim());
  const usable = combined.filter((entry) => !entry.isExhausted);
  const candidate = usable.length ? usable : combined;

  return candidate.sort((a, b) => {
    if (settings.activeKeyId) {
      if (a.id === settings.activeKeyId && b.id !== settings.activeKeyId) return -1;
      if (a.id !== settings.activeKeyId && b.id === settings.activeKeyId) return 1;
    }
    if (a.provider === settings.provider && b.provider !== settings.provider) return -1;
    if (a.provider !== settings.provider && b.provider === settings.provider) return 1;
    const aIdx = providerPriority.indexOf(a.provider);
    const bIdx = providerPriority.indexOf(b.provider);
    const aRank = aIdx === -1 ? 999 : aIdx;
    const bRank = bIdx === -1 ? 999 : bIdx;
    return aRank - bRank;
  });
}

async function tryClientSideProviders(input: AIInput): Promise<AIGeneratedQuestion[] | null> {
  const settings = getAISettings();
  const prompt = buildPrompt(input);

  const providerPriority: AIProvider[] = [
    "groq", "gemini", "deepseek", "qwen", "siliconflow", "openrouter", "together", "openai", "anthropic"
  ];
  const keyChain = buildRuntimeKeyChain(settings, providerPriority);

  if (!keyChain.length) return null;

  for (const keyEntry of keyChain) {
    try {
      if (keyEntry.provider !== settings.provider) {
        console.log(`[AI] Primary ${settings.provider} failed or skipped, falling back to ${keyEntry.provider} (Key: ${keyEntry.label || keyEntry.id})`);
      }
      return await callProvider(keyEntry.provider, settings, prompt, keyEntry);
    } catch (err) {
      console.warn(`[AI] Key ${keyEntry.label || keyEntry.id} (${keyEntry.provider}) failed:`, err);
      const settings = getAISettings();
      const current = settings.keyPool.find(k => k.id === keyEntry.id);
      if (!current?.isExhausted) {
        updateKeyStatus(keyEntry.id, {
          quotaRemaining: "Failed (check key)",
          lastUsed: new Date().toISOString(),
          isExhausted: false
        });
      }
    }
  }

  return null;
}

async function trySupabaseFunction(input: AIInput): Promise<AIGeneratedQuestion[] | null> {
  if (!canUseSupabase()) {
    return null;
  }

  const pdfBase64 = await toBase64(input.file);
  const { data, error } = await supabase!.functions.invoke("ai-generate-questions", {
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

type AIChunkArtifactInput = {
  artifact: ArtifactType;
  contextText: string;
  contextLabel?: string;
  count?: number;
  questionType?: QuestionType;
  difficulty?: Difficulty;
  bloomLevel?: BloomLevel | "";
  instructions?: string;
};

const geminiModelCache = new Map<string, string[]>();
const geminiBadModelCache = new Map<string, Set<string>>();

function uniqStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeGeminiModelName(value: string) {
  const clean = String(value || "").trim();
  if (!clean) return "";
  return clean.replace(/^models\//i, "");
}

function preferredGeminiModelVariants(preferred: string) {
  const clean = normalizeGeminiModelName(preferred);
  if (!clean) return [] as string[];
  return uniqStrings([
    clean,
    clean.endsWith("-latest") ? clean.replace(/-latest$/i, "") : `${clean}-latest`,
  ]);
}

async function discoverGeminiModels(apiKey: string) {
  const cached = geminiModelCache.get(apiKey);
  if (cached?.length) {
    return cached;
  }
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!response.ok) {
      return [] as string[];
    }
    const data = await response.json();
    const models = Array.isArray(data?.models) ? data.models : [];
    const discovered = models
      .filter((row: any) => {
        const methods = Array.isArray(row?.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
        return methods.includes("generateContent") && String(row?.name || "").toLowerCase().includes("gemini");
      })
      .map((row: any) => normalizeGeminiModelName(String(row?.name || "")))
      .filter(Boolean);
    const uniqueDiscovered = uniqStrings(discovered);
    geminiModelCache.set(apiKey, uniqueDiscovered);
    return uniqueDiscovered;
  } catch {
    return [] as string[];
  }
}

async function buildGeminiModelCandidates(apiKey: string, preferredModel: string) {
  const discovered = await discoverGeminiModels(apiKey);
  const bad = geminiBadModelCache.get(apiKey) || new Set<string>();
  const fallback = [
    "gemini-1.5-flash",
    "gemini-1.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
  ];
  return uniqStrings([
    ...discovered,
    ...preferredGeminiModelVariants(preferredModel),
    ...fallback,
  ]).filter((model) => !bad.has(model));
}

type GeminiRequestResult = {
  ok: boolean;
  status: number;
  content: string;
  model: string;
};

type ProviderRequestResult = {
  ok: boolean;
  status: number;
  content: string;
  model: string;
  errorText?: string;
};

type ProviderRequestInput = {
  prompt?: string;
  messages?: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  forceJson?: boolean;
  debug?: boolean;
};

const OPENAI_COMPATIBLE_ENDPOINTS: Partial<Record<AIProvider, string>> = {
  groq: "https://api.groq.com/openai/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  deepseek: "https://api.deepseek.com/v1/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
  together: "https://api.together.xyz/v1/chat/completions",
};

const PROVIDER_MODEL_DEFAULTS: Record<AIProvider, string[]> = {
  groq: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
  gemini: ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-flash-latest"],
  openrouter: ["meta-llama/llama-3.3-70b-instruct:free", "google/gemma-2-9b-it:free"],
  together: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo"],
  openai: ["gpt-4o-mini", "gpt-4.1-mini"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  qwen: ["qwen-plus", "qwen-turbo"],
  siliconflow: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-7B-Instruct"],
  anthropic: ["claude-3-5-sonnet-20240620", "claude-3-5-haiku-20241022"],
  supabase: ["ai-generate-questions"],
};

function normalizeMessages(request: ProviderRequestInput) {
  if (Array.isArray(request.messages) && request.messages.length) {
    return request.messages
      .filter((row) => row && row.content?.trim())
      .map((row) => ({ role: row.role, content: row.content.trim() }));
  }
  return [{ role: "user" as const, content: String(request.prompt || "").trim() }];
}

function flattenMessages(messages: Array<{ role: "system" | "user" | "assistant"; content: string }>) {
  return messages.map((row) => `${row.role.toUpperCase()}: ${row.content}`).join("\n\n");
}

function buildProviderModelCandidates(provider: AIProvider, settings: AISettings, keyEntry: AIKeyEntry) {
  return uniqStrings([
    (keyEntry.model || "").trim(),
    keyEntry.provider === settings.provider ? (settings.model || "").trim() : "",
    ...(PROVIDER_MODEL_DEFAULTS[provider] || []),
  ]);
}

function shouldTryNextModel(status: number, errorText: string) {
  if ([400, 404, 422].includes(status)) return true;
  const lower = (errorText || "").toLowerCase();
  return (
    lower.includes("model") &&
    (
      lower.includes("not found") ||
      lower.includes("does not exist") ||
      lower.includes("unknown") ||
      lower.includes("unsupported") ||
      lower.includes("invalid") ||
      lower.includes("unavailable")
    )
  );
}

function parseOpenAIContent(data: any) {
  const raw = data?.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .map((part: any) => (typeof part?.text === "string" ? part.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function requestOpenAICompatibleContent(
  provider: AIProvider,
  apiKey: string,
  models: string[],
  request: ProviderRequestInput,
): Promise<ProviderRequestResult> {
  const url = OPENAI_COMPATIBLE_ENDPOINTS[provider];
  if (!url) {
    return { ok: false, status: 0, content: "", model: "", errorText: `Unsupported provider: ${provider}` };
  }
  const messages = normalizeMessages(request);
  const maxTokens = request.maxTokens ?? 1500;
  const temperature = request.temperature ?? 0.1;

  let finalStatus = 0;
  let finalModel = models[0] || "";
  let finalError = "";

  for (const model of models) {
    finalModel = model;
    
    const retryCount = 1; // Only 1 retry for OpenAI-compatible to keep it snappy, but handles 429
    for (let i = 0; i < retryCount + 1; i += 1) {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...(provider === "openrouter" ? { "HTTP-Referer": window.location.origin, "X-Title": "Paper Generator" } : {}),
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
          response_format: request.forceJson && (provider === "openai" || provider === "openrouter") ? { type: "json_object" } : undefined,
        }),
      });

      finalStatus = response.status;
      if (response.ok) {
        const data = await response.json();
        const content = parseOpenAIContent(data);
        return { ok: true, status: response.status, content, model };
      }

      const errorText = await response.text();
      finalError = errorText;

      if (response.status === 429 || response.status === 503) {
        if (i < retryCount) {
          const waitTime = Math.pow(2, i + 1) * 2000 + Math.random() * 1000;
          await sleep(waitTime);
          continue;
        }
      }

      if (!shouldTryNextModel(response.status, errorText)) {
        if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 413) {
          break;
        }
      }
      break; 
    }
  }

  return { ok: false, status: finalStatus, content: "", model: finalModel, errorText: finalError };
}

async function requestAnthropicContent(
  apiKey: string,
  models: string[],
  request: ProviderRequestInput,
): Promise<ProviderRequestResult> {
  const allMessages = normalizeMessages(request);
  const system = allMessages
    .filter((row) => row.role === "system")
    .map((row) => row.content)
    .join("\n\n")
    .trim();
  const messages = allMessages
    .filter((row) => row.role !== "system")
    .map((row) => ({ role: row.role === "assistant" ? "assistant" : "user", content: row.content }));
  const maxTokens = request.maxTokens ?? 1500;

  let finalStatus = 0;
  let finalModel = models[0] || "";
  let finalError = "";

  for (const model of models) {
    finalModel = model;
    
    const retryCount = 3;
    for (let i = 0; i < retryCount; i += 1) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "dangerously-allow-browser": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          ...(system ? { system } : {}),
          messages,
        }),
      });

      finalStatus = response.status;
      if (response.ok) {
        const data = await response.json();
        const content = Array.isArray(data?.content)
          ? data.content
              .map((item: any) => (item?.type === "text" ? String(item?.text || "") : ""))
              .filter(Boolean)
              .join("\n")
          : "";
        return { ok: true, status: response.status, content, model };
      }

      const errorText = await response.text();
      finalError = errorText;

      if (response.status === 429 || response.status === 503) {
        if (i < retryCount - 1) {
          const waitTime = Math.pow(2, i + 1) * 2000 + Math.random() * 1000;
          await sleep(waitTime);
          continue;
        }
      }

      if (!shouldTryNextModel(response.status, errorText)) {
        if (response.status === 401 || response.status === 403 || response.status === 429 || response.status === 413) {
          break;
        }
      }
      break; 
    }
  }

  return { ok: false, status: finalStatus, content: "", model: finalModel, errorText: finalError };
}

async function requestProviderContent(
  provider: AIProvider,
  settings: AISettings,
  keyEntry: AIKeyEntry,
  request: ProviderRequestInput,
): Promise<ProviderRequestResult> {
  const apiKey = (keyEntry.key || "").trim();
  if (!apiKey) {
    return { ok: false, status: 0, content: "", model: "", errorText: "Missing API key" };
  }

  const models = buildProviderModelCandidates(provider, settings, keyEntry);
  if (!models.length) {
    return { ok: false, status: 0, content: "", model: "", errorText: "No model configured" };
  }

  if (provider === "gemini") {
    const prompt = request.prompt || flattenMessages(normalizeMessages(request));
    const result = await requestGeminiContent(
      apiKey,
      models[0] || "gemini-1.5-flash",
      prompt,
      request.maxTokens ?? 1500,
      Boolean(request.debug),
      Boolean(request.forceJson),
    );
    return { ...result };
  }

  if (provider === "anthropic") {
    return requestAnthropicContent(apiKey, models, request);
  }

  if (OPENAI_COMPATIBLE_ENDPOINTS[provider]) {
    return requestOpenAICompatibleContent(provider, apiKey, models, request);
  }

  return { ok: false, status: 0, content: "", model: "", errorText: `Provider ${provider} is not supported` };
}

function applyProviderResultStatus(keyEntry: AIKeyEntry, result: ProviderRequestResult) {
  const keyId = keyEntry.id;
  if (result.ok) {
    updateKeyStatus(keyId, {
      usageCount: (keyEntry.usageCount || 0) + 1,
      lastUsed: new Date().toISOString(),
      lastError: undefined,
      isExhausted: false,
    });
    return;
  }

  if (result.status === 429) {
    updateKeyStatus(keyId, { isExhausted: true, quotaRemaining: "Rate Limited", lastError: "Rate Limited" });
  } else if (result.status === 401 || result.status === 403) {
    updateKeyStatus(keyId, { lastError: "Invalid Key (401/403)" });
  } else if (result.status === 404 || shouldTryNextModel(result.status, result.errorText || "")) {
    updateKeyStatus(keyId, { lastError: `Model not found (${result.model || "unknown"})` });
  } else if (result.status === 413) {
    updateKeyStatus(keyId, { lastError: "Request too large" });
  } else if (result.status) {
    updateKeyStatus(keyId, { lastError: `HTTP ${result.status}` });
  }
}

async function requestGeminiContent(
  apiKey: string,
  preferredModel: string,
  prompt: string,
  maxOutputTokens: number,
  debug = false,
  forceJson = false,
): Promise<GeminiRequestResult> {
  const modelCandidates = await buildGeminiModelCandidates(apiKey, preferredModel);
  let finalStatus = 0;
  let finalModel = "";

  const callUrl = async (url: string) => {
    if (debug) {
      console.log(`[AI Request] Gemini URL: ${url.replace(apiKey, "REDACTED")}`);
    }
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens,
          ...(forceJson ? { response_mime_type: "application/json", responseMimeType: "application/json" } : {}),
        },
      }),
    });
  };

  for (const candidate of modelCandidates) {
    finalModel = candidate;
    const v1betaUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`;
    const v1Url = `https://generativelanguage.googleapis.com/v1/models/${candidate}:generateContent?key=${apiKey}`;

    const retryCount = 3;
    for (let i = 0; i < retryCount; i += 1) {
      let response = await callUrl(v1betaUrl);
      finalStatus = response.status;

      if (!response.ok && response.status === 404) {
        response = await callUrl(v1Url);
        finalStatus = response.status;
      }

      if (response.ok) {
        const data = await response.json();
        return {
          ok: true,
          status: response.status,
          content: data?.candidates?.[0]?.content?.parts?.[0]?.text || "",
          model: candidate,
        };
      }

      // Handle Rate Limits / Downtime with Exponential Backoff
      if (response.status === 429 || response.status === 503) {
        if (i < retryCount - 1) {
          const waitTime = Math.pow(2, i + 1) * 1500 + Math.random() * 1000;
          if (debug) console.warn(`[AI Gemini] ${response.status} detected. Retrying in ${Math.round(waitTime)}ms... (Attempt ${i + 1}/${retryCount})`);
          await sleep(waitTime);
          continue;
        }
        break; // Max retries hit or fatal error
      }

      if (response.status === 401 || response.status === 403) {
        break;
      }
      
      // If it's another error (like 500 or unknown 4xx), don't retry here, try next model candidate
      break; 
    }
  }

  return { ok: false, status: finalStatus, content: "", model: finalModel };
}

function sanitizeJsonText(value: string) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/```json|```/gi, "")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim();
}

function extractFirstBalancedObject(text: string) {
  const input = String(text || "");
  let start = -1;
  let curly = 0;
  let square = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (start === -1) start = i;
      curly += 1;
      continue;
    }
    if (ch === "}") {
      curly -= 1;
      if (start !== -1 && curly === 0 && square === 0) {
        return input.slice(start, i + 1);
      }
      continue;
    }
    if (start !== -1 && ch === "[") {
      square += 1;
      continue;
    }
    if (start !== -1 && ch === "]") {
      square -= 1;
      continue;
    }
  }
  return "";
}

function tryParseJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function extractJsonObject(raw: string) {
  const cleaned = sanitizeJsonText(raw);
  const balanced = extractFirstBalancedObject(cleaned);
  if (!balanced) {
    throw new Error("Model response did not include JSON.");
  }

  const direct = tryParseJson(balanced);
  if (direct !== null) return direct;

  const noComments = balanced
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const commentParsed = tryParseJson(noComments);
  if (commentParsed !== null) return commentParsed;

  const commaFix = noComments
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/"\s*\n\s*"/g, "\",\n\"");
  const commaParsed = tryParseJson(commaFix);
  if (commaParsed !== null) return commaParsed;

  throw new Error("Model response did not include valid JSON.");
}

async function requestJsonFromProvider(
  provider: AIProvider,
  settings: AISettings,
  prompt: string,
  keyEntry: AIKeyEntry,
  options?: { maxTokens?: number }
) {
  if (!(keyEntry.key || "").trim()) {
    throw new Error("Missing API key.");
  }
  let currentResult = await requestProviderContent(provider, settings, keyEntry, {
    prompt,
    maxTokens: options?.maxTokens ?? 1800,
    temperature: 0.1,
    forceJson: true,
  });

  // Handle 429 Rate Limits with basic backoff
  if (!currentResult.ok && currentResult.status === 429) {
    await delay(1500); // 1.5s wait
    currentResult = await requestProviderContent(provider, settings, keyEntry, {
      prompt,
      maxTokens: options?.maxTokens ?? 1800,
      temperature: 0.1,
      forceJson: true,
    });
    if (!currentResult.ok && currentResult.status === 429) {
      await delay(3000); // 3s wait
      currentResult = await requestProviderContent(provider, settings, keyEntry, {
        prompt,
        maxTokens: options?.maxTokens ?? 1800,
        temperature: 0.1,
        forceJson: true,
      });
    }
  }

  applyProviderResultStatus(keyEntry, currentResult);

  if (!currentResult.ok) {
    if (provider === "gemini" && currentResult.status === 404) {
      throw new Error("Gemini model not available for this key/project. Try another provider or update model in Settings.");
    }
    const err = new Error(`Provider request failed (${currentResult.status || 0}).`) as Error & { status?: number };
    err.status = currentResult.status || 0;
    throw err;
  }

  if (!currentResult.content) {
    throw new Error("Provider returned empty response.");
  }
  try {
    return extractJsonObject(currentResult.content);
  } catch {
    updateKeyStatus(keyEntry.id, { lastError: "Non-JSON response" });
    const retryPrompt = `${prompt}

IMPORTANT:
- Return ONLY one valid JSON object.
- No markdown, no prose, no code fences.`;
    const retry = await requestProviderContent(provider, settings, keyEntry, {
      prompt: retryPrompt,
      maxTokens: options?.maxTokens ?? 1800,
      temperature: 0,
      forceJson: true,
    });
    applyProviderResultStatus(keyEntry, retry);
    if (!retry.ok || !retry.content) {
      throw new Error(`Provider returned non-JSON output and retry failed (${retry.status || 0}).`);
    }
    try {
      return extractJsonObject(retry.content);
    } catch {
      const repairPrompt = `Fix the following invalid JSON and return ONLY corrected JSON.

INVALID JSON:
${retry.content}`;
      const repair = await requestProviderContent(provider, settings, keyEntry, {
        prompt: repairPrompt,
        maxTokens: options?.maxTokens ?? 1800,
        temperature: 0,
        forceJson: true,
      });
      applyProviderResultStatus(keyEntry, repair);
      if (!repair.ok || !repair.content) {
        throw new Error(`Provider JSON repair failed (${repair.status || 0}).`);
      }
      return extractJsonObject(repair.content);
    }
  }
}

function normalizeQuestionCandidates(json: any, input: AIChunkArtifactInput) {
  const rows = Array.isArray(json?.questions) ? json.questions : [];
  const targetType = input.questionType || "mcq";
  const difficulty = input.difficulty || "medium";
  const bloom = input.bloomLevel || "understand";

  const mapped = rows
    .filter((row: any) => row && typeof row === "object")
    .map((row: any) => {
      const options = Array.isArray(row.options) ? row.options.map((x: unknown) => String(x || "").trim()).filter(Boolean) : [];
      return {
        question_type: String(row.question_type || targetType || "mcq").toLowerCase(),
        question_text: String(row.question_text || row.prompt || "").trim(),
        options: options.length ? options : undefined,
        correct_answer: String(row.correct_answer || row.answer_key || "").trim(),
        explanation: String(row.explanation || "").trim(),
        difficulty: String(row.difficulty || difficulty).toLowerCase(),
        bloom_level: String(row.bloom_level || bloom).toLowerCase(),
        marks: Number(row.marks) > 0 ? Number(row.marks) : undefined,
      };
    })
    .filter((row: { question_text: string }) => row.question_text);

  return mapped;
}

function normalizeWorksheetCandidate(json: any) {
  const worksheet = json?.worksheet && typeof json.worksheet === "object" ? json.worksheet : json;
  const items = Array.isArray(worksheet?.items) ? worksheet.items : [];
  return {
    title: String(worksheet?.title || "AI Worksheet").trim(),
    items: items
      .filter((row: any) => row && typeof row === "object")
      .map((row: any, index: number) => ({
        order_no: Number(row.order_no) > 0 ? Number(row.order_no) : index + 1,
        item_type: String(row.item_type || row.type || "short").trim(),
        prompt: String(row.prompt || row.question_text || "").trim(),
        options: Array.isArray(row.options) ? row.options : null,
        answer_key: String(row.answer_key || row.correct_answer || "").trim() || null,
        marks: Number(row.marks) > 0 ? Number(row.marks) : null,
        bloom_level: String(row.bloom_level || "").trim() || null,
        difficulty: String(row.difficulty || "").trim() || null,
      }))
      .filter((row: any) => row.prompt),
  };
}

function normalizeLessonPlanCandidate(json: any) {
  const lesson = json?.lesson_plan && typeof json.lesson_plan === "object" ? json.lesson_plan : json;
  const blocks = Array.isArray(lesson?.blocks) ? lesson.blocks : [];
  return {
    title: String(lesson?.title || "AI Lesson Plan").trim(),
    duration_minutes: Number(lesson?.duration_minutes) > 0 ? Number(lesson.duration_minutes) : 40,
    objectives: Array.isArray(lesson?.objectives) ? lesson.objectives : [],
    blocks: blocks
      .filter((row: any) => row && typeof row === "object")
      .map((row: any, index: number) => ({
        order_no: Number(row.order_no) > 0 ? Number(row.order_no) : index + 1,
        block_type: String(row.block_type || row.type || "instruction").trim(),
        duration_minutes: Number(row.duration_minutes) > 0 ? Number(row.duration_minutes) : null,
        content: String(row.content || row.prompt || "").trim(),
        resources: Array.isArray(row.resources) ? row.resources : [],
      }))
      .filter((row: any) => row.content),
  };
}

function buildArtifactPrompt(input: AIChunkArtifactInput) {
  const context = (input.contextText || "").trim().slice(0, 24000);
  const contextLabel = input.contextLabel || "Selected chapter/topic";
  const instructions = input.instructions?.trim() ? `Additional instructions: ${input.instructions}` : "Additional instructions: none";

  if (input.artifact === "question") {
    return `You are an exam content generator. Use ONLY the provided source text.
Context: ${contextLabel}
Question count: ${input.count || 10}
Question type: ${input.questionType || "mcq"}
Difficulty: ${input.difficulty || "medium"}
Bloom level: ${input.bloomLevel || "understand"}
${instructions}

Return STRICT JSON only:
{"questions":[{"question_type":"mcq","question_text":"...","options":["...","...","...","..."],"correct_answer":"A","explanation":"...","difficulty":"easy|medium|hard","bloom_level":"remember|understand|apply|analyze|evaluate","marks":1}]}

Rules:
- Use only facts from source text.
- Do not invent chapter names or facts.
- For non-mcq types, options may be omitted.
- Keep language classroom-friendly.
- Do NOT create questions from boilerplate/meta lines such as: "learning outcomes", "you will be able to", instructions, activities, or teacher notes.
- Prefer core concept/content questions from across different parts of the source.

Source text:
"""${context}"""`;
  }

  if (input.artifact === "worksheet") {
    return `You are a worksheet generator. Use ONLY the provided source text.
Context: ${contextLabel}
Item count target: ${input.count || 10}
Difficulty: ${input.difficulty || "medium"}
Bloom level: ${input.bloomLevel || "understand"}
${instructions}

Return STRICT JSON only:
{"worksheet":{"title":"...","items":[{"order_no":1,"item_type":"short","prompt":"...","answer_key":"...","marks":2,"difficulty":"easy","bloom_level":"understand"}]}}

Rules:
- Use only source text facts.
- Include varied item types where suitable.
- Keep prompts age-appropriate.

Source text:
"""${context}"""`;
  }

  return `You are a lesson planner. Use ONLY the provided source text.
Context: ${contextLabel}
${instructions}

Return STRICT JSON only:
{"lesson_plan":{"title":"...","duration_minutes":40,"objectives":["..."],"blocks":[{"order_no":1,"block_type":"warmup","duration_minutes":5,"content":"...","resources":[]}]}}

Rules:
- Use only source text facts.
- 3-5 lesson blocks.
- Keep objectives measurable and specific.

Source text:
"""${context}"""`;
}

export async function generateArtifactCandidatesFromText(input: AIChunkArtifactInput): Promise<Record<string, unknown>[]> {
  const settings = getAISettings();
  const providerPriority: AIProvider[] = [
    "groq",
    "gemini",
    "deepseek",
    "qwen",
    "siliconflow",
    "openrouter",
    "together",
    "openai",
    "anthropic",
  ];

  const keyChain = buildRuntimeKeyChain(settings, providerPriority);

  if (!keyChain.length) {
    throw new Error("No AI keys configured. Add a provider key in Settings.");
  }

  const normalizeQuestionKey = (row: Record<string, unknown>) =>
    String(row.question_text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  if (input.artifact === "question") {
    const targetCount = Math.max(1, Math.min(Number(input.count || 10), 50));
    const questionMap = new Map<string, Record<string, unknown>>();
    const blockedKeyIds = new Set<string>();
    let lastError = "All providers failed.";
    const maxPasses = 6;

    for (let pass = 0; pass < maxPasses && questionMap.size < targetCount; pass += 1) {
      const runKeys = keyChain.filter((entry) => !blockedKeyIds.has(entry.id));
      if (!runKeys.length) {
        break;
      }
      const remaining = targetCount - questionMap.size;
      const existing = Array.from(questionMap.values())
        .slice(0, 12)
        .map((row) => String(row.question_text || "").trim())
        .filter(Boolean)
        .join("\n- ");
      const extraInstructions = [
        input.instructions?.trim() || "",
        `Return exactly ${remaining} unique questions in this pass.`,
        existing ? `Avoid duplicates of these already accepted questions:\n- ${existing}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const passInput: AIChunkArtifactInput = {
        ...input,
        count: remaining,
        instructions: extraInstructions,
      };
      const prompt = buildArtifactPrompt(passInput);
      const passMaxTokens = Math.min(4096, 1000 + remaining * (passInput.questionType === "mcq" ? 240 : 180));

      let addedThisPass = 0;
      for (const keyEntry of runKeys) {
        try {
          const json = await requestJsonFromProvider(keyEntry.provider, settings, prompt, keyEntry, {
            maxTokens: passMaxTokens,
          });
          const questions = normalizeQuestionCandidates(json, passInput);
          if (!questions.length) throw new Error("No questions returned.");

          const before = questionMap.size;
          for (const row of questions) {
            const key = normalizeQuestionKey(row);
            if (!key || questionMap.has(key)) continue;
            questionMap.set(key, row as Record<string, unknown>);
          }
          addedThisPass = questionMap.size - before;
          if (questionMap.size >= targetCount) break;
          if (addedThisPass > 0) break;
        } catch (error) {
          const errStatus =
            typeof (error as { status?: unknown })?.status === "number"
              ? Number((error as { status?: unknown }).status)
              : 0;
          if (errStatus === 429 || errStatus === 401 || errStatus === 403) {
            blockedKeyIds.add(keyEntry.id);
          }
          lastError = error instanceof Error ? error.message : "Provider failed.";
          console.warn(`[AI Artifact] Provider ${keyEntry.provider} (${keyEntry.id}) failed:`, error);
        }
      }

      if (addedThisPass === 0) {
        break;
      }
    }

    const out = Array.from(questionMap.values()).slice(0, targetCount);
    if (!out.length) {
      throw new Error("No questions returned.");
    }
    if (out.length < targetCount) {
      console.warn(`[AI Artifact] Requested ${targetCount} questions, generated ${out.length}.`);
    }
    return out;
  }

  const prompt = buildArtifactPrompt(input);
  let lastError = "All providers failed.";
  for (const keyEntry of keyChain) {
    try {
      const json = await requestJsonFromProvider(keyEntry.provider, settings, prompt, keyEntry);
      if (input.artifact === "worksheet") {
        const worksheet = normalizeWorksheetCandidate(json);
        if (!worksheet.items.length) throw new Error("Worksheet has no items.");
        return [worksheet];
      }
      const lessonPlan = normalizeLessonPlanCandidate(json);
      if (!lessonPlan.blocks.length) throw new Error("Lesson plan has no blocks.");
      return [lessonPlan];
    } catch (error) {
      lastError = error instanceof Error ? error.message : "Provider failed.";
      console.warn(`[AI Artifact] Provider ${keyEntry.provider} (${keyEntry.id}) failed:`, error);
    }
  }

  throw new Error(lastError || "Failed to generate content from source text.");
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

  const keyChain = buildRuntimeKeyChain(settings, providerPriority);

  for (const keyEntry of keyChain) {
    try {
      const result = await requestProviderContent(keyEntry.provider, settings, keyEntry, {
        prompt,
        maxTokens: 1500,
        temperature: 0.1,
        forceJson: true,
      });
      applyProviderResultStatus(keyEntry, result);
      if (result.ok && result.content) {
        const parsed = extractJsonObject(result.content);
        if (Array.isArray(parsed?.chapters)) {
          return parsed.chapters.map((value: unknown) => String(value || "").trim()).filter(Boolean);
        }
      }
    } catch (err) {
      console.warn(`[AI Syllabus] Provider ${keyEntry.provider} (Key ${keyEntry.id}) failed:`, err);
    }
  }

  return ["Chapter 1: Introduction", "Chapter 2: Fundamental Concepts", "Chapter 3: Advanced Topics"];
}

function parseOutline(raw: string): AISubjectOutlineChapter[] | null {
  let parsed: any = null;
  try {
    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace < firstBrace) {
      throw new Error("No JSON object found");
    }
    const jsonStr = raw.slice(firstBrace, lastBrace + 1);
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    console.log("[AI Parser] JSON extraction/parse failed, falling back to loose text:", e);
    return parseOutlineFromLooseText(raw);
  }
  
  // Resiliently find the chapter list
  let chapters: any[] | null = null;
  if (Array.isArray(parsed)) {
    chapters = parsed;
  } else if (Array.isArray(parsed?.chapters)) {
    chapters = parsed.chapters;
  } else if (Array.isArray(parsed?.outline)) {
    chapters = parsed.outline;
  } else if (parsed && typeof parsed === 'object') {
    // If it's an object with one key that is an array, use it
    const keys = Object.keys(parsed);
    if (keys.length === 1 && Array.isArray(parsed[keys[0]])) {
      chapters = parsed[keys[0]];
    }
  }

  if (!chapters) {
    console.log("[AI Parser] Could not find chapters array in JSON. Raw:", raw.slice(0, 200));
    return parseOutlineFromLooseText(raw);
  }

  const mapped = chapters
    .map((entry: any) => {
      const title = String(entry?.title || (typeof entry === 'string' ? entry : "")).trim();
      return {
        title,
        topics: Array.isArray(entry?.topics) ? entry.topics.map((t: any) => String(t || "").trim()).filter(Boolean) : [],
      };
    })
    .filter((row: AISubjectOutlineChapter) => row.title.length > 0);
    
  console.log(`[AI Parser] Successfully parsed ${mapped.length} chapters.`);
  return mapped.length ? mapped : null;
}

export async function generateSubjectOutlineFromText(input: {
  examBody: string;
  className: string;
  subjectName: string;
  text: string;
  instructions?: string;
  unitsOnly?: boolean;
}): Promise<AISubjectOutlineChapter[]> {
  const settings = getAISettings();
    const rawText = input.text.trim();
    const unitsOnly = Boolean(input.unitsOnly);
    const primaryUnits = extractUnitsFromText(rawText);
    if (unitsOnly && primaryUnits.length >= 2) {
      return primaryUnits.map((title) => ({ title, topics: [] }));
    }
    const looseUnits = extractUnitsFromTextLoose(rawText);
    if (unitsOnly && looseUnits.length >= 2) {
      return looseUnits.map((title) => ({ title, topics: [] }));
    }
    const anywhereUnits = extractUnitsFromTextAnywhere(rawText);
    if (unitsOnly && anywhereUnits.length >= 2) {
      return anywhereUnits.map((title) => ({ title, topics: [] }));
    }

    const excerptLimit = unitsOnly ? 16000 : 12000;
    const excerpt = buildOutlineExcerpt(rawText, excerptLimit);
  const prompt = `You are a curriculum analyst. Based on the subject text below, extract a clean chapter outline with topics.
Exam Body: ${input.examBody}
Class: ${input.className}
Subject: ${input.subjectName}
${input.instructions ? `Special Instructions: ${input.instructions}` : ""}

Return strict JSON ONLY in this format:
{"chapters":[{"title":"Chapter Title","topics":["Topic 1","Topic 2","Topic 3"]}]}

Rules:
- No numbering in titles.
- Keep chapter titles short and standard.
  - Use only chapter names found in the source text.
  - If a chapter is not visible in the excerpt, skip it.
- Provide 3-8 topics per chapter if possible.
- Every chapter must include topics (even if generic).

Subject Text (excerpt):
"""${excerpt}"""`;
  const unitsPrompt = `You are a curriculum analyst. Based on the subject text below, extract EVERY SINGLE unit/chapter name present.
  Look specifically for a Table of Contents or a list of major headings.
  Exam Body: ${input.examBody}
  Class: ${input.className}
  Subject: ${input.subjectName}
  ${input.instructions ? `Special Instructions: ${input.instructions}` : ""}

Return strict JSON ONLY in this format:
{"chapters":[{"title":"Chapter Title","topics":[]}]}

Rules:
- Capture EVERY SINGLE unit/chapter name found in the whole document.
- In many textbooks, there are 5-15 units. Ensure you didn't miss any.
- High priority to structural headings like "Unit X", "Chapter X", "Part X".
- Titles must match the source text.
- Do NOT include numbering in the "title" field.
- If no units are found, return {"chapters":[]}.
- Use ONLY the provided excerpt. Do not invent titles.

Subject Text (excerpt [0-${excerptLimit}]):
"""${excerpt}"""`;

  const providerPriority: AIProvider[] = [
    "groq", "gemini", "deepseek", "qwen", "siliconflow", "openrouter", "together", "openai", "anthropic"
  ];

  const keyChain = buildRuntimeKeyChain(settings, providerPriority);

  if (!keyChain.length) {
    throw new Error("No AI keys configured. Add an API key in Settings > AI Provider Infrastructure.");
  }

  async function requestOutline(requestPrompt: string) {
    for (const keyEntry of keyChain) {
      if (!(keyEntry.key || "").trim()) continue;
      try {
        const result = await requestProviderContent(keyEntry.provider, settings, keyEntry, {
          prompt: requestPrompt,
          maxTokens: 1500,
          temperature: 0,
          forceJson: true,
          debug: true,
        });
        applyProviderResultStatus(keyEntry, result);
        if (result.ok && result.content) {
          console.log(`[AI Response] Provider: ${keyEntry.provider}, Content:`, result.content.slice(0, 500));
          const outline = parseOutline(result.content);
          if (outline) return outline;
        }
      } catch (err) {
        console.warn(`[AI Outline] Provider ${keyEntry.provider} (Key ${keyEntry.id}) failed:`, err);
      }
    }
    return null;
  }

  console.log(`[AI Detection] Requesting units from AI... Excerpt length: ${excerpt.length}`);
  if (unitsOnly) {
    console.log(`[AI Detection] Excerpt Start (500 chars): ${excerpt.slice(0, 500)}`);
    console.log(`[AI Detection] Excerpt End (500 chars): ${excerpt.slice(-500)}`);
  }
  const firstPass = await requestOutline(unitsOnly ? unitsPrompt : prompt);
  console.log(`[AI Detection] First Pass results:`, firstPass ? firstPass.length : "NULL");
  if (firstPass && firstPass.length > 0) {
      const filtered = filterOutlineBySourceText(rawText, firstPass!, unitsOnly);
      if (filtered.length > 0) {
        return unitsOnly ? filtered.map((ch) => ({ title: ch.title, topics: [] })) : filtered;
      }
    }
    if (!unitsOnly && firstPass && firstPass.length > 0) {
      const baseChapters = filterOutlineBySourceText(rawText, firstPass);
      if (baseChapters.length === 0) {
        console.warn("[AI Detection] Skipping topic generation because chapters did not match source text.");
      } else {
        const chapterList = baseChapters.map((ch) => ch.title).join(", ");
      const topicPrompt = `Generate topics for each chapter below.
  Chapters: ${chapterList}

Return strict JSON ONLY in this format:
{"chapters":[{"title":"Chapter Title","topics":["Topic 1","Topic 2","Topic 3"]}]}

  Rules:
  - Do not rename chapters.
  - Provide 3-8 topics per chapter.`;
        const secondPass = await requestOutline(topicPrompt);
        if (secondPass && secondPass.length > 0) {
          const filteredSecond = filterOutlineBySourceText(rawText, secondPass);
          if (filteredSecond.length > 0) {
            return filteredSecond;
          }
        }
      }
    }

  if (unitsOnly) {
    console.error(`[AI Detection] Final failure for unitsOnly mode. FirstPass Length: ${firstPass?.length}`);
    throw new Error("AI could not detect units in the document. Please ensure the PDF contains clear headings and try a different AI provider (e.g. Gemini) if Groq fails.");
  }

    const fallbackUnits = primaryUnits.length >= 2 ? primaryUnits : looseUnits.length >= 2 ? looseUnits : anywhereUnits;
    if (fallbackUnits.length >= 2) {
      return fallbackUnits.map((title) => ({ title, topics: [] }));
    }

    throw new Error("AI could not extract an outline from this PDF. Try OCR, adjust the custom prompt, or use a clearer file.");
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

  const keyChain = buildRuntimeKeyChain(settings, providerPriority);

  for (const keyEntry of keyChain) {
    try {
      const result = await requestProviderContent(keyEntry.provider, settings, keyEntry, {
        messages: messages as Array<{ role: "system" | "user" | "assistant"; content: string }>,
        maxTokens: 1600,
        temperature: 0.7,
        forceJson: true,
      });
      applyProviderResultStatus(keyEntry, result);
      if (result.ok && result.content) {
        return extractJsonObject(result.content) as DiscussionResponse;
      }
    } catch (err) {
      console.warn(`[AI Chat] Provider ${keyEntry.provider} (Key ${keyEntry.id}) failed:`, err);
    }
  }

  return { message: "All configured AI providers failed. Please check your API keys and try again." };
}

export async function refreshKeyStatus(keyEntry: AIKeyEntry) {
  const provider = keyEntry.provider;
  let url = "";
  if (!keyEntry.key) {
    updateKeyStatus(keyEntry.id, {
      quotaRemaining: "Missing key",
      lastUsed: new Date().toISOString(),
      isExhausted: false
    });
    return;
  }

  if (provider === "gemini") {
    try {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${keyEntry.key}`);
      if (resp.ok) {
        updateKeyStatus(keyEntry.id, {
          quotaRemaining: "Online (Standard)",
          lastUsed: new Date().toISOString(),
          isExhausted: false,
          lastError: undefined
        });
      } else if (resp.status === 401 || resp.status === 403) {
        updateKeyStatus(keyEntry.id, { lastError: "Invalid API Key", quotaRemaining: "Unauthorized" });
      } else {
        updateKeyStatus(keyEntry.id, { lastError: `HTTP ${resp.status}` });
      }
    } catch (e) {
      updateKeyStatus(keyEntry.id, { lastError: "Network Error" });
    }
    return;
  }

  if (provider === "anthropic") {
    try {
      const resp = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": keyEntry.key,
          "anthropic-version": "2023-06-01",
        },
      });
      if (resp.ok) {
        updateKeyStatus(keyEntry.id, {
          quotaRemaining: "Online (usage not exposed)",
          lastUsed: new Date().toISOString(),
          isExhausted: false,
          lastError: undefined,
        });
      } else if (resp.status === 401 || resp.status === 403) {
        updateKeyStatus(keyEntry.id, { lastError: "Invalid API Key", quotaRemaining: "Unauthorized" });
      } else if (resp.status === 429) {
        updateKeyStatus(keyEntry.id, { isExhausted: true, quotaRemaining: "Rate Limited", lastError: "Rate Limited" });
      } else {
        updateKeyStatus(keyEntry.id, { lastError: `HTTP ${resp.status}` });
      }
    } catch {
      updateKeyStatus(keyEntry.id, { lastError: "Network Error" });
    }
    return;
  }

  const isOpenAICompatible = ["groq", "openrouter", "together", "openai", "deepseek", "qwen", "siliconflow"].includes(provider);
  if (!isOpenAICompatible) {
    updateKeyStatus(keyEntry.id, {
      quotaRemaining: "Usage not exposed",
      lastUsed: new Date().toISOString(),
      isExhausted: false
    });
    return;
  }

  const config: Record<string, { url: string }> = {
    groq: { url: "https://api.groq.com/openai/v1/models" },
    openrouter: { url: "https://openrouter.ai/api/v1/models" },
    together: { url: "https://api.together.xyz/v1/models" },
    openai: { url: "https://api.openai.com/v1/models" },
    deepseek: { url: "https://api.deepseek.com/models" },
    qwen: { url: "https://dashscope.aliyuncs.com/compatible-mode/v1/models" },
    siliconflow: { url: "https://api.siliconflow.cn/v1/models" },
  };

  url = config[provider]?.url || "";
  if (!url) return;

  try {
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${keyEntry.key}`,
        "Content-Type": "application/json"
      }
    });

    const remaining = resp.headers.get("x-ratelimit-remaining-requests") ||
      resp.headers.get("x-ratelimit-remaining-tokens");

    if (remaining) {
      updateKeyStatus(keyEntry.id, {
        quotaRemaining: `Remaining: ${remaining}`,
        lastUsed: new Date().toISOString(),
        isExhausted: false
      });
    } else if (resp.status === 401) {
      updateKeyStatus(keyEntry.id, {
        quotaRemaining: "Unauthorized (check key)",
        lastUsed: new Date().toISOString(),
        isExhausted: false
      });
    } else if (resp.status === 200) {
      updateKeyStatus(keyEntry.id, {
        quotaRemaining: "Online (no quota header)",
        lastUsed: new Date().toISOString(),
        isExhausted: false
      });
    } else if (resp.status === 429) {
      updateKeyStatus(keyEntry.id, { isExhausted: true, quotaRemaining: "Rate Limited" });
    }
  } catch (err) {
    console.error(`[AI] Failed to refresh key ${keyEntry.id}:`, err);
  }
}

export async function testKeyConnection(keyEntry: AIKeyEntry): Promise<{ ok: boolean; error?: string }> {
  try {
    const provider = keyEntry.provider;
    const apiKey = keyEntry.key;
    if (!apiKey) return { ok: false, error: "Missing API Key" };

    if (provider === "gemini") {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
      if (resp.ok) return { ok: true };
      const data = await resp.json().catch(() => ({}));
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }

    if (provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
      });
      if (resp.ok) return { ok: true };
      const data = await resp.json().catch(() => ({}));
      return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
    }
    
    const urlMap: Record<string, string> = {
      groq: "https://api.groq.com/openai/v1/models",
      openai: "https://api.openai.com/v1/models",
      openrouter: "https://openrouter.ai/api/v1/models",
      together: "https://api.together.xyz/v1/models",
      deepseek: "https://api.deepseek.com/models",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      siliconflow: "https://api.siliconflow.cn/v1/models",
    };
    
    const url = urlMap[provider];
    if (!url) return { ok: false, error: "Provider testing not yet supported" };

    const resp = await fetch(url, {
      method: "GET",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" }
    });
    
    if (resp.ok) return { ok: true };
    const data = await resp.json().catch(() => ({}));
    return { ok: false, error: data?.error?.message || `HTTP ${resp.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Network error" };
  }
}

export async function fetchProviderModels(provider: AIProvider, apiKey: string): Promise<{ models: string[]; error?: string }> {
  const key = (apiKey || "").trim();
  if (!key) {
    return { models: [], error: "Missing API key" };
  }

  try {
    if (provider === "gemini") {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { models: [], error: data?.error?.message || `HTTP ${resp.status}` };
      }
      const data = await resp.json();
      const models = Array.isArray(data?.models) ? data.models : [];
      const ids = models
        .filter((row: any) => {
          const methods = Array.isArray(row?.supportedGenerationMethods) ? row.supportedGenerationMethods : [];
          return methods.includes("generateContent");
        })
        .map((row: any) => normalizeGeminiModelName(String(row?.name || "")))
        .filter(Boolean);
      return { models: uniqStrings(ids) };
    }

    if (provider === "anthropic") {
      const resp = await fetch("https://api.anthropic.com/v1/models", {
        method: "GET",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        return { models: [], error: data?.error?.message || `HTTP ${resp.status}` };
      }
      const data = await resp.json();
      const rows = Array.isArray(data?.data) ? data.data : [];
      const ids = rows.map((row: any) => String(row?.id || "").trim()).filter(Boolean);
      return { models: uniqStrings(ids) };
    }

    const urlMap: Partial<Record<AIProvider, string>> = {
      groq: "https://api.groq.com/openai/v1/models",
      openrouter: "https://openrouter.ai/api/v1/models",
      together: "https://api.together.xyz/v1/models",
      openai: "https://api.openai.com/v1/models",
      deepseek: "https://api.deepseek.com/models",
      qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      siliconflow: "https://api.siliconflow.cn/v1/models",
    };
    const url = urlMap[provider];
    if (!url) {
      return { models: [], error: "Model discovery not supported for this provider" };
    }

    const resp = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      return { models: [], error: data?.error?.message || `HTTP ${resp.status}` };
    }
    const data = await resp.json();
    const rows = Array.isArray(data?.data) ? data.data : [];
    const ids = rows
      .map((row: any) => String(row?.id || row?.name || "").trim())
      .filter(Boolean);
    return { models: uniqStrings(ids) };
  } catch (error) {
    return { models: [], error: error instanceof Error ? error.message : "Failed to fetch models" };
  }
}







