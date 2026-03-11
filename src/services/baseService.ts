import type {
  AuditLog,
  Blueprint,
  ContentChunk,
  ContentSource,
  ChapterEntity,
  ChapterWeightage,
  ClassEntity,
  ExamBody,
  GenerationCandidate,
  GenerationJob,
  LessonPlan,
  LessonPlanBlock,
  Paper,
  PaymentEvent,
  PaymentIntent,
  PaperTemplate,
  PaperQuestion,
  Question,
  QuestionUsage,
  School,
  Subscription,
  SubscriptionPlan,
  SubjectEntity,
  TopicEntity,
  UserProfile,
  Worksheet,
  WorksheetItem,
} from "@/types/domain";

export const DB = {
  schools: "pg_schools",
  examBodies: "pg_exam_bodies",
  users: "pg_users",
  classes: "pg_classes",
  subjects: "pg_subjects",
  chapters: "pg_chapters",
  topics: "pg_topics",
  questions: "pg_questions",
  blueprints: "pg_blueprints",
  weightage: "pg_weightage",
  papers: "pg_papers",
  paperQuestions: "pg_paper_questions",
  usage: "pg_usage",
  templates: "pg_templates",
  contentSources: "pg_content_sources",
  contentChunks: "pg_content_chunks",
  generationJobs: "pg_generation_jobs",
  generationCandidates: "pg_generation_candidates",
  worksheets: "pg_worksheets",
  worksheetItems: "pg_worksheet_items",
  lessonPlans: "pg_lesson_plans",
  lessonPlanBlocks: "pg_lesson_plan_blocks",
  subscriptionPlans: "pg_subscription_plans",
  subscriptions: "pg_subscriptions",
  paymentIntents: "pg_payment_intents",
  paymentEvents: "pg_payment_events",
  auditLogs: "pg_audit_logs",
} as const;

export type Key = (typeof DB)[keyof typeof DB];

