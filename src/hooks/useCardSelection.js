import { useCallback, useRef, useState } from 'react';

/**
 * Multi-select for cards.
 *
 * Ctrl/Cmd+click toggles one; Shift+click extends a range within the same
 * column; a plain click clears.
 *
 * Selection is scoped to ONE student - selecting in another lane resets it.
 * That is a correctness guard, not a convenience: a bulk move that silently
 * spanned two students would write one child's record onto another's, and
 * nothing about the gesture would have warned you.
 */
export default function useCardSelection() {
  const [selection, setSelection] = useState({ studentId: null, ids: new Set() });
  const anchorRef = useRef(null);

  const clear = useCallback(() => {
    anchorRef.current = null;
    setSelection({ studentId: null, ids: new Set() });
  }, []);

  /**
   * @param card       the clicked card
   * @param event      the click event (reads ctrlKey/metaKey/shiftKey)
   * @param columnIds  assignment ids in that column, in visual order
   * @returns true if the click was a selection gesture and should not fall
   *          through to the card's normal click behaviour
   */
  const handleClick = useCallback(
    (card, event, columnIds) => {
      const additive = event.ctrlKey || event.metaKey;
      const ranged = event.shiftKey;

      if (!additive && !ranged) {
        clear();
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      setSelection((prev) => {
        // A different student resets rather than extends.
        const base = prev.studentId === card.studentId ? new Set(prev.ids) : new Set();

        if (ranged && anchorRef.current && columnIds.includes(anchorRef.current)) {
          const from = columnIds.indexOf(anchorRef.current);
          const to = columnIds.indexOf(card.assignmentId);
          if (from !== -1 && to !== -1) {
            const [lo, hi] = from < to ? [from, to] : [to, from];
            for (let i = lo; i <= hi; i += 1) base.add(columnIds[i]);
            return { studentId: card.studentId, ids: base };
          }
        }

        if (base.has(card.assignmentId)) base.delete(card.assignmentId);
        else base.add(card.assignmentId);

        anchorRef.current = card.assignmentId;
        return { studentId: card.studentId, ids: base };
      });

      return true;
    },
    [clear]
  );

  const isSelected = useCallback(
    (card) => selection.studentId === card.studentId && selection.ids.has(card.assignmentId),
    [selection]
  );

  return {
    selection,
    selectedIds: selection.ids,
    selectionCount: selection.ids.size,
    isSelected,
    handleClick,
    clear,
  };
}
