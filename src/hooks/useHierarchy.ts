import { useEffect, useMemo, useState } from "react";
import { getClasses, getExamBodies, getSubjects, getChapters } from "@/services/repositories";
import type { ChapterEntity, ClassEntity, ExamBody, SubjectEntity } from "@/types/domain";

export function useHierarchy(schoolId: string | null | undefined) {
    const [examBodies, setExamBodies] = useState<ExamBody[]>([]);
    const [classes, setClasses] = useState<ClassEntity[]>([]);
    const [subjects, setSubjects] = useState<SubjectEntity[]>([]);
    const [chapters, setChapters] = useState<ChapterEntity[]>([]);

    const [examBodyId, setExamBodyId] = useState("");
    const [classId, setClassId] = useState("");
    const [subjectId, setSubjectId] = useState("");
    const [chapterId, setChapterId] = useState("");

    const [loading, setLoading] = useState(false);

    // Load Exam Bodies
    useEffect(() => {
        if (!schoolId) return;
        setLoading(true);
        getExamBodies(schoolId).then((data) => {
            setExamBodies(data);
            if (data.length > 0 && !examBodyId) {
                setExamBodyId(data[0].id);
            }
            setLoading(false);
        });
    }, [schoolId]);

    // Load Classes when Exam Body changes
    useEffect(() => {
        if (!schoolId || !examBodyId) {
            setClasses([]);
            return;
        }
        getClasses(schoolId, examBodyId).then((data) => {
            setClasses(data);
            if (data.length > 0) {
                if (!classId || !data.some(c => c.id === classId)) {
                    setClassId(data[0].id);
                }
            } else {
                setClassId("");
            }
        });
    }, [schoolId, examBodyId]);

    // Load Subjects when Classes change
    useEffect(() => {
        if (classes.length === 0) {
            setSubjects([]);
            return;
        }
        getSubjects(classes.map((c) => c.id)).then((data) => {
            setSubjects(data);
        });
    }, [classes]);

    // Load Chapters when Subjects change
    useEffect(() => {
        if (subjects.length === 0) {
            setChapters([]);
            return;
        }
        getChapters(subjects.map((s) => s.id)).then((data) => {
            setChapters(data);
        });
    }, [subjects]);

    const visibleSubjects = useMemo(() =>
        subjects.filter((s) => !classId || s.class_id === classId),
        [subjects, classId]
    );

    const visibleChapters = useMemo(() =>
        chapters.filter((c) => !subjectId || c.subject_id === subjectId),
        [chapters, subjectId]
    );

    // Sync Subject selection
    useEffect(() => {
        if (visibleSubjects.length > 0) {
            if (!subjectId || !visibleSubjects.some(s => s.id === subjectId)) {
                setSubjectId(visibleSubjects[0].id);
            }
        } else {
            setSubjectId("");
        }
    }, [visibleSubjects, classId]);

    // Sync Chapter selection
    useEffect(() => {
        if (visibleChapters.length > 0) {
            if (!chapterId || !visibleChapters.some(c => c.id === chapterId)) {
                setChapterId(visibleChapters[0].id);
            }
        } else {
            setChapterId("");
        }
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
        loading
    };
}
