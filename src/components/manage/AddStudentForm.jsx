import { useMemo, useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import {
  resolveAccommodationList,
  addStudentWithAccommodations,
  splitStudentNames,
} from '../../domain/importStudent.js';
import { itemsForSet, STARTER_SETS } from '../../domain/starterSets.js';
import { PLAN_TYPES } from '../../domain/constants.js';
import { periodOptions } from '../../domain/selectors.js';
import { ensureDay, backfillDays, backfillRange } from '../../domain/seed.js';
import { todayKey, formatDateMedium } from '../../domain/dates.js';
import { useBoard } from '../../context/BoardContext.jsx';

/**
 * Add one student and their whole accommodation list in a single pass.
 *
 * Three ways in, because a teacher's source material varies:
 *   1. Paste from the IEP spreadsheet — the realistic bulk path.
 *   2. Pick from starter sets we ship.
 *   3. Type one at a time.
 *
 * Whatever the route, accommodations reuse an existing catalog entry when the
 * wording matches, so the catalog does not fill up with near-duplicates.
 */
export default function AddStudentForm({ onAdded }) {
  const { doc, mutate } = useData();
  const { dateKey } = useBoard();
  const periods = useMemo(() => periodOptions(doc), [doc]);

  const [displayName, setDisplayName] = useState('');
  const [planType, setPlanType] = useState('IEP');
  const [periodIds, setPeriodIds] = useState([]);
  // Blank means "has been here since the start of the year", which is the common
  // case and the one that needs no explanation on a report.
  const [enrolledFrom, setEnrolledFrom] = useState('');
  const [paste, setPaste] = useState('');
  const [picked, setPicked] = useState([]);
  const [openSet, setOpenSet] = useState(null);
  const [result, setResult] = useState(null);

  // Live preview of what the paste will produce, so nothing is a surprise.
  const parsed = useMemo(() => resolveAccommodationList(paste, doc.catalog), [paste, doc.catalog]);

  // Starter picks that the paste already covers are dropped, so choosing both
  // routes cannot double up.
  const combined = useMemo(() => {
    const seen = new Set(parsed.items.map((i) => i.label.toLowerCase()));
    const extra = picked.filter((p) => !seen.has(p.label.toLowerCase()));
    return [...parsed.items, ...extra];
  }, [parsed.items, picked]);

  /**
   * One field, one or many students.
   *
   * A teacher setting up in September has their roster in front of them, and the
   * natural thing to do is paste the column. Splitting here means that produces
   * a roster; without it, it produced one student whose name was the whole list.
   * Everything else on the form — plan type, periods, enrolment date and the
   * accommodations — applies to all of them, which is exactly right for a class
   * being set up in one go and is editable per student afterwards.
   */
  const names = useMemo(() => splitStudentNames(displayName), [displayName]);

  const canSubmit = names.length > 0 && combined.length > 0;

  const togglePick = (item) => {
    setPicked((prev) =>
      prev.some((p) => p.label === item.label)
        ? prev.filter((p) => p.label !== item.label)
        : [...prev, item]
    );
  };

  const toggleSetAll = (setId) => {
    const items = itemsForSet(setId);
    const allPicked = items.every((i) => picked.some((p) => p.label === i.label));
    setPicked((prev) => {
      const without = prev.filter((p) => !items.some((i) => i.label === p.label));
      return allPicked ? without : [...without, ...items];
    });
  };

  const submit = () => {
    if (!canSubmit) return;
    let report = null;
    mutate((d) => {
      let next = d;
      for (const name of names) {
        const outcome = addStudentWithAccommodations(next, {
          displayName: name,
          planType,
          periodIds,
          enrolledFrom: enrolledFrom || null,
          accommodations: combined,
        });
        next = outcome.doc;
        // Every student gets the same list, so one report describes them all.
        report = outcome.report;
      }

      // Lay out every school day these students are entitled to, from whenever
      // they joined through today. Without this a teacher adding their roster in
      // November would have a board for today and nothing behind it.
      const range = backfillRange(next);
      const filled = range
        ? backfillDays(next, {
            from: enrolledFrom && enrolledFrom > range.from ? enrolledFrom : range.from,
            to: range.to,
          }).doc
        : next;

      // Seed them into the day on screen. Without this a student appears on the
      // board but has no entries in the day record, so every card silently
      // refuses to move — the mutation finds nothing to update.
      return ensureDay(filled, dateKey);
    });

    setResult({ names, report });
    setDisplayName('');
    setPeriodIds([]);
    setEnrolledFrom('');
    setPaste('');
    setPicked([]);
    setOpenSet(null);
    onAdded?.();
  };

  return (
    <section className="acc-addstudent">
      <div className="acc-addstudent__identity">
        <label className="acc-field">
          <span className="acc-field__label">
            {names.length > 1
              ? `What should these ${names.length} students be called?`
              : 'What should this student be called?'}
          </span>
          <input
            className="acc-field__input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="J. Alvarez, or JA, or Student 4"
          />
          <span className="acc-field__hint">
            Whatever you&rsquo;ll recognise on the board and on a printed report. Initials or a code
            work fine — the file does not need a full legal name. Paste a whole list, separated by
            commas or one per line, to add them together.
          </span>
        </label>

        {names.length > 1 && (
          <div className="acc-preview acc-fade-enter">
            <p className="acc-preview__summary">
              {names.length} students, each getting everything set below
            </p>
            <div className="acc-chipset">
              {names.map((n) => (
                <span key={n} className="acc-chip acc-chip--on">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="acc-field-row acc-field-row--80-20">
          <label className="acc-field">
            <span className="acc-field__label">Newly enrolled?</span>
            <input
              type="date"
              className="acc-field__input acc-field__input--date"
              value={enrolledFrom}
              min={doc.schoolCalendar?.termStart || undefined}
              max={todayKey()}
              onChange={(e) => setEnrolledFrom(e.target.value)}
              aria-label="First day in this class"
            />
          </label>

          <label className="acc-field">
            <span className="acc-field__label">Plan</span>
            <select
              className="acc-field__input"
              value={planType}
              onChange={(e) => setPlanType(e.target.value)}
            >
              {PLAN_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </div>

        <span className="acc-field__hint">
          {enrolledFrom
            ? `Every day before ${formatDateMedium(enrolledFrom)} stays locked and reads “not applicable — enrolled ${formatDateMedium(enrolledFrom)}”, so nothing is ever recorded against them for a class they were not in yet.`
            : 'Leave the date blank if they have been in this class since the start of the year. Set one and everything before it is locked, with the reason on the record.'}
        </span>

        <div className="acc-field">
          <span className="acc-field__label">Which periods?</span>
          {periods.length > 0 ? (
            <>
              <div className="acc-chipset">
                {periods.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`acc-chip${periodIds.includes(p.id) ? ' acc-chip--on' : ''}`}
                    onClick={() =>
                      setPeriodIds((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]
                      )
                    }
                    aria-pressed={periodIds.includes(p.id)}
                    title={p.name}
                  >
                    {p.shortName}
                  </button>
                ))}
              </div>
              {/* Multi-select, and not a short list: a student can sit in as
                  many of a teacher's sections as they actually attend. */}
              <span className="acc-field__hint">Pick as many as this student is in.</span>
            </>
          ) : (
            // Previously this whole block was hidden when no periods existed,
            // which left no sign that periods were a thing at all.
            <span className="acc-field__hint">
              No periods yet — add them from the periods menu above the board, then come back and
              assign them here.
            </span>
          )}
        </div>
      </div>

      <div className="acc-addstudent__accoms">
        <label className="acc-field">
          <span className="acc-field__label">Paste their accommodations</span>
          <textarea
            className="acc-field__input acc-paste"
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={
              'Copy the accommodation cells straight out of the IEP spreadsheet and paste here.\n\n' +
              'One per line, or separated by commas.'
            }
          />
          <span className="acc-field__hint">
            Commas inside brackets are safe — “Preferential seating (front, near instruction)” stays
            in one piece.
          </span>
        </label>

        {paste.trim() && (
          <div className="acc-preview">
            <p className="acc-preview__summary">
              {parsed.items.length} accommodation{parsed.items.length === 1 ? '' : 's'} found
              {parsed.duplicates.length > 0 && `, ${parsed.duplicates.length} duplicate skipped`}
            </p>
            <ul className="acc-preview__list">
              {parsed.items.map((item) => (
                <li key={item.label} className="acc-preview__item">
                  <span className="acc-preview__label">{item.label}</span>
                  <span
                    className={`acc-preview__tag acc-preview__tag--${item.isNew ? 'new' : 'reuse'}`}
                  >
                    {item.isNew ? 'New' : 'Already in your list'}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="acc-starters">
          <p className="acc-field__label">Or add from a starter set</p>
          <p className="acc-field__hint">
            Common wordings to get going. Edit them to match what the student's plan actually says —
            the plan is what counts, not our phrasing.
          </p>

          {STARTER_SETS.map((set) => {
            const items = itemsForSet(set.id);
            const chosen = items.filter((i) => picked.some((p) => p.label === i.label)).length;
            const isOpen = openSet === set.id;

            return (
              <div key={set.id} className="acc-starter">
                <button
                  type="button"
                  className="acc-starter__head"
                  onClick={() => setOpenSet(isOpen ? null : set.id)}
                  aria-expanded={isOpen}
                >
                  <span className="acc-starter__name">{set.label}</span>
                  <span className="acc-starter__hint">{set.hint}</span>
                  {chosen > 0 && <span className="acc-starter__badge acc-numeric">{chosen}</span>}
                  <span className="acc-starter__chevron">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <div className="acc-starter__body">
                    <button
                      type="button"
                      className="acc-btn acc-btn--small acc-btn--quiet"
                      onClick={() => toggleSetAll(set.id)}
                    >
                      {chosen === items.length ? 'Clear all' : 'Select all'}
                    </button>
                    <div className="acc-chipset">
                      {items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          className={`acc-chip${
                            picked.some((p) => p.label === item.label) ? ' acc-chip--on' : ''
                          }`}
                          onClick={() => togglePick(item)}
                          aria-pressed={picked.some((p) => p.label === item.label)}
                        >
                          {item.label}
                          {item.requiresDetail && <span className="acc-chip__count">detail</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <footer className="acc-addstudent__footer">
        <span className="acc-addstudent__count">
          {combined.length > 0
            ? `${combined.length} accommodation${combined.length === 1 ? '' : 's'} ready`
            : 'No accommodations chosen yet'}
        </span>
        <button
          type="button"
          className="acc-btn acc-btn--primary"
          onClick={submit}
          disabled={!canSubmit}
        >
          {names.length > 1 ? `Add ${names.length} students` : 'Add student'}
        </button>
      </footer>

      {result && (
        <p className="acc-addstudent__result acc-fade-enter" role="status">
          Added <strong>{result.names.join(', ')}</strong>
          {result.names.length > 1 ? ' — each' : ''} with {result.report.added} accommodation
          {result.report.added === 1 ? '' : 's'}
          {result.report.reused > 0 && ` (${result.report.reused} reused from your list)`}.
        </p>
      )}
    </section>
  );
}
