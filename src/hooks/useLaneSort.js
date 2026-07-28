import { useCallback, useEffect, useState } from 'react';

const KEY = 'acc-lane-sort';
const BY_KEY = 'acc-lane-sort-by';

/**
 * How the roster is ordered: by what, and which way round.
 *
 * Two independent controls rather than one three-state cycle. "Group by period"
 * and "which end of the alphabet" are different questions - a teacher who wants
 * their P1 class first still has an opinion about A-Z inside it - and folding
 * them into one button would make each answer cost the other.
 *
 * localStorage, NOT data.json, for the same reason folded lanes live there: the
 * file is a compliance record, and how a teacher likes their list arranged has
 * no business in an audited document.
 *
 * It persists rather than resetting each launch because it is a habit, not a
 * mood. A teacher who works period by period does it every day.
 */
export default function useLaneSort() {
  const [sort, setSort] = useState(() => {
    try {
      return localStorage.getItem(KEY) === 'za' ? 'za' : 'az';
    } catch {
      return 'az';
    }
  });

  const [sortBy, setSortBy] = useState(() => {
    try {
      return localStorage.getItem(BY_KEY) === 'period' ? 'period' : 'name';
    } catch {
      return 'name';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(KEY, sort);
      localStorage.setItem(BY_KEY, sortBy);
    } catch {
      /* private mode or quota. A lost preference is not worth surfacing. */
    }
  }, [sort, sortBy]);

  const toggle = useCallback(() => setSort((s) => (s === 'az' ? 'za' : 'az')), []);
  const toggleSortBy = useCallback(
    () => setSortBy((b) => (b === 'period' ? 'name' : 'period')),
    []
  );

  return { sort, toggle, sortBy, toggleSortBy };
}
