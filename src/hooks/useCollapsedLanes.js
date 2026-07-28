import { useCallback, useEffect, useState } from 'react';

const KEY = 'acc-collapsed-lanes';

/**
 * Which swimlanes are folded.
 *
 * Deliberately stored in localStorage, NOT in data.json. That file is the
 * compliance record; whether a teacher likes a lane folded is a UI preference
 * and has no business in an audited document.
 *
 * Keyed by student id rather than by date - a teacher who folds a lane means
 * "keep this folded", not "keep it folded on 16 September".
 */
export default function useCollapsedLanes() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const raw = localStorage.getItem(KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify([...collapsed]));
    } catch {
      /* private mode or quota - a lost preference is not worth surfacing */
    }
  }, [collapsed]);

  const toggle = useCallback((studentId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }, []);

  /** Fold or unfold one lane regardless of where it currently stands. */
  const setLane = useCallback((studentId, isCollapsed) => {
    setCollapsed((prev) => {
      if (prev.has(studentId) === isCollapsed) return prev;
      const next = new Set(prev);
      if (isCollapsed) next.add(studentId);
      else next.delete(studentId);
      return next;
    });
  }, []);

  const collapseAll = useCallback((ids) => setCollapsed(new Set(ids)), []);
  const expandAll = useCallback(() => setCollapsed(new Set()), []);

  return { collapsed, toggle, setLane, collapseAll, expandAll };
}
