import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RunJobsRequest = {
  job_id?: string;
  limit?: number;
  chapter_id?: string;
  topic_id?: string;
};

type JobRow = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  artifact: "question" | "worksheet" | "lesson_plan";
  request_json: Record<string, unknown>;
  attempts: number;
  provider?: string | null;
  model?: string | null;
};

type SchoolAISettingsRow = {
  school_id: string;
  provider: string | null;
  model: string | null;
  openai_api_key: string | null;
  groq_api_key: string | null;
  openrouter_api_key: string | null;
  together_api_key: string | null;
  gemini_api_key: string | null;
  deepseek_api_key: string | null;
  anthropic_api_key: string | null;
};

type SubscriptionPlanRow = {
  id: string;
  code: "basic" | "advanced";
  name: string;
  max_paper_sets: number;
  allow_worksheets: boolean;
  allow_lesson_plans: boolean;
};

type SubscriptionRow = {
  school_id: string;
  plan_id: string;
  status: "active" | "expired" | "suspended";
  starts_at: string;
  ends_at: string;
};

type SchoolAccess = {
  isActive: boolean;
  allowWorksheets: boolean;
  allowLessonPlans: boolean;
};

function cleanJsonText(text: string) {
  return text.replace(/```json|```/g, "").trim();
}

function safeParse(text: string) {
  try {
    return JSON.parse(cleanJsonText(text));
  } catch {
    return null;
  }
}

function compactText(content: string) {
  return content.replace(/\s+/g, " ").trim();
}

function defaultBasicAccess(): SchoolAccess {
  return {
    isActive: true,
    allowWorksheets: false,
    allowLessonPlans: false,
  };
}

function isSubscriptionActive(status: string, endsAt: string) {
  if (status !== "active") return false;
  return new Date(endsAt).getTime() >= Date.now();
}

async function getSchoolAccess(admin: ReturnType<typeof createClient>, schoolId: string): Promise<SchoolAccess> {
  try {
    const { data: subscription, error: subError } = await admin
      .from("subscriptions")
      .select("*")
      .eq("school_id", schoolId)
      .maybeSingle();
    if (subError) throw subError;
    if (!subscription) {
      return defaultBasicAccess();
    }
    const sub = subscription as SubscriptionRow;
    const { data: plan, error: planError } = await admin
      .from("subscription_plans")
      .select("*")
      .eq("id", sub.plan_id)
      .maybeSingle();
    if (planError) throw planError;
    const resolvedPlan = (plan as SubscriptionPlanRow | null) || null;
    return {
      isActive: isSubscriptionActive(sub.status, sub.ends_at),
      allowWorksheets: Boolean(resolvedPlan?.allow_worksheets),
      allowLessonPlans: Boolean(resolvedPlan?.allow_lesson_plans),
    };
  } catch {
    // Keep legacy behavior if subscription tables are not available yet.
    return {
      isActive: true,
      allowWorksheets: true,
      allowLessonPlans: true,
    };
  }
}

async function callGemini(apiKey: string, model: string, prompt: string) {
  if (!apiKey) return null;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25 },
      }),
    },
  );
  if (!response.ok) return null;
  const data = await response.json();
  return String(data?.candidates?.[0]?.content?.parts?.[0]?.text || "");
}

async function callOpenAICompatible(baseUrl: string, apiKey: string, model: string, prompt: string) {
  const response = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.25,
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  return String(data?.choices?.[0]?.message?.content || "");
}

async function callAnthropic(apiKey: string, model: string, prompt: string) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1800,
      temperature: 0.25,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!response.ok) return null;
  const data = await response.json();
  const chunks = Array.isArray(data?.content) ? data.content : [];
  const firstText = chunks.find((entry: { type?: string; text?: string }) => entry?.type === "text")?.text;
  return typeof firstText === "string" ? firstText : null;
}

const PROVIDERS = ["gemini", "groq", "openrouter", "together", "deepseek", "openai", "anthropic"] as const;
type ProviderName = typeof PROVIDERS[number];

const DEFAULT_MODELS: Record<ProviderName, string> = {
  gemini: "gemini-1.5-flash",
  groq: "llama-3.3-70b-versatile",
  openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  together: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
  deepseek: "deepseek-chat",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-sonnet-20240620",
};

function normalizeProvider(value: unknown): ProviderName | null {
  const raw = String(value || "").trim().toLowerCase();
  return (PROVIDERS as readonly string[]).includes(raw) ? (raw as ProviderName) : null;
}

