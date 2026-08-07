import { useCallback, useEffect, useState } from 'react';

const KEY = 'acc-lane-sort';

/**
 * Which way round the roster runs.
 *
 * Grouping BY PERIOD is no longer a question. It used to be a toggle in the
 * toolbar - the P# button - off by default, and it was the right answer nearly
 * every time: a teacher works their day period by period, so a board that opens
 * as one alphabetical list of thirty is a list they have to re-sort before it
 * matches the room they are standing in. A control that everyone should leave
 * on is a control nobody needed, so the grouping is simply how the board is
 * ordered and the button is gone. See `sortBy` in `buildBoardModel`.
 *
 * The direction stays a real choice: someone who wants their last class first
 * still has an opinion, and it costs one small button to answer it.
 *
 * localStorage, NOT data.json, for the same reason folded lanes live there: the
 * file is a compliance record, and how a teacher likes their list arranged has
 * no business in an audited document.
 *
 * It persists rather than resetting each launch because it is a habit, not a
 * mood.
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
