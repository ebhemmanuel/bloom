import { createContext, useContext, useMemo, useState } from 'react';
import { useData } from './DataContext.jsx';
import { buildBoardModel, periodOptions } from '../domain/selectors.js';
import { buildReport } from '../domain/report.js';
import { todayKey } from '../domain/dates.js';
import useLaneSort from '../hooks/useLaneSort.js';

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
  const { doc } = useData();

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

  const model = useMemo(
    () => buildBoardModel(doc, { dateKey, periodIds, search, sort }),
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
