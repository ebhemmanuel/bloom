import { createContext, useContext, useMemo, useState } from 'react';
import { useData } from './DataContext.jsx';
import { buildBoardModel, periodOptions } from '../domain/selectors.js';
import { todayKey } from '../domain/dates.js';

const BoardContext = createContext(null);

/**
 * Board view state: which date, which periods, what search.
 *
 * Lifted out of <Board> because the Bloom shell splits these controls across two
 * places — search lives in the pill nav, the date picker and period filter live
 * in the board toolbar, and the header shows the roster count. Threading all of
 * that through props would mean passing board internals up into the header.
 */
export function BoardProvider({ children }) {
  const { doc } = useData();

  const [dateKey, setDateKey] = useState(() => todayKey());
  const [periodIds, setPeriodIds] = useState([]);
  const [search, setSearch] = useState('');

  const model = useMemo(
    () => buildBoardModel(doc, { dateKey, periodIds, search }),
    [doc, dateKey, periodIds, search]
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
      model,
      periods,
    }),
    [dateKey, periodIds, search, model, periods]
  );

  return <BoardContext.Provider value={value}>{children}</BoardContext.Provider>;
}

export function useBoard() {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard must be used inside <BoardProvider>');
  return ctx;
}
