export type HierarchyScopeKey = "examBodyId" | "classId" | "subjectId" | "chapterId";

export type HierarchyScope = {
  examBodyId?: string;
  classId?: string;
  subjectId?: string;
  chapterId?: string;
};

const hierarchyKeys: HierarchyScopeKey[] = ["examBodyId", "classId", "subjectId", "chapterId"];

function clean(value?: string) {
  const next = value?.trim() ?? "";
  return next || undefined;
}

export function normalizeHierarchyScope(scope: HierarchyScope) {
  const examBodyId = clean(scope.examBodyId);
  const classId = examBodyId ? clean(scope.classId) : undefined;
  const subjectId = classId ? clean(scope.subjectId) : undefined;
  const chapterId = subjectId ? clean(scope.chapterId) : undefined;
  return { examBodyId, classId, subjectId, chapterId };
}

export function readHierarchyScope(params: URLSearchParams) {
  return normalizeHierarchyScope({
    examBodyId: params.get("examBodyId") || undefined,
    classId: params.get("classId") || undefined,
    subjectId: params.get("subjectId") || undefined,
    chapterId: params.get("chapterId") || undefined,
  });
}

export function applyHierarchyScope(params: URLSearchParams, scope: HierarchyScope) {
  const normalized = normalizeHierarchyScope(scope);
  const next = new URLSearchParams(params);
  hierarchyKeys.forEach((key) => {
    const value = normalized[key];
    if (value) {
      next.set(key, value);
    } else {
      next.delete(key);
    }
  });
  return next;
}

export function hierarchyScopeToSearch(scope: HierarchyScope) {
  const params = applyHierarchyScope(new URLSearchParams(), scope);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function clearHierarchyFrom(scope: HierarchyScope, from: HierarchyScopeKey) {
  const normalized = normalizeHierarchyScope(scope);
  const fromIndex = hierarchyKeys.indexOf(from);
  const next: HierarchyScope = {};
  hierarchyKeys.forEach((key, idx) => {
    if (idx < fromIndex) {
      next[key] = normalized[key];
    }
  });
  return normalizeHierarchyScope(next);
}

export function keepHierarchyTo(scope: HierarchyScope, level: HierarchyScopeKey) {
  const normalized = normalizeHierarchyScope(scope);
  const maxIndex = hierarchyKeys.indexOf(level);
  const next: HierarchyScope = {};
  hierarchyKeys.forEach((key, idx) => {
    if (idx <= maxIndex) {
      next[key] = normalized[key];
    }
  });
  return normalizeHierarchyScope(next);
}
