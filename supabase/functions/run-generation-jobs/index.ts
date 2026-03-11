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

async function callGemini(prompt: string) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) return null;
  const model = Deno.env.get("GEMINI_MODEL") || "gemini-1.5-flash";
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

async function callProvider(prompt: string) {
  const gemini = await callGemini(prompt);
  if (gemini) return gemini;

  const groqKey = Deno.env.get("GROQ_API_KEY");
  if (groqKey) {
    const text = await callOpenAICompatible(
      "https://api.groq.com/openai/v1/chat/completions",
      groqKey,
      Deno.env.get("GROQ_MODEL") || "llama-3.3-70b-versatile",
      prompt,
    );
    if (text) return text;
  }

  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (openaiKey) {
    const text = await callOpenAICompatible(
      "https://api.openai.com/v1/chat/completions",
      openaiKey,
      Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini",
      prompt,
    );
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
    const details: Array<{ job_id: string; status: "completed" | "failed"; candidate_count?: number; error?: string }> = [];
    let completed = 0;
    let failed = 0;
    let candidatesCreated = 0;

    for (const job of jobs) {
      try {
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

        const prompt = buildPrompt(job, contextText);
        const modelOutput = await callProvider(prompt);
        const parsed = modelOutput ? safeParse(modelOutput) : null;
        const request = job.request_json || {};
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
