import { useMemo } from 'react';
import { useData } from '../context/DataContext.jsx';
import { slotWordsFor } from '../domain/vocabulary.js';

/**
 * "Period" or "block", for whoever this record belongs to.
 *
 * A hook rather than a prop threaded through the tree, because almost every
 * screen says the word once and nothing else about the vocabulary: passing it
 * down would put a parameter on a dozen components that otherwise have no
 * opinion about it.
 *
 * Presentation only. See domain/vocabulary.js - the stored document is
 * identical either way.
 */
export default function useSlotWords() {
  const { doc } = useData();
  return useMemo(() => slotWordsFor(doc), [doc]);
}
