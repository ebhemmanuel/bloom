/**
 * What this teacher calls a slot in their day.
 *
 * Elementary teachers do not have periods. Their day is a timeline they own -
 * literacy block, math block, specials - because their class stays with them
 * all day rather than moving on a bell. Calling those "3rd period" on a form a
 * teacher has to sign is the kind of small wrongness that says the tool was
 * built for somebody else's school.
 *
 * PRESENTATION ONLY. Nothing here reaches the record: `periods[]`, `periodIds`
 * and every id keep their names, and a file written by an elementary teacher is
 * byte-identical to one written by a secondary teacher. Swap the words and the
 * same document comes out the other side, which is what makes this safe to get
 * wrong and change later.
 */

/**
 * The grades that make a day into blocks.
 *
 * Sixth is deliberately out. It sits on the line - some districts put it in an
 * elementary school, most put it in a middle school with a bell schedule - and
 * "period" is the term that still reads correctly to someone who uses blocks,
 * where the reverse is not true. Where it is genuinely ambiguous, the more
 * general word is the safer one to print.
 */
const BLOCK_GRADES = new Set(['K', '1', '2', '3', '4', '5']);

export const PERIOD_WORDS = {
  one: 'period',
  One: 'Period',
  many: 'periods',
  Many: 'Periods',
  // The prefix on a lane's chip: P1, P2. See SwimlaneHeader.
  short: 'P',
  all: 'All periods',
};

export const BLOCK_WORDS = {
  one: 'block',
  One: 'Block',
  many: 'blocks',
  Many: 'Blocks',
  short: 'B',
  all: 'All blocks',
};

/**
 * Does this teacher work in blocks?
 *
 * EVERY grade must be an elementary one. A teacher who has both 4th and 7th is
 * working a bell schedule for at least part of their day, and the word that
 * covers both of those is "period".
 *
 * No grades set - which is most of onboarding, and any teacher who skipped the
 * question - answers false. The default has to be the general term, because it
 * is the one that is never actually wrong.
 */
export function usesBlocks(teacher) {
  const grades = teacher?.gradeLevels;
  if (!Array.isArray(grades) || grades.length === 0) return false;
  return grades.every((g) => BLOCK_GRADES.has(String(g)));
}

/**
 * The words to use, for a teacher.
 *
 * Returns the whole set rather than a boolean so callers read as sentences -
 * `words.Many` beats `isElementary ? 'Blocks' : 'Periods'` repeated ninety
 * times, and a caller cannot get the capitalisation wrong in one place only.
 */
export function slotWords(teacher) {
  return usesBlocks(teacher) ? BLOCK_WORDS : PERIOD_WORDS;
}

/**
 * The words for whoever the document belongs to.
 *
 * Reads the ACTIVE teacher, falling back to the first, which is the same rule
 * report.js uses to decide whose name goes in the header. One record, one
 * teacher: see the schema note about why.
 */
export function slotWordsFor(doc) {
  const teacher =
    doc?.teachers?.find((t) => t.id === doc?.settings?.activeTeacherId) ||
    doc?.teachers?.[0] ||
    null;
  return slotWords(teacher);
}
