import { useCallback, useEffect, useState } from 'react';

const KEY = 'acc-lane-sort';

/**
 * Which way the roster is sorted, A to Z or Z to A.
 *
 * localStorage, NOT data.json, for the same reason folded lanes live there: the
 * file is a compliance record, and which end of the alphabet a teacher likes to
 * start from has no business in an audited document.
 *
 * It persists rather than resetting each launch because it is a habit, not a
 * mood. A teacher who works bottom-up does it every day.
 */
export default function useLaneSort() {
  const [sort, setSort] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'za' ? 'za' : 'az';
    } catch {
      return 'az';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, sort);
    } catch {
      /* private mode or quota. A lost preference is not worth surfacing. */
    }
  }, [sort]);

  const toggle = useCallback(() => setSort((s) => (s === 'az' ? 'za' : 'az')), []);

  return { sort, toggle };
}
