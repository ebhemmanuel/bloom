import { createContext, useContext, useCallback, useMemo, useState } from 'react';
import { useData } from './DataContext.jsx';
import { buildBoardModel, periodOptions } from '../domain/selectors.js';
import { buildReport } from '../domain/report.js';
import { backfillDays, backfillRange } from '../domain/seed.js';
import { touchLastKnownDate } from '../domain/mutations.js';
import { todayKey } from '../domain/dates.js';
import useLaneSort from '../hooks/useLaneSort.js';
import useDayRollover from '../hooks/useDayRollover.js';

const BoardContext = createContext(null);

/**
 * Board view state: which date, which periods, what search.
 *
 * Lifted out of <Board> because the Bloom shell splits these controls across two
 * places - search lives in the pill nav, the date picker and period filter live
 * in the board toolbar, and the header shows the roster count. Threading all of
 * that through props would mean passing board internals up into the header.
 */
export function BoardProvider({ children }) {
  const { doc, mutate, readOnly } = useData();

  const [dateKey, setDateKey] = useState(() => todayKey());
  const [periodIds, setPeriodIds] = useState([]);
  const [search, setSearch] = useState('');
  /**
   * A span of days to look at instead of one, or null for the ordinary board.
   *
   * The kanban answers "what happened today". A range answers a different
   * question - "what happened across these days" - and no arrangement of
   * columns answers both, so picking a range switches the surface rather than
   * filtering the one that is already there.
   */
  const [range, setRange] = useState(null);
  const { sort, toggle: toggleSort } = useLaneSort();

  /**
   * Midnight, on a running app: lay out the new day and move onto it.
   *
   * This is exactly what a fresh launch does, and that is the point - leaving
   * the app open overnight has to leave the record in the same state as closing
   * and reopening it would. `backfillDays` rather than a bare `ensureDay` for
   * that reason: it stamps the new day `backfilled`, which is what makes an
   * untouched entry resolve as `no_record` instead of hardening into `not_used`
   * at the end of a day nobody worked. Creating the day the direct way would
   * have quietly given an overnight session different compliance semantics from
   * a restarted one, which is the worst kind of difference to ship.
   *
   * It runs the whole term range, not just the one day, so a machine that slept
   * through a long weekend comes back with all of it laid out. Existing days are
   * never touched, so the pass is idempotent and cheap.
   *
   * Sealing is deliberately left to startup. It stamps documented non-delivery
   * on every unassigned entry, and the difference here is only WHEN a day that
   * is already over gets sealed, never whether - so it stays on the path that
   * already checks the clock has not moved backwards.
   */
  const onRollover = useCallback(
    (today, previous) => {
      if (!readOnly) {
        mutate((d) => {
          // `span`, not `range`: the state above is the date-range FILTER, and
          // shadowing it here would read as the two being related.
          const span = backfillRange(d);
          const filled = span ? backfillDays(d, span).doc : d;
          return touchLastKnownDate(filled, today);
        });
      }

      // Follow the clock ONLY if the board was sitting on the day that just
      // ended. A teacher who deliberately opened a Tuesday in September is
      // reading history, and yanking them to today at midnight would take the
      // page away mid-sentence.
      setDateKey((current) => (current === previous ? today : current));
    },
    [mutate, readOnly]
  );

  useDayRollover(onRollover);

  const model = useMemo(
    // Always grouped by period: the board is read class by class, so that is
    // the order it opens in rather than a toggle nobody should turn off.
    () => buildBoardModel(doc, { dateKey, periodIds, search, sort, sortBy: 'period' }),
    [doc, dateKey, periodIds, search, sort]
  );

  /**
   * The range view reuses `buildReport`, deliberately.
   *
   * It already produces exactly this shape: a row per accommodation, a cell per
   * date, resolved through `effectiveStatus`. Reusing it means the screen and
   * the printed report cannot drift apart, which on a compliance record is the
   * whole game.
   */
  const rangeModel = useMemo(
    () =>
      range
        ? buildReport(doc, {
            scope: { kind: 'range', from: range.from, to: range.to },
            periodIds,
            search,
          })
        : null,
    [doc, range, periodIds, search]
  );

  const periods = useMemo(() => periodOptions(doc), [doc]);

  const value = useMemo(
    () => ({
      dateKey,
      setDateKey,
      periodIds,
      setPeriodIds,
      search,
      setSearch,
      sort,
      toggleSort,
      range,
      setRange,
      rangeModel,
      model,
      periods,
    }),
    [dateKey, periodIds, search, sort, toggleSort, range, rangeModel, model, periods]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be used inside <BoardProvider>');
  return ctx;
}
