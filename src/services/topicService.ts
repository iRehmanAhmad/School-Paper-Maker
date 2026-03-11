import { hasSupabase, supabase } from "@/services/supabase";
import type { TopicEntity, Question } from "@/types/domain";
import { DB, ensureSeed, normalizeText, readLocal, writeLocal } from "./baseService";

export async function getTopics(chapterIds: string[]) {
  ensureSeed();
  if (!chapterIds.length) {
    return [] as TopicEntity[];
  }
  if (hasSupabase && supabase) {
    const { data, error } = await supabase
      .from("topics")
      .select("*")
      .in("chapter_id", chapterIds)
      .order("topic_number", { ascending: true });
    if (error) {
      throw error;
    }
    return (data ?? []) as TopicEntity[];
  }
  return readLocal<TopicEntity>(DB.topics)
    .filter((row) => chapterIds.includes(row.chapter_id))
    .sort((a, b) => a.topic_number - b.topic_number);
}

export async function addTopic(input: Omit<TopicEntity, "id" | "created_at">) {
  const nextTitle = input.title.trim();
  if (!nextTitle) {
    throw new Error("Topic title is required");
  }

  if (hasSupabase && supabase) {
    const existing = await getTopics([input.chapter_id]);
    const titleExists = existing.some((row) => normalizeText(row.title) === normalizeText(nextTitle));
    if (titleExists) {
      throw new Error("Topic title already exists");
    }
    const numberExists = existing.some((row) => row.topic_number === input.topic_number);
    if (numberExists) {
      throw new Error("Topic number already exists");
    }
    const { data, error } = await supabase
      .from("topics")
      .insert({ ...input, title: nextTitle })
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as TopicEntity;
  }

  const existing = readLocal<TopicEntity>(DB.topics).filter((row) => row.chapter_id === input.chapter_id);
  const titleExists = existing.some((row) => normalizeText(row.title) === normalizeText(nextTitle));
  if (titleExists) {
    throw new Error("Topic title already exists");
  }
  const numberExists = existing.some((row) => row.topic_number === input.topic_number);
  if (numberExists) {
    throw new Error("Topic number already exists");
  }

  const row: TopicEntity = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    chapter_id: input.chapter_id,
    title: nextTitle,
    topic_number: input.topic_number,
  };
  writeLocal(DB.topics, [row, ...readLocal<TopicEntity>(DB.topics)]);
  return row;
}

export async function updateTopic(topicId: string, input: Pick<TopicEntity, "title" | "topic_number">) {
  const nextTitle = input.title.trim();
  if (!nextTitle) {
    throw new Error("Topic title is required");
  }

  if (hasSupabase && supabase) {
    const { data: currentTopic, error: currentError } = await supabase
      .from("topics")
      .select("*")
      .eq("id", topicId)
      .single();
    if (currentError) {
      throw currentError;
    }
    const row = currentTopic as TopicEntity;
    const siblings = await getTopics([row.chapter_id]);
    const titleExists = siblings.some((item) => item.id !== topicId && normalizeText(item.title) === normalizeText(nextTitle));
    if (titleExists) {
      throw new Error("Topic title already exists");
    }
    const numberExists = siblings.some((item) => item.id !== topicId && item.topic_number === input.topic_number);
    if (numberExists) {
      throw new Error("Topic number already exists");
    }
    const { data, error } = await supabase
      .from("topics")
      .update({ title: nextTitle, topic_number: input.topic_number })
      .eq("id", topicId)
      .select("*")
      .single();
    if (error) {
      throw error;
    }
    return data as TopicEntity;
  }

  const rows = readLocal<TopicEntity>(DB.topics);
  const row = rows.find((item) => item.id === topicId);
  if (!row) {
    throw new Error("Topic not found");
  }
  const siblings = rows.filter((item) => item.chapter_id === row.chapter_id && item.id !== topicId);
  const titleExists = siblings.some((item) => normalizeText(item.title) === normalizeText(nextTitle));
  if (titleExists) {
    throw new Error("Topic title already exists");
  }
  const numberExists = siblings.some((item) => item.topic_number === input.topic_number);
  if (numberExists) {
    throw new Error("Topic number already exists");
  }

  row.title = nextTitle;
  row.topic_number = input.topic_number;
  writeLocal(DB.topics, rows);
  return row;
}

export async function deleteTopic(topicId: string) {
  if (hasSupabase && supabase) {
    const { error } = await supabase.from("topics").delete().eq("id", topicId);
    if (error) {
      throw error;
    }
    await supabase.from("questions").update({ topic_id: null }).eq("topic_id", topicId);
    return;
  }

  writeLocal(DB.topics, readLocal<TopicEntity>(DB.topics).filter((row) => row.id !== topicId));
  const patchedQuestions = readLocal<Question>(DB.questions).map((question) =>
    question.topic_id === topicId ? { ...question, topic_id: null } : question
  );
  writeLocal(DB.questions, patchedQuestions);
}

