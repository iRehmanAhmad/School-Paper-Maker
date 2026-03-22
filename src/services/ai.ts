import { getAISettings, updateKeyStatus } from "@/services/aiSettings";
import { type AIProvider, type AISettings, type AIKeyEntry } from "@/types/ai";
import { canUseSupabase, supabase } from "@/services/supabase";
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

export type AISubjectOutlineChapter = {
  title: string;
  topics: string[];
};

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
      if (settings.activeKeyId) {
        if (a.id === settings.activeKeyId && b.id !== settings.activeKeyId) return -1;
        if (a.id !== settings.activeKeyId && b.id === settings.activeKeyId) return 1;
      }
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
      if (settings.activeKeyId) {
        if (a.id === settings.activeKeyId && b.id !== settings.activeKeyId) return -1;
        if (a.id !== settings.activeKeyId && b.id === settings.activeKeyId) return 1;
      }
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
            body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], max_tokens: 1500 }),
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

  const keyChain = [...settings.keyPool]
    .filter(k => !k.isExhausted)
    .sort((a, b) => {
      if (settings.activeKeyId) {
        if (a.id === settings.activeKeyId && b.id !== settings.activeKeyId) return -1;
        if (a.id !== settings.activeKeyId && b.id === settings.activeKeyId) return 1;
      }
      if (a.provider === settings.provider && b.provider !== settings.provider) return -1;
      if (a.provider !== settings.provider && b.provider === settings.provider) return 1;
      const aIdx = providerPriority.indexOf(a.provider);
      const bIdx = providerPriority.indexOf(b.provider);
      return aIdx - bIdx;
    });

  if (!keyChain.length) {
    throw new Error("No AI keys configured. Add an API key in Settings > AI Provider Infrastructure.");
  }

  async function requestOutline(requestPrompt: string) {
    for (const keyEntry of keyChain) {
      const provider = keyEntry.provider;
      const apiKey = (keyEntry.key || "").trim();
      const keyId = keyEntry.id;
      if (!apiKey) continue;

      try {
        let content = "";
        if (provider === "gemini") {
          let modelId = (settings.model || "gemini-1.5-flash").trim();
          if (!modelId.toLowerCase().includes("gemini")) {
            modelId = "gemini-1.5-flash";
          }
          const modelCandidates = Array.from(
            new Set([
              modelId,
              modelId.endsWith("-latest") ? modelId.replace(/-latest$/i, "") : `${modelId}-latest`,
            ])
          ).filter(Boolean);

          const tryUrl = async (url: string) => {
            console.log(`[AI Request] Gemini URL: ${url.replace(apiKey, "REDACTED")}`);
            return fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: requestPrompt }] }],
                generationConfig: { temperature: 0.0, maxOutputTokens: 1200 }
              }),
            });
          };

          let response: Response | null = null;
          for (const candidate of modelCandidates) {
            const v1betaUrl = `https://generativelanguage.googleapis.com/v1beta/models/${candidate}:generateContent?key=${apiKey}`;
            response = await tryUrl(v1betaUrl);
            if (response.ok) break;

            if (response.status === 404) {
              console.log("[AI Request] Gemini v1beta 404ed, trying v1...");
              const v1Url = `https://generativelanguage.googleapis.com/v1/models/${candidate}:generateContent?key=${apiKey}`;
              response = await tryUrl(v1Url);
              if (response.ok) break;
            }
          }

          if (response?.ok) {
            const data = await response.json();
            content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
            updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString(), lastError: undefined });
          } else if (response?.status === 429) {
            updateKeyStatus(keyEntry.id, { isExhausted: true, quotaRemaining: "Quota Exceeded", lastError: "Rate Limited" });
          } else if (response?.status === 440 || response?.status === 401 || response?.status === 403) {
            updateKeyStatus(keyEntry.id, { lastError: "Invalid Key (401/403)" });
          } else if (response) {
            updateKeyStatus(keyEntry.id, { lastError: `HTTP ${response.status}` });
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
          
          // Use provider-specific defaults if settings.model is mismatched
          let model = (settings.model || "").trim();
          if (provider === "groq" && (!model || model.includes("gemini") || model.includes("gpt"))) {
            model = "llama-3.3-70b-versatile";
          } else if (provider === "openai" && (!model || !model.startsWith("gpt"))) {
            model = "gpt-4o-mini";
          } else if (!model) {
            model = provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4o-mini";
          }
          
          console.log(`[AI Request] Provider: ${provider}, URL: ${url}, Model: ${model}`);

          if (url) {
            const resp = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              body: JSON.stringify({
                model,
                messages: [{ role: "user", content: requestPrompt }],
                temperature: 0.0,
                max_tokens: 1500,
                response_format: provider === "openai" || provider === "openrouter" ? { type: "json_object" } : undefined,
              }),
            });
            if (resp.ok) {
              const data = await resp.json();
              content = data?.choices?.[0]?.message?.content || "";
              updateKeyStatus(keyId, { usageCount: (keyEntry.usageCount || 0) + 1, lastUsed: new Date().toISOString(), lastError: undefined });
              } else {
                updateKeyStatus(keyEntry.id, { lastError: resp.status === 413 ? "Request too large" : `HTTP ${resp.status}` });
              }
            }
          }

        if (content) {
          console.log(`[AI Response] Provider: ${provider}, Content:`, content.slice(0, 500));
          const outline = parseOutline(content);
          if (outline) return outline;
        }
      } catch (err) {
        console.warn(`[AI Outline] Provider ${provider} (Key ${keyId}) failed:`, err);
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

  const keyChain = [...settings.keyPool]
    .filter(k => !k.isExhausted)
    .sort((a, b) => {
      if (settings.activeKeyId) {
        if (a.id === settings.activeKeyId && b.id !== settings.activeKeyId) return -1;
        if (a.id !== settings.activeKeyId && b.id === settings.activeKeyId) return 1;
      }
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







