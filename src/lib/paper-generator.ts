import { Difficulty, Question, QuestionType } from "@prisma/client";
import { GeneratorRequest, GeneratedPaper, GeneratedSet } from "@/types";

function shuffle<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function splitByDifficulty(total: number, distribution: Partial<Record<Difficulty, number>>) {
  const easy = distribution.EASY ?? 0;
  const medium = distribution.MEDIUM ?? 0;
  const hard = distribution.HARD ?? 0;
  const sum = easy + medium + hard;

  if (sum <= 0) {
    return {
      EASY: Math.floor(total / 3),
      MEDIUM: Math.floor(total / 3),
      HARD: total - Math.floor(total / 3) * 2,
    };
  }

  const easyCount = Math.floor((total * easy) / sum);
  const mediumCount = Math.floor((total * medium) / sum);
  const hardCount = total - easyCount - mediumCount;

  return {
    EASY: easyCount,
    MEDIUM: mediumCount,
    HARD: hardCount,
  };
}

function sectionName(type: QuestionType) {
  if (type === QuestionType.MCQ || type === QuestionType.TRUE_FALSE || type === QuestionType.FILL_BLANK || type === QuestionType.MATCHING) {
    return "Section A";
  }
  if (type === QuestionType.SHORT) {
    return "Section B";
  }
  return "Section C";
}

function pickByDifficulty(questions: Question[], countByDifficulty: Record<Difficulty, number>, usedIds: Set<string>) {
  const chosen: Question[] = [];

  (Object.keys(countByDifficulty) as Difficulty[]).forEach((diff) => {
    const candidates = shuffle(questions.filter((q) => q.difficulty === diff && !usedIds.has(q.id)));
    const required = countByDifficulty[diff];
    for (let i = 0; i < Math.min(required, candidates.length); i += 1) {
      chosen.push(candidates[i]);
      usedIds.add(candidates[i].id);
    }
  });

  return chosen;
}

export function generatePaperSets(input: GeneratorRequest, questionPool: Question[]): GeneratedPaper {
  const sets: GeneratedSet[] = [];

  for (let setIndex = 0; setIndex < input.sets; setIndex += 1) {
    const usedIds = new Set<string>();
    const setQuestions: GeneratedSet["questions"] = [];

    const structureEntries = Object.entries(input.structure) as [QuestionType, number][];

    structureEntries.forEach(([type, count]) => {
      if (!count || count <= 0) {
        return;
      }

      const perTypePool = questionPool.filter((q) => q.questionType === type);
      const diffSplit = splitByDifficulty(count, input.difficultyDistribution);
      const chosen = pickByDifficulty(perTypePool, diffSplit, usedIds);

      const missing = count - chosen.length;
      if (missing > 0) {
        const fallback = shuffle(perTypePool.filter((q) => !usedIds.has(q.id))).slice(0, missing);
        fallback.forEach((q) => usedIds.add(q.id));
        chosen.push(...fallback);
      }

      chosen.forEach((q) => {
        const options = [q.optionA, q.optionB, q.optionC, q.optionD].filter(Boolean) as string[];
        const renderedOptions = input.shuffleOptions ? shuffle(options) : options;
        setQuestions.push({
          id: q.id,
          section: sectionName(q.questionType),
          orderIndex: 0,
          questionType: q.questionType,
          questionText: q.questionText,
          options: renderedOptions,
          correctAnswer: q.correctAnswer,
          marks: q.marks,
          explanation: q.explanation,
        });
      });
    });

    const ordered = shuffle(setQuestions).map((q, idx) => ({ ...q, orderIndex: idx + 1 }));

    sets.push({
      label: String.fromCharCode(65 + setIndex),
      questions: ordered,
    });
  }

  return { request: input, sets };
}

export function calculateMarks(questions: GeneratedSet["questions"]) {
  return questions.reduce((sum, q) => sum + q.marks, 0);
}