function getPreferredProviderOrder(preferred?: string | null, fallback?: string | null) {
  const first = normalizeProvider(preferred);
  const second = normalizeProvider(fallback);
  const ordered: ProviderName[] = [];
  if (first) ordered.push(first);
  if (second && second !== first) ordered.push(second);
  for (const provider of PROVIDERS) {
    if (!ordered.includes(provider)) ordered.push(provider);
  }
  return ordered;
}

function pickProviderApiKey(provider: ProviderName, schoolAI: SchoolAISettingsRow | null) {
  if (provider === "gemini") return schoolAI?.gemini_api_key || Deno.env.get("GEMINI_API_KEY") || "";
  if (provider === "groq") return schoolAI?.groq_api_key || Deno.env.get("GROQ_API_KEY") || "";
  if (provider === "openrouter") return schoolAI?.openrouter_api_key || Deno.env.get("OPENROUTER_API_KEY") || "";
  if (provider === "together") return schoolAI?.together_api_key || Deno.env.get("TOGETHER_API_KEY") || "";
  if (provider === "deepseek") return schoolAI?.deepseek_api_key || Deno.env.get("DEEPSEEK_API_KEY") || "";
  if (provider === "anthropic") return schoolAI?.anthropic_api_key || Deno.env.get("ANTHROPIC_API_KEY") || "";
  return schoolAI?.openai_api_key || Deno.env.get("OPENAI_API_KEY") || "";
}

function pickProviderModel(
  provider: ProviderName,
  preferredProvider: string | null | undefined,
  preferredModel: string | null | undefined,
  schoolAI: SchoolAISettingsRow | null,
) {
  const normalizedPreferred = normalizeProvider(preferredProvider);
  if (normalizedPreferred === provider && preferredModel) {
    return preferredModel;
  }
  const schoolProvider = normalizeProvider(schoolAI?.provider || null);
  if (schoolProvider === provider && schoolAI?.model) {
    return schoolAI.model;
  }
  if (provider === "gemini") return Deno.env.get("GEMINI_MODEL") || DEFAULT_MODELS.gemini;
  if (provider === "groq") return Deno.env.get("GROQ_MODEL") || DEFAULT_MODELS.groq;
  if (provider === "openrouter") return Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODELS.openrouter;
  if (provider === "together") return Deno.env.get("TOGETHER_MODEL") || DEFAULT_MODELS.together;
  if (provider === "deepseek") return Deno.env.get("DEEPSEEK_MODEL") || DEFAULT_MODELS.deepseek;
  if (provider === "anthropic") return Deno.env.get("ANTHROPIC_MODEL") || DEFAULT_MODELS.anthropic;
  return Deno.env.get("OPENAI_MODEL") || DEFAULT_MODELS.openai;
}