export function readLocal<T>(key: Key): T[] {
  const raw = localStorage.getItem(key);
  if (!raw) {
    return [];
  }
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export function writeLocal<T>(key: Key, rows: T[]) {
  try {
    localStorage.setItem(key, JSON.stringify(rows));
  } catch (e: any) {
    if (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014) {
      console.warn(`Storage quota exceeded for key: ${key}. Attempting automatic pruning...`);

      const historicalKeys: Key[] = [DB.papers, DB.usage, DB.paperQuestions];

      // 1. Prune OTHER historical collections first
      historicalKeys.filter(hk => hk !== key).forEach(hKey => {
        const data = readLocal(hKey);
        if (data.length > 5) {
          const pruneCount = Math.floor(data.length * 0.5);
          const prunedData = data.slice(0, data.length - pruneCount);
          try {
            localStorage.setItem(hKey, JSON.stringify(prunedData));
          } catch (innerE) {
            console.error(`Emergency: Failed to prune ${hKey}`, innerE);
          }
        }
      });

      // 2. Prune the current 'rows' array if it's a historical collection
      let localRows = rows;
      if (historicalKeys.includes(key) && rows.length > 10) {
        console.log(`Pruning current collection: ${key}`);
        localRows = rows.slice(0, Math.floor(rows.length * 0.5));
      }

      try {
        localStorage.setItem(key, JSON.stringify(localRows));
        console.log(`Pruning successful. ${key} saved after reduction.`);
      } catch (retryE) {
        console.error("Pruning failed to free enough space for even a reduced collection.", retryE);
        // Last resort: wipe oldest papers entirely
        if (key === DB.papers) {
          localStorage.setItem(DB.papers, JSON.stringify(rows.slice(0, 5)));
          return;
        }
        throw retryE;
      }
    } else {
      throw e;
    }
  }
}

export function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

export function assertUniqueName(values: string[], nextValue: string, label: string) {
  const normalized = normalizeText(nextValue);
  const exists = values.some((value) => normalizeText(value) === normalized);
  if (exists) {
    throw new Error(`${label} already exists`);
  }
}

export type DeleteImpact = {
  classes: number;
  subjects: number;
  chapters: number;
  questions: number;
};

function defaultTopicTitles(chapterTitle: string) {
  const base = chapterTitle.trim() || "Chapter";
  return [`${base} Basics`, `${base} Practice`];
}

function ensureTopicStructure() {
  const chapters = readLocal<ChapterEntity>(DB.chapters);
  if (!chapters.length) {
    return;
  }

  const existingTopics = readLocal<TopicEntity>(DB.topics);
  const topicsByChapter = new Map<string, TopicEntity[]>();
  existingTopics.forEach((topic) => {
    const group = topicsByChapter.get(topic.chapter_id) ?? [];
    group.push(topic);
    topicsByChapter.set(topic.chapter_id, group);
  });

  let nextTopics = [...existingTopics];
  let topicsChanged = false;

  for (const chapter of chapters) {
    const chapterTopics = (topicsByChapter.get(chapter.id) ?? []).sort((a, b) => a.topic_number - b.topic_number);
    if (chapterTopics.length > 0) {
      continue;
    }
    const defaults = defaultTopicTitles(chapter.title);
    const created = defaults.map((title, index) => ({
      id: crypto.randomUUID(),
      chapter_id: chapter.id,
      title,
      topic_number: index + 1,
      created_at: new Date().toISOString(),
    }));
    nextTopics = [...created, ...nextTopics];
    topicsByChapter.set(chapter.id, created);
    topicsChanged = true;
  }

  if (topicsChanged) {
    writeLocal(DB.topics, nextTopics);
  }

  const currentTopics = topicsChanged ? nextTopics : existingTopics;
  const firstTopicByChapter = new Map<string, string>();
  currentTopics
    .slice()
    .sort((a, b) => a.topic_number - b.topic_number)
    .forEach((topic) => {
      if (!firstTopicByChapter.has(topic.chapter_id)) {
        firstTopicByChapter.set(topic.chapter_id, topic.id);
      }
    });

  const questions = readLocal<Question>(DB.questions);
  let questionsChanged = false;
  const patchedQuestions = questions.map((question) => {
    if (question.topic_id) {
      return question;
    }
    const fallbackTopicId = firstTopicByChapter.get(question.chapter_id);
    if (!fallbackTopicId) {
      return question;
    }
    questionsChanged = true;
    return { ...question, topic_id: fallbackTopicId };
  });

  if (questionsChanged) {
    writeLocal(DB.questions, patchedQuestions);
  }
}

function ensureScienceChapter2DummyQuestions() {
  const school = readLocal<School>(DB.schools)[0];
  if (!school) {
    return;
  }

  const class5 = readLocal<ClassEntity>(DB.classes).find((c) => normalizeText(c.name) === "class 5");
  if (!class5) {
    return;
  }

  const scienceSubject = readLocal<SubjectEntity>(DB.subjects).find((s) => s.class_id === class5.id && normalizeText(s.name) === "science");
  if (!scienceSubject) {
    return;
  }

  const chapters = readLocal<ChapterEntity>(DB.chapters);
  let chapter2 = chapters.find((c) => c.subject_id === scienceSubject.id && c.chapter_number === 2);
  if (!chapter2) {
    chapter2 = {
      id: crypto.randomUUID(),
      subject_id: scienceSubject.id,
      title: "Fundamental Concepts",
      chapter_number: 2,
      created_at: new Date().toISOString(),
    };
    chapters.unshift(chapter2);
    writeLocal(DB.chapters, chapters);
  } else if (chapter2.title !== "Fundamental Concepts") {
    chapter2.title = "Fundamental Concepts";
    writeLocal(DB.chapters, chapters);
  }

  const allTopics = readLocal<TopicEntity>(DB.topics);
  const chapter2Topics = allTopics
    .filter((topic) => topic.chapter_id === chapter2.id)
    .sort((a, b) => a.topic_number - b.topic_number);
  const defaultTopicId = chapter2Topics[0]?.id || null;

  const allQuestions = readLocal<Question>(DB.questions);
  const hasType = (type: Question["question_type"]) => allQuestions.some((q) => q.chapter_id === chapter2.id && q.question_type === type);
  const now = new Date().toISOString();
  const toAdd: Question[] = [];

  if (!hasType("mcq")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "mcq",
      question_text: "Which state of matter has fixed shape and fixed volume?",
      option_a: "Solid",
      option_b: "Liquid",
      option_c: "Gas",
      option_d: "Plasma",
      correct_answer: "A",
      difficulty: "easy",
      bloom_level: "remember",
      question_level: "exercise",
      marks: 1,
      explanation: "A solid has fixed shape and volume.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("true_false")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "true_false",
      question_text: "Water can exist as solid, liquid and gas.",
      option_a: "True",
      option_b: "False",
      option_c: null,
      option_d: null,
      correct_answer: "A",
      difficulty: "easy",
      bloom_level: "understand",
      question_level: "exercise",
      marks: 1,
      explanation: "Ice, liquid water and water vapor are all forms of water.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("fill_blanks")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "fill_blanks",
      question_text: "The change of liquid water into vapor is called ________.",
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_answer: "evaporation",
      difficulty: "easy",
      bloom_level: "remember",
      question_level: "examples",
      marks: 1,
      explanation: "Evaporation changes liquid into gas.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("short")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "short",
      question_text: "Define force and write one daily-life example.",
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_answer: "Force is a push or pull. Example: pushing a door.",
      difficulty: "medium",
      bloom_level: "understand",
      question_level: "conceptual",
      marks: 2,
      explanation: "Must include both definition and one valid example.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("long")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "long",
      question_text: "Explain the water cycle with evaporation, condensation and precipitation.",
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_answer: "Evaporation -> condensation -> precipitation -> collection.",
      difficulty: "medium",
      bloom_level: "apply",
      question_level: "conceptual",
      marks: 5,
      explanation: "Answer should explain all major stages in sequence.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("matching")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "matching",
      question_text: "Match terms: A) Evaporation B) Condensation C) Precipitation",
      option_a: "Liquid to gas",
      option_b: "Gas to liquid",
      option_c: "Water falls from clouds",
      option_d: null,
      correct_answer: "A-1;B-2;C-3",
      difficulty: "medium",
      bloom_level: "understand",
      question_level: "exercise",
      marks: 2,
      explanation: "Each term should be matched with correct meaning.",
      created_at: now,
      diagram_url: null,
    });
  }

  if (!hasType("diagram")) {
    toAdd.push({
      id: crypto.randomUUID(),
      chapter_id: chapter2.id,
      topic_id: defaultTopicId,
      school_id: school.id,
      question_type: "diagram",
      question_text: "Label the stages shown in the water cycle diagram.",
      option_a: null,
      option_b: null,
      option_c: null,
      option_d: null,
      correct_answer: "Evaporation, Condensation, Precipitation",
      difficulty: "hard",
      bloom_level: "analyze",
      question_level: "additional",
      marks: 3,
      explanation: "Students should identify each labeled stage correctly.",
      created_at: now,
      diagram_url: "https://picsum.photos/seed/water-cycle/640/280",
    });
  }

  if (toAdd.length) {
    writeLocal(DB.questions, [...toAdd, ...allQuestions]);
  }
}

