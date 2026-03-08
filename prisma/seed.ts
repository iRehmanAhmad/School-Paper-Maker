import { PrismaClient, Role, QuestionType, Difficulty, ExamType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const passwordHash = await bcrypt.hash("Pass@123", 10);

  const school = await prisma.school.upsert({
    where: { id: "school_demo" },
    update: {},
    create: {
      id: "school_demo",
      name: "ABC Public School",
      subscription: "PREMIUM",
    },
  });

  const superAdmin = await prisma.user.upsert({
    where: { email: "superadmin@papergen.com" },
    update: {},
    create: {
      fullName: "Platform Super Admin",
      email: "superadmin@papergen.com",
      passwordHash,
      role: Role.SUPER_ADMIN,
    },
  });

  const schoolAdmin = await prisma.user.upsert({
    where: { email: "admin@abcschool.com" },
    update: {},
    create: {
      schoolId: school.id,
      fullName: "School Admin",
      email: "admin@abcschool.com",
      passwordHash,
      role: Role.SCHOOL_ADMIN,
    },
  });

  const teacher = await prisma.user.upsert({
    where: { email: "teacher@abcschool.com" },
    update: {},
    create: {
      schoolId: school.id,
      fullName: "Science Teacher",
      email: "teacher@abcschool.com",
      passwordHash,
      role: Role.TEACHER,
    },
  });

  const classFive = await prisma.class.upsert({
    where: { id: "class_5_demo" },
    update: {},
    create: {
      id: "class_5_demo",
      schoolId: school.id,
      name: "Class 5",
    },
  });

  const subject = await prisma.subject.upsert({
    where: { id: "subject_science_demo" },
    update: {},
    create: {
      id: "subject_science_demo",
      classId: classFive.id,
      name: "Science",
    },
  });

  const chapter = await prisma.chapter.upsert({
    where: { id: "chapter_plants_demo" },
    update: {},
    create: {
      id: "chapter_plants_demo",
      subjectId: subject.id,
      title: "Plants",
      chapterNumber: 1,
    },
  });

  const existing = await prisma.question.count({ where: { chapterId: chapter.id } });
  if (existing === 0) {
    await prisma.question.createMany({
      data: [
        {
          schoolId: school.id,
          chapterId: chapter.id,
          questionType: QuestionType.MCQ,
          questionText: "Which part of the plant makes food?",
          optionA: "Root",
          optionB: "Stem",
          optionC: "Leaf",
          optionD: "Flower",
          correctAnswer: "C",
          difficulty: Difficulty.EASY,
          marks: 1,
          explanation: "Leaves make food through photosynthesis.",
        },
        {
          schoolId: school.id,
          chapterId: chapter.id,
          questionType: QuestionType.SHORT,
          questionText: "Write two functions of roots.",
          correctAnswer: "Anchorage and absorption of water/minerals.",
          difficulty: Difficulty.MEDIUM,
          marks: 2,
        },
        {
          schoolId: school.id,
          chapterId: chapter.id,
          questionType: QuestionType.LONG,
          questionText: "Explain photosynthesis with a labeled diagram.",
          correctAnswer: "Definition, process and diagram labels.",
          difficulty: Difficulty.HARD,
          marks: 5,
        },
      ],
    });
  }

  await prisma.paperTemplate.upsert({
    where: { id: "template_monthly_demo" },
    update: {},
    create: {
      id: "template_monthly_demo",
      schoolId: school.id,
      teacherId: teacher.id,
      name: "Monthly Test Template",
      examType: ExamType.MONTHLY,
      classId: classFive.id,
      subjectId: subject.id,
      structureJson: {
        MCQ: 10,
        SHORT: 5,
        LONG: 2,
      },
      difficultyJson: {
        EASY: 40,
        MEDIUM: 40,
        HARD: 20,
      },
      layoutJson: {
        paperSize: "A4",
        orientation: "portrait",
        columns: "single",
      },
    },
  });

  console.log("Seed complete", {
    superAdmin: superAdmin.email,
    schoolAdmin: schoolAdmin.email,
    teacher: teacher.email,
    defaultPassword: "Pass@123",
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });