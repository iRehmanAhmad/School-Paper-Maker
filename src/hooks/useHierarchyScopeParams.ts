import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { applyHierarchyScope, clearHierarchyFrom, keepHierarchyTo, normalizeHierarchyScope, readHierarchyScope, type HierarchyScope, type HierarchyScopeKey } from "@/utils/hierarchyScope";

export function useHierarchyScopeParams() {
  const [searchParams, setSearchParams] = useSearchParams();
  const scope = useMemo(() => readHierarchyScope(searchParams), [searchParams]);

  const setScope = useCallback(
    (nextScope: HierarchyScope) => {
      const nextParams = applyHierarchyScope(searchParams, nextScope);
      if (nextParams.toString() !== searchParams.toString()) {
        setSearchParams(nextParams, { replace: true });
      }
    },
    [searchParams, setSearchParams]
  );

  const mergeScope = useCallback(
    (patch: HierarchyScope) => {
      setScope(normalizeHierarchyScope({ ...scope, ...patch }));
    },
    [scope, setScope]
  );

  const clearFrom = useCallback(
    (level: HierarchyScopeKey) => {
      setScope(clearHierarchyFrom(scope, level));
    },
    [scope, setScope]
  );

  const scopeToLevel = useCallback(
    (level: HierarchyScopeKey) => keepHierarchyTo(scope, level),
    [scope]
  );

  return { scope, setScope, mergeScope, clearFrom, scopeToLevel };
}

