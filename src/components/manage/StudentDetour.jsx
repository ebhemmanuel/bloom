import { useState } from 'react';
import { formatDateMedium } from '../../domain/dates.js';
import { planClassOf } from '../../domain/constants.js';
import { initialsOf } from '../../domain/initials.js';
import { itemsForSet, resolveStarterItem } from '../../domain/starterSets.js';
import { resolveAccommodationList } from '../../domain/importStudent.js';
import AccommodationChooser from './AccommodationChooser.jsx';
import DateField from '../shared/DateField.jsx';

export const DETOUR_STEPS = 3;

/**
 * The supports pane, offering the same two routes every other one does.
 *
 * It used to drop straight into the starter sets, so the only way into a
 * student's list from their own row was to tick wordings - the paste route,
 * which is the one a teacher with the IEP open in front of them actually wants,
 * was not on the screen at all.
 *
 * Writes THROUGH rather than staging. This pane is reached from a row and left
 * by a button that means "done with this student", so there is nothing to hold:
 * a tick is a change to them, immediately, and the caller owns the list.
 *
 * Which route is open belongs to the CALLER, though. The way out of a route is
 * the footer's left-hand button, the footer belongs to the caller, and a button
 * cannot say "choose a different way" about a state it cannot see.
 */
function DetourSupports({ student, catalog, mode, paste, onPaste, pasteReplaces, onToggle }) {
  const [openSet, setOpenSet] = useState(null);

  const picked = student.accoms.map(resolveStarterItem);
  const parsed = resolveAccommodationList(paste, catalog);

  /** Select all / Clear all, flipping only the ones that need it. */
  const toggleSet = (setId) => {
    const items = itemsForSet(setId);
    const allPicked = items.every((i) => student.accoms.includes(i.label));
    items.forEach((i) => {
      const has = student.accoms.includes(i.label);
      if (allPicked ? has : !has) onToggle(i.label);
    });
  };

  return (
    <>
      {/*
        No "Add these to Rex" button underneath. This pane used to need one,
        because it writes through where everywhere else stages - but the footer
        already has a button that means "I am done with this list", and asking
        the teacher to press Add and then press Continue made the first one look
        like the only one that counted. Continue commits the parse now; see
        `commitDetourPaste`.
      */}
      <AccommodationChooser
        mode={mode}
        paste={paste}
        onPaste={onPaste}
        parsed={parsed}
        picked={picked}
        hidePicked={pasteReplaces}
        onTogglePick={(item) => onToggle(item.label)}
        onToggleSet={toggleSet}
        openSet={openSet}
        onOpenSet={setOpenSet}
      />
    </>
  );
}

/**
 * What Continue does with a list still sitting in the paste box.
 *
 * Called by the CALLER's footer, because the footer is the caller's. A teacher
 * who has pasted an IEP into the box and moves on plainly means to keep it -
 * dropping it silently would be the app deciding they had not finished typing.
 *
 * Returns how many it added, so a caller can tell "there was a parse to commit"
 * from "there was nothing there".
 */
export function commitDetourPaste({ paste, catalog = [], onAddCustom }) {
  const items = resolveAccommodationList(paste, catalog).items;
  items.forEach((i) => onAddCustom(i.label));
  return items.length;
}

/**
 * One student, described on their own: class details, supports, confirm.
 *
 * What "Choose supports" opens. It used to be the accommodation list and
 * nothing else, which left the two facts most likely to differ per student -
 * which class they sit in, and when they joined it - answerable only for the
 * whole group. The shared screens still exist for the group; this is the same
 * three questions asked about one person.
 *
 * Three panes, no frame. Setup gives it a screen and the add-student sheet
 * shows it in place of the name pane, so each caller owns its own footer and
 * passes the pane it wants. `detourTip` and `detourLabel` keep those footers
 * saying the same thing.
 *
 * @param {object} props
 * @param {{id: string, name: string, plan: string, periodKeys: Array<string|number>, enrolledFrom: string, accoms: string[]}} props.student
 * @param {Array<{key: string|number, label: string, title: string}>} props.periods
 */
