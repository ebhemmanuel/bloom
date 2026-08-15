import { describe, it, expect } from 'vitest';
import { usesBlocks, slotWords, slotWordsFor, PERIOD_WORDS, BLOCK_WORDS } from './vocabulary.js';

/**
 * These words end up on a printed compliance record, so the rule that picks
 * them is tested like anything else that reaches paper - even though it changes
 * nothing about what is stored.
 */

describe('usesBlocks', () => {
  it('says yes when every grade is elementary', () => {
    expect(usesBlocks({ gradeLevels: ['K'] })).toBe(true);
    expect(usesBlocks({ gradeLevels: ['2', '3'] })).toBe(true);
    expect(usesBlocks({ gradeLevels: ['K', '1', '2', '3', '4', '5'] })).toBe(true);
  });

  it('says no as soon as one grade is not', () => {
    expect(usesBlocks({ gradeLevels: ['6'] })).toBe(false);
    expect(usesBlocks({ gradeLevels: ['9', '10'] })).toBe(false);
    // The mixed case, which is the one worth naming: a teacher with 4th and 7th
    // is on a bell schedule for part of their day, and "period" covers both.
    expect(usesBlocks({ gradeLevels: ['4', '7'] })).toBe(false);
  });

  /*
    The default has to be the general term. "Period" reads correctly to a
    teacher who works in blocks; "block" is simply wrong for one who does not.
  */
  it('falls back to periods when nothing is known', () => {
    expect(usesBlocks(null)).toBe(false);
    expect(usesBlocks({})).toBe(false);
    expect(usesBlocks({ gradeLevels: [] })).toBe(false);
    expect(usesBlocks({ gradeLevels: 'K' })).toBe(false);
  });

  it('does not mind numbers arriving as numbers', () => {
    expect(usesBlocks({ gradeLevels: [1, 2] })).toBe(true);
    expect(usesBlocks({ gradeLevels: [7] })).toBe(false);
  });
});

describe('slotWords', () => {
  it('hands back a whole set, so no caller invents its own capitalisation', () => {
    expect(slotWords({ gradeLevels: ['3'] })).toBe(BLOCK_WORDS);
    expect(slotWords({ gradeLevels: ['8'] })).toBe(PERIOD_WORDS);
    expect(Object.keys(BLOCK_WORDS)).toEqual(Object.keys(PERIOD_WORDS));
  });
});

describe('slotWordsFor', () => {
  const elementary = { id: 't1', gradeLevels: ['2'] };
  const secondary = { id: 't2', gradeLevels: ['9'] };

  it('reads the active teacher', () => {
    const doc = { teachers: [secondary, elementary], settings: { activeTeacherId: 't1' } };
    expect(slotWordsFor(doc)).toBe(BLOCK_WORDS);
  });

  it('falls back to the first teacher, as the report header does', () => {
    expect(slotWordsFor({ teachers: [elementary], settings: {} })).toBe(BLOCK_WORDS);
  });

  it('survives a document with no teacher at all', () => {
    expect(slotWordsFor({})).toBe(PERIOD_WORDS);
    expect(slotWordsFor(null)).toBe(PERIOD_WORDS);
  });
});
