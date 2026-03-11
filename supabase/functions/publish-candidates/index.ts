import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PublishRequest = {
  candidate_ids: string[];
};

type CandidateRow = {
  id: string;
  job_id: string;
  artifact: "question" | "worksheet" | "lesson_plan";
  status: "pending_review" | "approved" | "rejected" | "published";
  payload: Record<string, unknown>;
};

type JobRow = {
  id: string;
  school_id: string;
  exam_body_id: string;
  class_id: string;
  subject_id: string;
  chapter_id: string;
  topic_id?: string | null;
  created_by: string;
  request_json: Record<string, unknown>;
};

function parseStringArray(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value.map((x) => String(x || "").trim()).filter(Boolean);
}

function toQuestionType(value: unknown) {
  const raw = String(value || "").toLowerCase();
  const allowed = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"];
  return allowed.includes(raw) ? raw : "mcq";
}

function toDifficulty(value: unknown) {
  const raw = String(value || "").toLowerCase();
  return raw === "easy" || raw === "hard" ? raw : "medium";
}

function toBloom(value: unknown) {
  const raw = String(value || "").toLowerCase();
  const allowed = ["remember", "understand", "apply", "analyze", "evaluate"];
  return allowed.includes(raw) ? raw : "remember";
}

function defaultMarks(type: string) {
  if (type === "long") return 5;
  if (type === "short") return 2;
  return 1;
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
    const body = (await req.json()) as PublishRequest;
    const candidateIds = Array.from(new Set((body.candidate_ids || []).map((id) => String(id).trim()).filter(Boolean)));
    if (!candidateIds.length) {
      return new Response(
        JSON.stringify({ success: true, total: 0, published: 0, skipped: 0, failed: 0, details: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: candidatesRaw, error: candidatesError } = await admin
      .from("generation_candidates")
      .select("*")
      .in("id", candidateIds);
    if (candidatesError) {
      throw new Error(candidatesError.message);
    }
    const candidates = (candidatesRaw || []) as CandidateRow[];
    const jobIds = Array.from(new Set(candidates.map((item) => item.job_id)));
    const { data: jobsRaw, error: jobsError } = await admin.from("generation_jobs").select("*").in("id", jobIds);
    if (jobsError) {
      throw new Error(jobsError.message);
    }
    const jobs = (jobsRaw || []) as JobRow[];
    const jobsById = new Map<string, JobRow>(jobs.map((job) => [job.id, job]));

    const details: Array<{
      candidate_id: string;
      status: "published" | "skipped" | "failed";
      published_table?: string;
      published_id?: string;
      reason?: string;
    }> = [];
    let published = 0;
    let skipped = 0;
    let failed = 0;

    for (const candidate of candidates) {
      try {
        if (candidate.status !== "approved") {
          skipped += 1;
          details.push({ candidate_id: candidate.id, status: "skipped", reason: "Candidate is not approved" });
          continue;
        }
        const job = jobsById.get(candidate.job_id);
        if (!job) {
          skipped += 1;
          details.push({ candidate_id: candidate.id, status: "skipped", reason: "Source job missing" });
          continue;
        }
        const payload = (candidate.payload || {}) as Record<string, unknown>;

        if (candidate.artifact === "question") {
          const type = toQuestionType(payload.question_type || payload.questionType || job.request_json?.question_type);
          const options = parseStringArray(payload.options);
          const optionA = String(payload.option_a || options[0] || "").trim() || null;
          const optionB = String(payload.option_b || options[1] || "").trim() || null;
          const optionC = String(payload.option_c || options[2] || "").trim() || null;
          const optionD = String(payload.option_d || options[3] || "").trim() || null;
          const questionText = String(payload.question_text || payload.questionText || "").trim();
          if (!questionText) {
            throw new Error("Question payload missing question_text");
          }
          const marksRaw = Number(payload.marks);
          const marks = Number.isFinite(marksRaw) && marksRaw > 0 ? marksRaw : defaultMarks(type);

          const { data: insertedQuestion, error: insertQuestionError } = await admin
            .from("questions")
            .insert({
              school_id: job.school_id,
              chapter_id: job.chapter_id,
              question_type: type,
              question_text: questionText,
              option_a: optionA,
              option_b: optionB,
              option_c: optionC,
              option_d: optionD,
              correct_answer: String(payload.correct_answer || payload.correctAnswer || "").trim() || null,
              difficulty: toDifficulty(payload.difficulty || job.request_json?.difficulty),
              bloom_level: toBloom(payload.bloom_level || payload.bloomLevel || job.request_json?.bloom_level),
              marks,
              diagram_url: String(payload.diagram_url || payload.diagramUrl || "").trim() || null,
              explanation: String(payload.explanation || "").trim() || null,
            })
            .select("id")
            .single();
          if (insertQuestionError || !insertedQuestion) {
            throw new Error(insertQuestionError?.message || "Failed to insert question");
          }

          await admin
            .from("generation_candidates")
            .update({
              status: "published",
              published_table: "questions",
              published_id: insertedQuestion.id,
            })
            .eq("id", candidate.id);

          published += 1;
          details.push({
            candidate_id: candidate.id,
            status: "published",
            published_table: "questions",
            published_id: insertedQuestion.id,
          });
          continue;
        }

        if (candidate.artifact === "worksheet") {
          const { data: worksheet, error: worksheetError } = await admin
            .from("worksheets")
            .insert({
              school_id: job.school_id,
              exam_body_id: job.exam_body_id,
              class_id: job.class_id,
              subject_id: job.subject_id,
              chapter_id: job.chapter_id,
              topic_id: job.topic_id || null,
              title: String(payload.title || "AI Worksheet").trim(),
              settings_json: (payload.settings_json || payload.settings || {}) as Record<string, unknown>,
              created_by: job.created_by,
            })
            .select("id")
            .single();
          if (worksheetError || !worksheet) {
            throw new Error(worksheetError?.message || "Failed to insert worksheet");
          }
          const items = Array.isArray(payload.items) ? payload.items : [];
          if (items.length) {
            const rows = items
              .map((item, index) => item as Record<string, unknown>)
              .map((item, index) => ({
                worksheet_id: worksheet.id,
                order_no: Number(item.order_no) > 0 ? Number(item.order_no) : index + 1,
                item_type: String(item.item_type || item.type || "short").trim(),
                prompt: String(item.prompt || item.question_text || "").trim(),
                options: Array.isArray(item.options) ? item.options : null,
                answer_key: String(item.answer_key || item.correct_answer || "").trim() || null,
                marks: Number(item.marks) > 0 ? Number(item.marks) : null,
                bloom_level: String(item.bloom_level || "").trim() || null,
                difficulty: String(item.difficulty || "").trim() || null,
              }))
              .filter((row) => row.prompt);
            if (rows.length) {
              const { error: itemsError } = await admin.from("worksheet_items").insert(rows);
              if (itemsError) throw new Error(itemsError.message);
            }
          }

          await admin
            .from("generation_candidates")
            .update({
              status: "published",
              published_table: "worksheets",
              published_id: worksheet.id,
            })
            .eq("id", candidate.id);
          published += 1;
          details.push({
            candidate_id: candidate.id,
            status: "published",
            published_table: "worksheets",
            published_id: worksheet.id,
          });
          continue;
        }

        const { data: plan, error: planError } = await admin
          .from("lesson_plans")
          .insert({
            school_id: job.school_id,
            exam_body_id: job.exam_body_id,
            class_id: job.class_id,
            subject_id: job.subject_id,
            chapter_id: job.chapter_id,
            topic_id: job.topic_id || null,
            title: String(payload.title || "AI Lesson Plan").trim(),
            duration_minutes: Number(payload.duration_minutes) > 0 ? Number(payload.duration_minutes) : null,
            objectives: Array.isArray(payload.objectives) ? payload.objectives : [],
            created_by: job.created_by,
          })
          .select("id")
          .single();
        if (planError || !plan) {
          throw new Error(planError?.message || "Failed to insert lesson plan");
        }

        const blocks = Array.isArray(payload.blocks) ? payload.blocks : [];
        if (blocks.length) {
          const rows = blocks
            .map((block, index) => block as Record<string, unknown>)
            .map((block, index) => ({
              lesson_plan_id: plan.id,
              order_no: Number(block.order_no) > 0 ? Number(block.order_no) : index + 1,
              block_type: String(block.block_type || block.type || "instruction").trim(),
              duration_minutes: Number(block.duration_minutes) > 0 ? Number(block.duration_minutes) : null,
              content: String(block.content || "").trim(),
              resources: Array.isArray(block.resources) ? block.resources : [],
            }))
            .filter((row) => row.content);
          if (rows.length) {
            const { error: blocksError } = await admin.from("lesson_plan_blocks").insert(rows);
            if (blocksError) throw new Error(blocksError.message);
          }
        }

        await admin
          .from("generation_candidates")
          .update({
            status: "published",
            published_table: "lesson_plans",
            published_id: plan.id,
          })
          .eq("id", candidate.id);
        published += 1;
        details.push({
          candidate_id: candidate.id,
          status: "published",
          published_table: "lesson_plans",
          published_id: plan.id,
        });
      } catch (error) {
        failed += 1;
        details.push({
          candidate_id: candidate.id,
          status: "failed",
          reason: error instanceof Error ? error.message : "Failed to publish",
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: failed === 0,
        total: candidateIds.length,
        published,
        skipped,
        failed,
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