function defaultPasswordForUser(user: Pick<UserProfile, "email" | "role">) {
  const email = user.email.toLowerCase();
  if (user.role === "admin" || email.includes("admin")) return "admin123";
  if (email.includes("teacher")) return "teacher123";
  return "client123";
}

function ensureUserPasswords() {
  const users = readLocal<UserProfile>(DB.users);
  if (!users.length) return;
  let changed = false;
  const next = users.map((user) => {
    if (user.password && user.password.trim().length >= 6) {
      return user;
    }
    changed = true;
    return { ...user, password: defaultPasswordForUser(user) };
  });
  if (changed) {
    writeLocal(DB.users, next);
  }
}

export function ensureSeed() {
  const hasExisting = readLocal<School>(DB.schools).length > 0;
  const hasBodies = readLocal<ExamBody>(DB.examBodies).length > 0;
  if (hasExisting && hasBodies) {
    if (!readLocal<SubscriptionPlan>(DB.subscriptionPlans).length) {
      const now = new Date().toISOString();
      writeLocal<SubscriptionPlan>(DB.subscriptionPlans, [
        {
          id: crypto.randomUUID(),
          code: "basic",
          name: "Basic",
          description: "Unlimited papers, single variation only.",
          max_paper_sets: 1,
          allow_worksheets: false,
          allow_lesson_plans: false,
          created_at: now,
        },
        {
          id: crypto.randomUUID(),
          code: "advanced",
          name: "Advanced",
          description: "Multiple paper variations with worksheets and lesson plans.",
          max_paper_sets: 10,
          allow_worksheets: true,
          allow_lesson_plans: true,
          created_at: now,
        },
      ]);
    }
    if (!readLocal<Subscription>(DB.subscriptions).length) {
      const plans = readLocal<SubscriptionPlan>(DB.subscriptionPlans);
      const schoolId = readLocal<School>(DB.schools)[0]?.id;
      const adminId = readLocal<UserProfile>(DB.users).find((u) => u.role === "admin")?.id || null;
      const basic = plans.find((plan) => plan.code === "basic") || plans[0];
      if (schoolId && basic) {
        const startAt = new Date();
        const endAt = new Date(startAt);
        endAt.setMonth(endAt.getMonth() + 1);
        writeLocal<Subscription>(DB.subscriptions, [
          {
            id: crypto.randomUUID(),
            school_id: schoolId,
            plan_id: basic.id,
            status: "active",
            starts_at: startAt.toISOString(),
            ends_at: endAt.toISOString(),
            created_by: adminId,
            created_at: startAt.toISOString(),
            updated_at: startAt.toISOString(),
          },
        ]);
      }
    }
    if (!readLocal<AuditLog>(DB.auditLogs).length) {
      writeLocal<AuditLog>(DB.auditLogs, []);
    }
    ensureUserPasswords();
    ensureTopicStructure();
    ensureScienceChapter2DummyQuestions();
    return;
  }
  Object.values(DB).forEach((key) => localStorage.removeItem(key));
  const schoolId = crypto.randomUUID();
  const punjabBody = crypto.randomUUID();
  const sindhBody = crypto.randomUUID();
  const kpkBody = crypto.randomUUID();
  const classPunjab5 = crypto.randomUUID();
  const classSindh5 = crypto.randomUUID();
  const classKpk5 = crypto.randomUUID();
  const subjectPunjabSci = crypto.randomUUID();
  const subjectPunjabMath = crypto.randomUUID();
  const subjectSindhSci = crypto.randomUUID();
  const subjectKpkSci = crypto.randomUUID();
  const ch1 = crypto.randomUUID();
  const ch2 = crypto.randomUUID();
  const ch3 = crypto.randomUUID();
  const t11 = crypto.randomUUID();
  const t12 = crypto.randomUUID();
  const t21 = crypto.randomUUID();
  const t22 = crypto.randomUUID();
  const t31 = crypto.randomUUID();
  const t32 = crypto.randomUUID();
  const now = new Date().toISOString();

  writeLocal<School>(DB.schools, [{ id: schoolId, name: "ABC Public School", created_at: now }]);
  writeLocal<ExamBody>(DB.examBodies, [
    { id: punjabBody, school_id: schoolId, name: "Punjab Govt", created_at: now },
    { id: sindhBody, school_id: schoolId, name: "Sindh Govt", created_at: now },
    { id: kpkBody, school_id: schoolId, name: "KPK Govt", created_at: now },
  ]);
  writeLocal<UserProfile>(DB.users, [
    { id: crypto.randomUUID(), email: "admin@demo.school", role: "admin", school_id: schoolId, full_name: "Demo Admin", password: "admin123", created_at: now },
    { id: crypto.randomUUID(), email: "teacher@demo.school", role: "teacher", school_id: schoolId, full_name: "Demo Teacher", password: "teacher123", created_at: now },
  ]);
  const users = readLocal<UserProfile>(DB.users);
  const adminUserId = users.find((user) => user.role === "admin")?.id || null;
  const basicPlanId = crypto.randomUUID();
  const advancedPlanId = crypto.randomUUID();
  const startAt = new Date();
  const endAt = new Date(startAt);
  endAt.setMonth(endAt.getMonth() + 1);
  writeLocal<SubscriptionPlan>(DB.subscriptionPlans, [
    {
      id: basicPlanId,
      code: "basic",
      name: "Basic",
      description: "Unlimited papers, single variation only.",
      max_paper_sets: 1,
      allow_worksheets: false,
      allow_lesson_plans: false,
      created_at: now,
    },
    {
      id: advancedPlanId,
      code: "advanced",
      name: "Advanced",
      description: "Multiple paper variations with worksheets and lesson plans.",
      max_paper_sets: 10,
      allow_worksheets: true,
      allow_lesson_plans: true,
      created_at: now,
    },
  ]);
  writeLocal<Subscription>(DB.subscriptions, [
    {
      id: crypto.randomUUID(),
      school_id: schoolId,
      plan_id: basicPlanId,
      status: "active",
      starts_at: startAt.toISOString(),
      ends_at: endAt.toISOString(),
      created_by: adminUserId,
      created_at: now,
      updated_at: now,
    },
  ]);
  writeLocal<ClassEntity>(DB.classes, [
    { id: classPunjab5, school_id: schoolId, exam_body_id: punjabBody, name: "Class 5", created_at: now },
    { id: classSindh5, school_id: schoolId, exam_body_id: sindhBody, name: "Class 5", created_at: now },
    { id: classKpk5, school_id: schoolId, exam_body_id: kpkBody, name: "Class 5", created_at: now },
  ]);
  writeLocal<SubjectEntity>(DB.subjects, [
    { id: subjectPunjabSci, class_id: classPunjab5, name: "Science", created_at: now },
    { id: subjectPunjabMath, class_id: classPunjab5, name: "Mathematics", created_at: now },
    { id: subjectSindhSci, class_id: classSindh5, name: "Science", created_at: now },
    { id: subjectKpkSci, class_id: classKpk5, name: "Science", created_at: now },
  ]);
  writeLocal<ChapterEntity>(DB.chapters, [
    { id: ch1, subject_id: subjectPunjabSci, title: "Plants", chapter_number: 1, created_at: now },
    { id: ch2, subject_id: subjectPunjabSci, title: "Human Body", chapter_number: 2, created_at: now },
    { id: ch3, subject_id: subjectPunjabSci, title: "Matter", chapter_number: 3, created_at: now },
  ]);
  writeLocal<TopicEntity>(DB.topics, [
    { id: t11, chapter_id: ch1, title: "Parts of Plants", topic_number: 1, created_at: now },
    { id: t12, chapter_id: ch1, title: "Photosynthesis", topic_number: 2, created_at: now },
    { id: t21, chapter_id: ch2, title: "Digestive System", topic_number: 1, created_at: now },
    { id: t22, chapter_id: ch2, title: "Respiratory System", topic_number: 2, created_at: now },
    { id: t31, chapter_id: ch3, title: "States of Matter", topic_number: 1, created_at: now },
    { id: t32, chapter_id: ch3, title: "Physical Changes", topic_number: 2, created_at: now },
  ]);
  writeLocal<ChapterWeightage>(DB.weightage, [
    { id: crypto.randomUUID(), chapter_id: ch1, exam_type: "monthly", weight_percent: 20 },
    { id: crypto.randomUUID(), chapter_id: ch2, exam_type: "monthly", weight_percent: 40 },
    { id: crypto.randomUUID(), chapter_id: ch3, exam_type: "monthly", weight_percent: 40 },
  ]);

  const difficulties = ["easy", "medium", "hard"] as const;
  const blooms = ["remember", "understand", "apply", "analyze", "evaluate"] as const;
  const types = ["mcq", "true_false", "fill_blanks", "short", "long", "matching", "diagram"] as const;
  const chapterTopicMap: Record<string, string[]> = {
    [ch1]: [t11, t12],
    [ch2]: [t21, t22],
    [ch3]: [t31, t32],
  };
  const questionRows: Question[] = [];
  for (let i = 1; i <= 300; i += 1) {
    const chapterId = [ch1, ch2, ch3][i % 3];
    const topicPool = chapterTopicMap[chapterId] || [];
    const topicId = topicPool.length ? topicPool[i % topicPool.length] : null;
    const t = types[i % types.length];
    const marks = t === "long" ? 5 : t === "short" ? 2 : 1;
    questionRows.push({
      id: crypto.randomUUID(),
      chapter_id: chapterId,
      topic_id: topicId,
      school_id: schoolId,
      question_type: t,
      question_text: `Sample ${t} question ${i}`,
      option_a: "Option A",
      option_b: "Option B",
      option_c: "Option C",
      option_d: "Option D",
      correct_answer: "A",
      difficulty: difficulties[i % 3],
      bloom_level: blooms[i % blooms.length],
      question_level: (["exercise", "additional", "past_papers", "examples", "conceptual"] as const)[i % 5],
      marks,
      explanation: `Marking note for question ${i}`,
      created_at: now,
      diagram_url: t === "diagram" ? "https://picsum.photos/seed/diagram/500/240" : null,
    });
  }
  writeLocal(DB.questions, questionRows);
  writeLocal(DB.blueprints, []);
  writeLocal(DB.papers, []);
  writeLocal(DB.paperQuestions, []);
  writeLocal(DB.usage, []);
  writeLocal(DB.templates, []);
  writeLocal<ContentSource>(DB.contentSources, []);
  writeLocal<ContentChunk>(DB.contentChunks, []);
  writeLocal<GenerationJob>(DB.generationJobs, []);
  writeLocal<GenerationCandidate>(DB.generationCandidates, []);
  writeLocal<Worksheet>(DB.worksheets, []);
  writeLocal<WorksheetItem>(DB.worksheetItems, []);
  writeLocal<LessonPlan>(DB.lessonPlans, []);
  writeLocal<LessonPlanBlock>(DB.lessonPlanBlocks, []);
  writeLocal<PaymentIntent>(DB.paymentIntents, []);
  writeLocal<PaymentEvent>(DB.paymentEvents, []);
  writeLocal<AuditLog>(DB.auditLogs, []);
  ensureTopicStructure();
  ensureScienceChapter2DummyQuestions();
}
