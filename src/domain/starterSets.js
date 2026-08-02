/**
 * Starter accommodation sets shipped with the app.
 *
 * These are the wordings that recur across most districts, so a teacher can get a
 * usable board without typing anything. They are a STARTING POINT, not a
 * standard: the authoritative wording is whatever the student's own IEP or 504
 * plan says, and a teacher should edit to match it. The UI says so.
 *
 * `[label, category, requiresDetail]`
 */

export const STARTER_SETS = [
  {
    id: 'presentation',
    label: 'Presentation & instruction',
    hint: 'How material reaches the student',
    items: [
      ['Text read aloud', 'presentation', true],
      ['Directions read aloud and restated', 'presentation', false],
      ['Copy of teacher notes / guided notes', 'presentation', false],
      ['Visual supports and graphic organisers', 'presentation', false],
      ['Chunked instructions (one step at a time)', 'presentation', false],
      ['Check for understanding', 'presentation', false],
    ],
  },
  {
    id: 'timing',
    label: 'Timing & scheduling',
    hint: 'Extra time, breaks, pacing',
    items: [
      ['Extended time (1.5x) on assessments', 'timing', false],
      ['Extended time (2x) on assessments', 'timing', false],
      ['Extended time on assignments', 'timing', false],
      ['Frequent breaks', 'timing', false],
      ['Assessment split across sessions', 'timing', true],
    ],
  },
  {
    id: 'setting',
    label: 'Setting',
    hint: 'Where the student works',
    items: [
      ['Preferential seating (front, near instruction)', 'setting', false],
      ['Small-group testing', 'setting', false],
      ['Separate setting, reduced distraction', 'setting', false],
      ['Testing in a familiar room with a familiar adult', 'setting', false],
    ],
  },
  {
    id: 'response',
    label: 'Response',
    hint: 'How the student shows what they know',
    items: [
      ['Answers may be dictated to a scribe', 'response', true],
      ['Word processor permitted for written work', 'response', false],
      ['Calculator permitted', 'response', false],
      ['Reduced-item assignments', 'response', true],
      ['Oral response instead of written', 'response', true],
      ['Spelling not penalised', 'response', false],
    ],
  },
  {
    id: 'behavior',
    label: 'Behaviour & regulation',
    hint: 'Self-regulation and support',
    items: [
      ['Sensory break pass', 'behavior', true],
      ['Movement breaks', 'behavior', false],
      ['Advance warning of transitions', 'behavior', false],
      ['Access to a calming space', 'behavior', true],
      ['Daily check-in / check-out', 'behavior', false],
    ],
  },
  {
    id: 'assistive',
    label: 'Assistive technology',
    hint: 'Tools and software',
    items: [
      ['Text-to-speech software', 'presentation', false],
      ['Speech-to-text software', 'response', false],
      ['Audio recording of lessons permitted', 'presentation', false],
      ['Enlarged print / adjusted contrast', 'presentation', false],
    ],
  },
];

/** Flattened `{label, category, requiresDetail}` for a set id. */
export function itemsForSet(setId) {
  const set = STARTER_SETS.find((s) => s.id === setId);
  if (!set) return [];
  return set.items.map(([label, category, requiresDetail]) => ({
    label,
    category,
    requiresDetail,
  }));
}

export function allStarterItems() {
  return STARTER_SETS.flatMap((s) => itemsForSet(s.id));
}

/**
 * A chosen label, back to the wording it came from.
 *
 * Starter wordings carry a `requiresDetail` flag the picker does not show. A
 * student who gets "Text read aloud" needs a written detail each day, and that
 * obligation comes from the accommodation rather than from anything the teacher
 * clicked. Anything not on the list is the teacher's own words, which is a
 * perfectly good accommodation and carries no such flag.
 */
export function resolveStarterItem(label) {
  const match = allStarterItems().find((i) => i.label === label);
  return match || { label, category: 'other', requiresDetail: false };
}
