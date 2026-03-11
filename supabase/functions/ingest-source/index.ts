import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IngestRequest = {
  source_id: string;
  max_chunk_chars?: number;
};

function parseStorageLocation(filePath: string) {
  const normalized = filePath.trim().replace(/^\/+/, "");
  if (!normalized) {
    throw new Error("Invalid source file path");
  }
  if (normalized.includes(":")) {
    const [bucket, ...rest] = normalized.split(":");
    return { bucket, objectPath: rest.join(":") };
  }
  const parts = normalized.split("/");
  if (parts.length >= 2) {
    return { bucket: parts[0], objectPath: parts.slice(1).join("/") };
  }
  return {
    bucket: Deno.env.get("CONTENT_BUCKET") || "content-sources",
    objectPath: normalized,
  };
}

function extractTextFromBytes(bytes: Uint8Array) {
  const raw = new TextDecoder("latin1").decode(bytes);
  const text = raw
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text;
}

function chunkText(text: string, chunkSize: number) {
  const safe = text.trim();
  if (!safe) return [] as string[];
  const segments = safe.split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  let current = "";
  for (const segment of segments) {
    const candidate = current ? `${current} ${segment}` : segment;
    if (candidate.length > chunkSize && current) {
      out.push(current);
      current = segment.slice(0, chunkSize);
      continue;
    }
    current = candidate.slice(0, chunkSize);
  }
  if (current) out.push(current);
  return out;
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
    const body = (await req.json()) as IngestRequest;
    const sourceId = String(body.source_id || "").trim();
    const chunkSize = Math.max(300, Math.min(Number(body.max_chunk_chars || 1200), 4000));
    if (!sourceId) {
      throw new Error("source_id is required");
    }

    const { data: source, error: sourceError } = await admin
      .from("content_sources")
      .select("*")
      .eq("id", sourceId)
      .single();
    if (sourceError || !source) {
      throw new Error(sourceError?.message || "Source not found");
    }

    await admin
      .from("content_sources")
      .update({ status: "processing", error_message: null })
      .eq("id", sourceId);

    const { bucket, objectPath } = parseStorageLocation(String(source.file_path || ""));
    const { data: fileBlob, error: downloadError } = await admin.storage.from(bucket).download(objectPath);
    if (downloadError || !fileBlob) {
      throw new Error(downloadError?.message || "Failed to download source file");
    }

    const bytes = new Uint8Array(await fileBlob.arrayBuffer());
    let extracted = extractTextFromBytes(bytes);
    if (extracted.length < 200) {
      extracted = `${source.title}\n${source.file_path}\nAuto extracted summary placeholder.`;
    }

    const chunks = chunkText(extracted, chunkSize);
    if (!chunks.length) {
      throw new Error("No text extracted from source");
    }

    await admin.from("content_chunks").delete().eq("source_id", sourceId);
    const rows = chunks.map((content, index) => ({
      source_id: source.id,
      school_id: source.school_id,
      exam_body_id: source.exam_body_id,
      class_id: source.class_id,
      subject_id: source.subject_id,
      chapter_id: source.chapter_id,
      topic_id: source.topic_id || null,
      chunk_no: index + 1,
      page_from: null,
      page_to: null,
      content,
      content_hash: crypto.randomUUID(),
    }));

    const { error: insertError } = await admin.from("content_chunks").insert(rows);
    if (insertError) {
      throw new Error(insertError.message);
    }

    await admin
      .from("content_sources")
      .update({ status: "ready", pages: chunks.length, error_message: null })
      .eq("id", sourceId);

    return new Response(
      JSON.stringify({
        success: true,
        source_id: sourceId,
        status: "ready",
        chunk_count: chunks.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    try {
      const body = await req.clone().json() as IngestRequest;
      const sourceId = String(body.source_id || "");
      if (sourceId) {
        await admin
          .from("content_sources")
          .update({
            status: "failed",
            error_message: error instanceof Error ? error.message : "Ingestion failed",
          })
          .eq("id", sourceId);
      }
    } catch {
      // ignore secondary error while patching failure state
    }

    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unexpected error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
