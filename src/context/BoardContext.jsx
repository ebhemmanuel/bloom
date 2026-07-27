import { createContext, useContext, useMemo, useState } from 'react';
import { useData } from './DataContext.jsx';
import { buildBoardModel, periodOptions } from '../domain/selectors.js';
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
  const { sort, toggle: toggleSort } = useLaneSort();

  const model = useMemo(
    () => buildBoardModel(doc, { dateKey, periodIds, search, sort }),
    [doc, dateKey, periodIds, search, sort]
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
      model,
      periods,
    }),
    [dateKey, periodIds, search, sort, toggleSort, model, periods]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be used inside <BoardProvider>');
  return ctx;
}
