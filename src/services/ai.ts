import { getAISettings } from "@/services/aiSettings";
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

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string, extraHeaders?: Record<string, string>) {
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

async function callGemini(apiKey: string, model: string, prompt: string) {
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

async function tryClientSideProviders(input: AIInput): Promise<AIGeneratedQuestion[] | null> {
  const settings = getAISettings();
  const prompt = buildPrompt(input);

  if (settings.provider === "groq" && settings.groqApiKey) {
    return callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", settings.groqApiKey, settings.model || "llama-3.3-70b-versatile", prompt);
  }

  if (settings.provider === "openrouter" && settings.openrouterApiKey) {
    return callOpenAICompatible(
      "https://openrouter.ai/api/v1/chat/completions",
      settings.openrouterApiKey,
      settings.model || "meta-llama/llama-3.3-70b-instruct:free",
      prompt,
      {
        "HTTP-Referer": window.location.origin,
        "X-Title": "Paper Generator",
      },
    );
  }

  if (settings.provider === "together" && settings.togetherApiKey) {
    return callOpenAICompatible("https://api.together.xyz/v1/chat/completions", settings.togetherApiKey, settings.model || "meta-llama/Llama-3.3-70B-Instruct-Turbo", prompt);
  }

  if (settings.provider === "openai" && settings.openaiApiKey) {
    return callOpenAICompatible("https://api.openai.com/v1/chat/completions", settings.openaiApiKey, settings.model || "gpt-4o-mini", prompt);
  }

  if (settings.provider === "gemini" && settings.geminiApiKey) {
    return callGemini(settings.geminiApiKey, settings.model || "gemini-1.5-flash", prompt);
  }

  if (settings.provider === "deepseek" && settings.deepseekApiKey) {
    return callOpenAICompatible("https://api.deepseek.com/v1/chat/completions", settings.deepseekApiKey, settings.model || "deepseek-chat", prompt);
  }

  if (settings.provider === "anthropic" && settings.anthropicApiKey) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": settings.anthropicApiKey,
        "anthropic-version": "2023-06-01",
        "dangerously-allow-browser": "true"
      },
      body: JSON.stringify({
        model: settings.model || "claude-3-5-sonnet-20240620",
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

  try {
    let content = "";
    if (settings.provider === "gemini" && settings.geminiApiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model || "gemini-1.5-flash"}:generateContent?key=${settings.geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
      });
      const data = await response.json();
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (settings.openaiApiKey || settings.groqApiKey || settings.togetherApiKey || settings.openrouterApiKey) {
      // Using groq as fallback default for this UI booster
      const url = settings.groqApiKey ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.openai.com/v1/chat/completions";
      const key = settings.groqApiKey || settings.openaiApiKey || settings.togetherApiKey || settings.openrouterApiKey;
      const model = settings.model || (settings.groqApiKey ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
      });
      const data = await resp.json();
      content = data?.choices?.[0]?.message?.content || "";
    }

    if (content) {
      const cleaned = content.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.chapters)) return parsed.chapters;
    }
  } catch (err) {
    console.error("AI Syllabus Error:", err);
  }

  // Final fallback
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

  try {
    let content = "";
    if (settings.provider === "gemini" && settings.geminiApiKey) {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${settings.model || "gemini-1.5-flash"}:generateContent?key=${settings.geminiApiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: messages.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })) }),
      });
      const data = await response.json();
      content = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else {
      // Fallback for OpenAI compatible
      const url = settings.groqApiKey ? "https://api.groq.com/openai/v1/chat/completions" :
        settings.openaiApiKey ? "https://api.openai.com/v1/chat/completions" :
          settings.openrouterApiKey ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.groq.com/openai/v1/chat/completions";
      const key = settings.groqApiKey || settings.openaiApiKey || settings.openrouterApiKey;
      const model = settings.model || (settings.groqApiKey ? "llama-3.3-70b-versatile" : "gpt-4o-mini");

      if (key) {
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ model, messages, temperature: 0.7, response_format: { type: "json_object" } }),
        });
        const data = await resp.json();
        content = data?.choices?.[0]?.message?.content || "";
      }
    }

    if (content) {
      const cleaned = content.replace(/```json|```/g, "").trim();
      return JSON.parse(cleaned) as DiscussionResponse;
    }
  } catch (err) {
    console.error("AI Discussion Error:", err);
  }

  return { message: "I'm sorry, I'm having trouble connecting to my brain right now. Please try again." };
}
