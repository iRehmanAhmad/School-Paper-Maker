import { useEffect, useMemo, useState } from "react";
import { getChapters, getClasses, getExamBodies, getSubjects } from "@/services/repositories";
import type { ChapterEntity, ClassEntity, ExamBody, SubjectEntity } from "@/types/domain";
import type { HierarchyScope } from "@/utils/hierarchyScope";

type UseHierarchyOptions = {
  initialScope?: HierarchyScope;
  autoSelectFirst?: boolean;
};

function isSameId(a: string, b?: string) {
  return a === (b || "");
}

export function useHierarchy(schoolId: string | null | undefined, options?: UseHierarchyOptions) {
  const autoSelectFirst = options?.autoSelectFirst ?? true;

  const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
  const [classes, setClasses] = useState<ClassEntity[]>([]);
  const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
  const [chapters, setChapters] = useState<ChapterEntity[]>([]);

  const [examBodyId, setExamBodyIdState] = useState(options?.initialScope?.examBodyId || "");
  const [classId, setClassIdState] = useState(options?.initialScope?.classId || "");
  const [subjectId, setSubjectIdState] = useState(options?.initialScope?.subjectId || "");
  const [chapterId, setChapterIdState] = useState(options?.initialScope?.chapterId || "");

  const [loading, setLoading] = useState(false);

  // Sync internal selection from external scope (URL params)
  useEffect(() => {
    const nextExamBodyId = options?.initialScope?.examBodyId || "";
    const nextClassId = options?.initialScope?.classId || "";
    const nextSubjectId = options?.initialScope?.subjectId || "";
    const nextChapterId = options?.initialScope?.chapterId || "";

    setExamBodyIdState((prev) => (isSameId(prev, nextExamBodyId) ? prev : nextExamBodyId));
    setClassIdState((prev) => (isSameId(prev, nextClassId) ? prev : nextClassId));
    setSubjectIdState((prev) => (isSameId(prev, nextSubjectId) ? prev : nextSubjectId));
    setChapterIdState((prev) => (isSameId(prev, nextChapterId) ? prev : nextChapterId));
  }, [options?.initialScope?.examBodyId, options?.initialScope?.classId, options?.initialScope?.subjectId, options?.initialScope?.chapterId]);

  const setExamBodyId = (nextExamBodyId: string) => {
    setExamBodyIdState(nextExamBodyId);
    setClassIdState("");
    setSubjectIdState("");
    setChapterIdState("");
  };

  const setClassId = (nextClassId: string) => {
    setClassIdState(nextClassId);
    setSubjectIdState("");
    setChapterIdState("");
  };

  const setSubjectId = (nextSubjectId: string) => {
    setSubjectIdState(nextSubjectId);
    setChapterIdState("");
  };

  const setChapterId = (nextChapterId: string) => {
    setChapterIdState(nextChapterId);
  };

  // Load Exam Bodies
  useEffect(() => {
    if (!schoolId) return;
    setLoading(true);
    getExamBodies(schoolId)
      .then((data) => {
        setExamBodies(data);
        if (data.length === 0) {
          setExamBodyIdState("");
          return;
        }
        if (examBodyId && data.some((body) => body.id === examBodyId)) {
          return;
        }
        if (autoSelectFirst) {
          setExamBodyIdState(data[0].id);
        } else {
          setExamBodyIdState("");
        }
      })
      .finally(() => setLoading(false));
  }, [schoolId]);

  // Load Classes when Exam Body changes. Empty exam body means all classes in school.
  useEffect(() => {
    if (!schoolId) {
      setClasses([]);
      return;
    }
    getClasses(schoolId, examBodyId || undefined).then((data) => {
      setClasses(data);
      if (!classId) {
        if (autoSelectFirst && data.length > 0) {
          setClassIdState(data[0].id);
        }
        return;
      }
      if (!data.some((row) => row.id === classId)) {
        setClassIdState(autoSelectFirst && data.length > 0 ? data[0].id : "");
      }
    });
  }, [schoolId, examBodyId]);

  // Load Subjects lazily: only for selected class when available.
  useEffect(() => {
    if (classes.length === 0) {
      setSubjects([]);
      return;
    }
    const targetClassIds = classId ? [classId] : (autoSelectFirst ? classes.slice(0, 1).map((item) => item.id) : []);
    if (!targetClassIds.length) {
      setSubjects([]);
      return;
    }
    getSubjects(targetClassIds).then((data) => {
      setSubjects(data);
    });
  }, [classes, classId, autoSelectFirst]);

  // Load Chapters lazily: only for selected subject when available.
  useEffect(() => {
    if (subjects.length === 0) {
      setChapters([]);
      return;
    }
    const targetSubjectIds = subjectId ? [subjectId] : (autoSelectFirst ? subjects.slice(0, 1).map((item) => item.id) : []);
    if (!targetSubjectIds.length) {
      setChapters([]);
      return;
    }
    getChapters(targetSubjectIds).then((data) => {
      setChapters(data);
    });
  }, [subjects, subjectId, autoSelectFirst]);

  const visibleSubjects = useMemo(() => subjects.filter((item) => !classId || item.class_id === classId), [subjects, classId]);
  const visibleChapters = useMemo(() => chapters.filter((item) => !subjectId || item.subject_id === subjectId), [chapters, subjectId]);

  // Sync subject selection with visible scope.
  useEffect(() => {
    if (visibleSubjects.length === 0) {
      setSubjectIdState("");
      return;
    }
    if (subjectId && visibleSubjects.some((item) => item.id === subjectId)) {
      return;
    }
    setSubjectIdState(autoSelectFirst ? visibleSubjects[0].id : "");
  }, [visibleSubjects, classId]);

  // Sync chapter selection with visible scope.
  useEffect(() => {
    if (visibleChapters.length === 0) {
      setChapterIdState("");
      return;
    }
    if (chapterId && visibleChapters.some((item) => item.id === chapterId)) {
      return;
    }
    setChapterIdState(autoSelectFirst ? visibleChapters[0].id : "");
  }, [visibleChapters, subjectId]);

  return {
    examBodies,
    classes,
    subjects: visibleSubjects,
    chapters: visibleChapters,
    examBodyId,
    setExamBodyId,
    classId,
    setClassId,
    subjectId,
    setSubjectId,
    chapterId,
    setChapterId,
    loading,
  };
}
