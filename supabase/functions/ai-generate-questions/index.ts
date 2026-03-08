// Supabase Edge Function: ai-generate-questions
// Deploy: supabase functions deploy ai-generate-questions --no-verify-jwt

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ReqBody = {
  pdf_base64: string;
  file_name?: string;
  question_type: "mcq" | "true_false" | "fill_blanks" | "short" | "long" | "matching" | "diagram";
  count: number;
  difficulty: "easy" | "medium" | "hard";
  bloom_level: "remember" | "understand" | "apply" | "analyze" | "evaluate";
  instructions?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "OPENAI_API_KEY is missing" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = (await req.json()) as ReqBody;
    const count = Math.max(1, Math.min(100, Number(body.count || 1)));

    // NOTE: This template sends only metadata + high-level request to AI.
    // For best results, parse PDF text first (or integrate a document parser service), then pass extracted text in prompt.
    const prompt = `Generate ${count} ${body.question_type} questions for school exam prep.
Difficulty: ${body.difficulty}
Bloom Level: ${body.bloom_level}
Additional instructions: ${body.instructions || "None"}
File name: ${body.file_name || "uploaded.pdf"}

Return STRICT JSON with shape:
{
  "questions": [
    {
      "question_text": "...",
      "options": ["..."],
      "correct_answer": "...",
      "explanation": "...",
      "difficulty": "easy|medium|hard",
      "bloom_level": "remember|understand|apply|analyze|evaluate",
      "marks": 1,
      "diagram_url": "...optional"
    }
  ]
}

Rules:
- For mcq, include exactly 4 options and correct_answer A/B/C/D.
- For true_false, correct_answer must be True or False.
- For short/long, options should be omitted.
- For matching, correct_answer should be mapping like A-2;B-1.
- For diagram, include diagram_url if possible and labeling key in correct_answer.
- No markdown, only JSON.`;

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
        input: prompt,
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      return new Response(JSON.stringify({ error: `OpenAI error: ${txt}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await response.json();
    const textOut = data?.output?.[0]?.content?.[0]?.text ?? data?.output_text ?? "{}";

    let parsed: { questions: unknown[] } = { questions: [] };
    try {
      parsed = JSON.parse(textOut);
    } catch {
      // Fallback: strip code fences if model returned them
      const cleaned = String(textOut).replace(/```json|```/g, "").trim();
      parsed = JSON.parse(cleaned);
    }

    return new Response(JSON.stringify({ questions: parsed.questions || [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unexpected error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
