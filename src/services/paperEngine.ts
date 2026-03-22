import type {
  BloomLevel,
  Difficulty,
  GeneratedPaperBundle,
  GeneratedQuestion,
  GeneratedSet,
  GeneratorSettings,
  Paper,
  PaperQuestion,
  Question,
  QuestionUsage,
  QuestionType,
  QuestionLevel,
} from "@/types/domain";

type GenerationInput = {
  settings: GeneratorSettings;
  teacherId: string;
  questions: Question[];
  recentUsage: QuestionUsage[];
  sections: { type: QuestionType; count: number; marks: number; choice?: number; empty_lines?: number; question_level?: QuestionLevel }[];
};

const random = <T,>(arr: T[]) => {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const diffKeys: Difficulty[] = ["easy", "medium", "hard"];
const bloomKeys: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate"];

function toQuota<T extends string>(total: number, dist: Partial<Record<T, number>>, keys: T[]) {
  const base = keys.reduce((sum, k) => sum + (dist[k] ?? 0), 0) || keys.length;
  const out = {} as Record<T, number>;
  let used = 0;
  keys.forEach((k, idx) => {
    const weight = dist[k] ?? 100 / keys.length;
    const count = idx === keys.length - 1 ? total - used : Math.max(0, Math.floor((total * weight) / base));
    used += count;
    out[k] = count;
  });
  return out;
}

function chooseQuestions(pool: Question[], totalNeeded: number, settings: GeneratorSettings, recentlyUsedIds: Set<string>, usedIdsInSet: Set<string>, desiredLevel?: QuestionLevel) {
  const chapterQuota = toQuota(totalNeeded, settings.chapterWeightage, settings.chapterIds);
  const diffQuota = toQuota(totalNeeded, settings.difficultyDistribution, diffKeys);
  const bloomQuota = toQuota(totalNeeded, settings.bloomDistribution, bloomKeys);

  // Smart Diversity: Track topic usage within the pool
  const topicUsage = {} as Record<string, number>;

  const chosen: Question[] = [];

  for (let i = 0; i < totalNeeded; i += 1) {
    const candidates = pool.filter((q) => !usedIdsInSet.has(q.id));
    if (!candidates.length) {
      break;
    }

    const scored = candidates
      .map((q) => {
        const chapterNeed = chapterQuota[q.chapter_id] ?? 0;
        const diffNeed = diffQuota[q.difficulty] ?? 0;
        const bloomNeed = q.bloom_level ? (bloomQuota[q.bloom_level as BloomLevel] ?? 0) : 0;

        // Question Level matching: Strong boost if it matches the requested level in blueprint
        const levelNeed = desiredLevel === q.question_level ? 2.5 : 0;
        const recencyPenalty = recentlyUsedIds.has(q.id) ? -3 : 0;

        // Topic Diversity Penalty: Prefer variety across explicit topics when available.
        const topicKey = q.topic_id || q.question_text.slice(0, 30).toLowerCase();
        const topicPenalty = (topicUsage[topicKey] ?? 0) * -1.5;

        const score =
          chapterNeed * 1.6 +
          diffNeed * 1.2 +
          bloomNeed * 1 +
          levelNeed +
          recencyPenalty +
          topicPenalty +
          Math.random() * 0.4;

        return { q, score, topicKey };
      })
      .sort((a, b) => b.score - a.score);

    const best = scored[0];
    if (!best?.q) {
      break;
    }

    const next = best.q;
    chosen.push(next);
    usedIdsInSet.add(next.id);
    topicUsage[best.topicKey] = (topicUsage[best.topicKey] ?? 0) + 1;

    chapterQuota[next.chapter_id] = Math.max(0, (chapterQuota[next.chapter_id] ?? 0) - 1);
    diffQuota[next.difficulty] = Math.max(0, diffQuota[next.difficulty] - 1);
    if (next.bloom_level) {
      bloomQuota[next.bloom_level as BloomLevel] = Math.max(0, (bloomQuota[next.bloom_level as BloomLevel] ?? 0) - 1);
    }
  }

  return chosen;
}

function sectionLabel(type: QuestionType) {
  if (["mcq", "true_false", "fill_blanks", "matching"].includes(type)) {
    return "Objective Section";
  }
  return "Subjective Section";
}

function optionsFor(q: Question, shouldShuffle: boolean) {
  const opts = [q.option_a, q.option_b, q.option_c, q.option_d].filter(Boolean) as string[];
  return shouldShuffle ? random(opts) : opts;
}

export function generatePaperBundle(input: GenerationInput): {
  bundle: GeneratedPaperBundle;
  mappings: PaperQuestion[];
  usage: QuestionUsage[];
} {
  const { settings, sections, questions, recentUsage, teacherId } = input;
  const paperId = crypto.randomUUID();
  const recentlyUsedIds = new Set(recentUsage.map((u) => u.question_id));
  const sets: GeneratedSet[] = [];
  const mappings: PaperQuestion[] = [];
  const usage: QuestionUsage[] = [];

  const sectionOrder: QuestionType[] = ["mcq", "true_false", "matching", "fill_blanks", "short", "long", "diagram"];

  for (let setNo = 0; setNo < Math.max(1, settings.sets); setNo += 1) {
    const label = String.fromCharCode(65 + setNo);
    const selected: GeneratedQuestion[] = [];
    const usedIdsInSet = new Set<string>();

    const sortedSections = [...sections].sort((a, b) => sectionOrder.indexOf(a.type) - sectionOrder.indexOf(b.type));

    sortedSections.forEach((section) => {
      const pool = questions.filter((q) => q.question_type === section.type);
      const picks = chooseQuestions(pool, section.count, settings, recentlyUsedIds, usedIdsInSet, section.question_level);
      const topUpNeeded = Math.max(0, section.count - picks.length);
      if (topUpNeeded > 0) {
        const fallback = random(pool.filter((q) => !usedIdsInSet.has(q.id))).slice(0, topUpNeeded);
        fallback.forEach((q) => {
          picks.push(q);
          usedIdsInSet.add(q.id);
        });
      }

      picks.forEach((q) => {
        selected.push({
          id: q.id,
          orderNumber: 0,
          setLabel: label,
          section: sectionLabel(q.question_type),
          questionType: q.question_type,
          questionText: q.question_text,
          options: optionsFor(q, true),
          correctAnswer: q.correct_answer,
          marks: section.marks,
          emptyLines: section.empty_lines,
          explanation: q.explanation,
          diagramUrl: q.diagram_url,
        });
      });
    });

    const ordered = selected.map((q, idx) => ({ ...q, orderNumber: idx + 1 }));
    const sectionTotals = sections.map(s => (s.choice ?? s.count) * s.marks);
    const totalMarks = sectionTotals.reduce((a, b) => a + b, 0);

    // Automated Rubric Generation
    const rubric = ordered
      .map((q) => `Q${q.orderNumber} (${q.marks}m): ${q.correctAnswer || "See explanation"}${q.explanation ? ` - ${q.explanation}` : ""}`)
      .join("\n");

    sets.push({ label, questions: ordered, totalMarks, rubric });

    ordered.forEach((q) => {
      mappings.push({
        id: crypto.randomUUID(),
        paper_id: paperId,
        question_id: q.id,
        order_number: q.orderNumber,
        paper_set: label,
        shuffled_options: q.options,
      });
      usage.push({ id: crypto.randomUUID(), question_id: q.id, paper_id: paperId, used_at: new Date().toISOString() });
    });
  }

  const paper: Paper = {
    id: paperId,
    teacher_id: teacherId,
    class_id: settings.classId,
    subject_id: settings.subjectId,
    exam_type: settings.examType,
    total_marks: sets[0]?.totalMarks ?? 0,
    time_limit: Number(settings.header.timeLabel.replace(/\D/g, "")) || 30,
    settings_json: settings as unknown as Record<string, unknown>,
    created_at: new Date().toISOString(),
  };

  return { bundle: { paper, sets }, mappings, usage };
}