export default function StudentDetour({
  sub,
  student,
  periods = [],
  catalog = [],
  // What "no date of their own" means, said as the date it is.
  sinceLabel = 'Start of year',
  mode = 'paste',
  // The paste box's text, held by the caller so its Continue can commit it,
  // and whether it is holding their own list for editing rather than additions.
  paste = '',
  onPaste,
  pasteReplaces = false,
  // Jump straight to one of the panes behind the confirm, so the summary is a
  // way back into what it summarises.
  onJump,
  onTogglePeriod,
  onEnrolledFrom,
  onToggle,
}) {
  if (sub === 0) {
    return (
      <div className="acc-sheet__pane acc-sheet__pane--wide">
        <div className="acc-sheet__intro acc-sheet__intro--center">
          <h1 className="acc-sheet__title">
            Class details for <span className="acc-sheet__who">{student.name}</span>
          </h1>
          <p className="acc-sheet__sub acc-sheet__sub--balance">
            Set what you know and skip the rest - all of this is editable later.
          </p>
        </div>

        <div className="acc-wiz__split">
          <div className="acc-wiz__cell acc-wiz__cell--end">
            <span className="acc-wiz__label">Which periods?</span>
            <div className="acc-wiz__chips acc-wiz__chips--end">
              {periods.map((p) => {
                const on = (student.periodKeys || []).includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`acc-chip acc-chip--lg${on ? ' acc-chip--on' : ''}`}
                    aria-pressed={on}
                    title={p.title}
                    onClick={() => onTogglePeriod(student.id, p.key)}
                  >
                    {p.label}
                  </button>
                );
              })}
              {periods.length === 0 && (
                <span className="acc-wiz__hint">
                  You did not name any periods, so there is nothing to pick here.
                </span>
              )}
            </div>
            <span className="acc-wiz__hint">Just this student, whatever the group answer was.</span>
          </div>

          <span className="acc-wiz__rule" aria-hidden="true" />

          <div className="acc-wiz__cell">
            <span className="acc-wiz__label">Newly enrolled?</span>
            <DateField
              value={student.enrolledFrom || ''}
              onChange={(next) => onEnrolledFrom(student.id, next)}
              placeholder={sinceLabel}
              label={`First day in this class for ${student.name}`}
            />
            <span className="acc-wiz__hint">
              {student.enrolledFrom
                ? `Every day before ${formatDateMedium(student.enrolledFrom)} reads “not applicable - enrolled ${formatDateMedium(student.enrolledFrom)}”, so nothing is recorded against them for a class they were not in yet.`
                : 'Leave it as it is if they have been in this class since your first day.'}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (sub === 1) {
    return (
      <div className="acc-sheet__pane acc-sheet__pane--wide">
        <div className="acc-sheet__intro">
          <h1 className="acc-sheet__title">
            What does <span className="acc-sheet__who">{student.name}</span> receive?
          </h1>
          <p className="acc-sheet__sub">
            Start from the common wordings below. The plan&rsquo;s exact language wins, edit
            anything later to match it.
          </p>
        </div>

        <DetourSupports
          student={student}
          catalog={catalog}
          mode={mode}
          paste={paste}
          onPaste={onPaste}
          pasteReplaces={pasteReplaces}
          onToggle={onToggle}
        />
      </div>
    );
  }

  const chosen = periods.filter((p) => (student.periodKeys || []).includes(p.key));

  return (
    <div className="acc-sheet__pane">
      <div className="acc-sheet__intro acc-sheet__intro--center">
        <h1 className="acc-sheet__title">
          <span className="acc-sheet__who">{student.name}</span>, as you have described them
        </h1>
        <p className="acc-sheet__sub acc-sheet__sub--balance">
          Confirm these and you are back at the list. Nothing here is final - every part of it stays
          editable from the board.
        </p>
      </div>

      {/*
        Both halves of the card go back to the screen that set them.

        This pane used to be a read-only summary with Back and Confirm under it,
        and Back meant "the screen before" rather than "the thing I am looking
        at" - so noticing a wrong period here meant guessing how many steps
        backwards it lived. What is on the screen is now what you click to
        change it.
      */}
      <div className="acc-wiz__card">
        <div className="acc-wiz__cardhead">
          <span className="acc-wiz__disc" aria-hidden="true">
            {initialsOf(student.name)}
          </span>
          <div className="acc-wiz__identity">
            <div className="acc-wiz__nameline">
              <span className="acc-wiz__cardname">{student.name}</span>
              <span className={`acc-pill acc-pill--${planClassOf(student.plan)}`}>
                {student.plan}
              </span>
            </div>
            <span className="acc-wiz__meta">
              {chosen.length ? chosen.map((p) => p.label).join(', ') : 'All your periods'}
              {' · '}
              {student.enrolledFrom
                ? `Enrolled ${formatDateMedium(student.enrolledFrom)}`
                : 'Start of year'}
            </span>
          </div>
          {onJump && (
            <button type="button" className="acc-wiz__cardedit" onClick={() => onJump(0)}>
              Edit
            </button>
          )}
        </div>

        <div className="acc-wiz__accoms">
          <div className="acc-wiz__accomhead">
            <span className="acc-wiz__label">
              {student.accoms.length
                ? `${student.accoms.length} accommodation${student.accoms.length === 1 ? '' : 's'}`
                : 'Accommodations'}
            </span>
            {onJump && (
              <button type="button" className="acc-wiz__cardedit" onClick={() => onJump(1)}>
                {student.accoms.length ? 'Edit' : 'Add some'}
              </button>
            )}
          </div>

          {student.accoms.length > 0 ? (
            <div className="acc-wiz__chips">
              {student.accoms.map((label) => (
                <span key={label} className="acc-wiz__accom">
                  {label}
                </span>
              ))}
            </div>
          ) : (
            <span className="acc-wiz__empty">None yet - add them any time from the board.</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** One line of guidance per pane, so both footers read the same. */
export function detourTip(sub, student) {
  if (sub === 0) return 'Just this student - the group answer stays where it is.';
  if (sub === 1) {
    return student.accoms.length === 0
      ? 'Nothing chosen yet, that is fine'
      : `${student.accoms.length} support${student.accoms.length === 1 ? '' : 's'} chosen`;
  }
  return 'Edit either part above, or go back to the list.';
}

/**
 * The primary's label, said as the place it goes.
 *
 * The last pane's used to say "Confirm", which named a decision rather than a
 * destination - and on a screen that changes nothing, being asked to confirm
 * reads as being asked to commit. It goes back to the list, so it says so.
 */
export function detourLabel(sub) {
  return sub === DETOUR_STEPS - 1 ? 'Back to the list' : 'Continue';
}