async function callProvider(
  prompt: string,
  schoolAI: SchoolAISettingsRow | null,
  preferredProvider?: string | null,
  preferredModel?: string | null,
) {
  const order = getPreferredProviderOrder(preferredProvider, schoolAI?.provider || null);
  for (const provider of order) {
    const apiKey = pickProviderApiKey(provider, schoolAI);
    if (!apiKey) continue;
    const model = pickProviderModel(provider, preferredProvider, preferredModel, schoolAI);
    if (provider === "gemini") {
      const text = await callGemini(apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    if (provider === "groq") {
      const text = await callOpenAICompatible("https://api.groq.com/openai/v1/chat/completions", apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    if (provider === "openrouter") {
      const text = await callOpenAICompatible("https://openrouter.ai/api/v1/chat/completions", apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    if (provider === "together") {
      const text = await callOpenAICompatible("https://api.together.xyz/v1/chat/completions", apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    if (provider === "deepseek") {
      const text = await callOpenAICompatible("https://api.deepseek.com/chat/completions", apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    if (provider === "anthropic") {
      const text = await callAnthropic(apiKey, model, prompt);
      if (text) return text;
      continue;
    }
    const text = await callOpenAICompatible("https://api.openai.com/v1/chat/completions", apiKey, model, prompt);
    if (text) return text;
  }

  return null;
}

function defaultQuestionPayload(index: number, request: Record<string, unknown>) {
  const type = String(request.question_type || request.questionType || "mcq").toLowerCase();
  const difficulty = String(request.difficulty || "medium").toLowerCase();
  const bloom = String(request.bloom_level || request.bloomLevel || "remember").toLowerCase();
  if (type === "mcq") {
    return {
      question_type: "mcq",
      question_text: `AI draft MCQ ${index + 1}`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correct_answer: "A",
      difficulty,
      bloom_level: bloom,
      marks: 1,
      explanation: "Auto-generated candidate",
    };
  }
  return {
    question_type: type,
    question_text: `AI draft ${type} ${index + 1}`,
    correct_answer: type === "short" || type === "long" ? "" : "Sample answer",
    difficulty,
    bloom_level: bloom,
    marks: type === "long" ? 5 : type === "short" ? 2 : 1,
    explanation: "Auto-generated candidate",
  };
}

function buildPrompt(job: JobRow, contextText: string) {
  const request = job.request_json || {};
  const count = Math.max(1, Math.min(Number(request.count || 5), 50));
  if (job.artifact === "question") {
    return `You are an exam content generator. Produce ${count} questions in strict JSON only.
Context:
- class_id: ${job.class_id}
- subject_id: ${job.subject_id}
- chapter_id: ${job.chapter_id}
- topic_id: ${job.topic_id || ""}
- request_json: ${JSON.stringify(request)}

Reference content:
${contextText}

Return exactly:
{
  "questions": [
    {
      "question_type": "mcq|true_false|fill_blanks|short|long|matching|diagram",
      "question_text": "...",
      "options": ["...","...","...","..."],
      "correct_answer": "...",
      "difficulty": "easy|medium|hard",
      "bloom_level": "remember|understand|apply|analyze|evaluate",
      "marks": 1,
      "explanation": "...",
      "diagram_url": "optional"
    }
  ]
}`;
  }
  if (job.artifact === "worksheet") {
    return `Create one worksheet as strict JSON only.
Context request_json: ${JSON.stringify(request)}
Reference content:
${contextText}

Return:
{
  "title": "Worksheet title",
  "items": [
    {
      "order_no": 1,
      "item_type": "mcq|fill_blanks|short|matching|true_false",
      "prompt": "...",
      "options": ["..."],
      "answer_key": "...",
      "marks": 2,
      "difficulty": "easy|medium|hard",
      "bloom_level": "remember|understand|apply|analyze|evaluate"
    }
  ]
}`;
  }
  return `Create one lesson plan as strict JSON only.
Context request_json: ${JSON.stringify(request)}
Reference content:
${contextText}

Return:
{
  "title": "Lesson title",
  "duration_minutes": 40,
  "objectives": ["..."],
  "blocks": [
    { "order_no": 1, "block_type": "warmup|instruction|practice|assessment|homework", "duration_minutes": 5, "content": "...", "resources": [] }
  ]
}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Missing Supabase env keys" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

  try {
    const body = (await req.json()) as RunJobsRequest;
    const limit = Math.max(1, Math.min(Number(body.limit || 10), 100));

    let query = admin.from("generation_jobs").select("*");
    if (body.job_id) {
      query = query.eq("id", body.job_id);
    } else {
      query = query.eq("status", "queued");
      if (body.chapter_id) query = query.eq("chapter_id", body.chapter_id);
      if (body.topic_id) query = query.eq("topic_id", body.topic_id);
      query = query.order("created_at", { ascending: true }).limit(limit);
    }
    const { data: jobsData, error: jobsError } = await query;
    if (jobsError) {
      throw new Error(jobsError.message);
    }

    const jobs = (jobsData || []) as JobRow[];
    const schoolAiCache = new Map<string, SchoolAISettingsRow | null>();
    const schoolAccessCache = new Map<string, SchoolAccess>();
    const details: Array<{ job_id: string; status: "completed" | "failed"; candidate_count?: number; error?: string }> = [];
    let completed = 0;
    let failed = 0;
    let candidatesCreated = 0;

    for (const job of jobs) {
      try {
        let schoolAI: SchoolAISettingsRow | null = null;
        if (schoolAiCache.has(job.school_id)) {
          schoolAI = schoolAiCache.get(job.school_id) || null;
        } else {
          const { data: aiRow, error: aiError } = await admin
            .from("school_ai_settings")
            .select("*")
            .eq("school_id", job.school_id)
            .maybeSingle();
          if (!aiError && aiRow) {
            schoolAI = aiRow as SchoolAISettingsRow;
          }
          schoolAiCache.set(job.school_id, schoolAI);
        }
        let schoolAccess: SchoolAccess;
        if (schoolAccessCache.has(job.school_id)) {
          schoolAccess = schoolAccessCache.get(job.school_id) as SchoolAccess;
        } else {
          schoolAccess = await getSchoolAccess(admin, job.school_id);
          schoolAccessCache.set(job.school_id, schoolAccess);
        }
        if (!schoolAccess.isActive) {
          throw new Error("Subscription inactive or expired for this school.");
        }
        if (job.artifact === "worksheet" && !schoolAccess.allowWorksheets) {
          throw new Error("Worksheet generation is available on Advanced plan only.");
        }
        if (job.artifact === "lesson_plan" && !schoolAccess.allowLessonPlans) {
          throw new Error("Lesson plan generation is available on Advanced plan only.");
        }

        await admin
          .from("generation_jobs")
          .update({
            status: "running",
            attempts: (job.attempts || 0) + 1,
            started_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id);

        let chunkQuery = admin
          .from("content_chunks")
          .select("content")
          .eq("school_id", job.school_id)
          .eq("class_id", job.class_id)
          .eq("subject_id", job.subject_id)
          .eq("chapter_id", job.chapter_id)
          .order("created_at", { ascending: false })
          .limit(30);
        if (job.topic_id) {
          chunkQuery = chunkQuery.eq("topic_id", job.topic_id);
        }
        const { data: chunkRows } = await chunkQuery;
        const contextText = compactText(
          (chunkRows || [])
            .map((row: { content?: string }) => row.content || "")
            .join("\n")
            .slice(0, 20000),
        ) || "No extracted content available. Generate generic curriculum-aligned output.";

        const request = job.request_json || {};
        const prompt = buildPrompt(job, contextText);
        const preferredProvider = String(job.provider || request.provider || "").trim() || null;
        const preferredModel = String(job.model || request.model || "").trim() || null;
        const modelOutput = await callProvider(prompt, schoolAI, preferredProvider, preferredModel);
        const parsed = modelOutput ? safeParse(modelOutput) : null;
        const count = Math.max(1, Math.min(Number(request.count || 5), 50));

        let payloads: Record<string, unknown>[] = [];
        if (job.artifact === "question") {
          const questions = Array.isArray(parsed?.questions) ? parsed?.questions : [];
          payloads = questions.length
            ? (questions as Record<string, unknown>[])
            : Array.from({ length: count }).map((_, i) => defaultQuestionPayload(i, request));
        } else if (job.artifact === "worksheet") {
          if (parsed && typeof parsed === "object") {
            payloads = [parsed as Record<string, unknown>];
          } else {
            payloads = [{
              title: String(request.title || "AI Worksheet"),
              items: Array.from({ length: count }).map((_, i) => ({
                order_no: i + 1,
                item_type: "short",
                prompt: `Worksheet prompt ${i + 1}`,
                answer_key: "Sample answer",
                marks: 2,
              })),
            }];
          }
        } else {
          if (parsed && typeof parsed === "object") {
            payloads = [parsed as Record<string, unknown>];
          } else {
            payloads = [{
              title: String(request.title || "AI Lesson Plan"),
              duration_minutes: Number(request.duration_minutes || 40),
              objectives: ["Concept understanding", "Skill practice"],
              blocks: [
                { order_no: 1, block_type: "warmup", duration_minutes: 5, content: "Quick recap", resources: [] },
                { order_no: 2, block_type: "instruction", duration_minutes: 15, content: "Main concept", resources: [] },
                { order_no: 3, block_type: "practice", duration_minutes: 15, content: "Guided practice", resources: [] },
                { order_no: 4, block_type: "assessment", duration_minutes: 5, content: "Exit question", resources: [] },
              ],
            }];
          }
        }

        const candidateRows = payloads.map((payload) => ({
          job_id: job.id,
          school_id: job.school_id,
          artifact: job.artifact,
          payload,
          status: "pending_review",
          validation_errors: null,
        }));
        const { error: insertError } = await admin.from("generation_candidates").insert(candidateRows);
        if (insertError) {
          throw new Error(insertError.message);
        }

        await admin
          .from("generation_jobs")
          .update({
            status: "completed",
            finished_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", job.id);

        completed += 1;
        candidatesCreated += candidateRows.length;
        details.push({ job_id: job.id, status: "completed", candidate_count: candidateRows.length });
      } catch (error) {
        failed += 1;
        await admin
          .from("generation_jobs")
          .update({
            status: "failed",
            finished_at: new Date().toISOString(),
            error_message: error instanceof Error ? error.message : "Job failed",
          })
          .eq("id", job.id);
        details.push({
          job_id: job.id,
          status: "failed",
          error: error instanceof Error ? error.message : "Job failed",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed: jobs.length,
        completed,
        failed,
        candidates_created: candidatesCreated,
        details,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
