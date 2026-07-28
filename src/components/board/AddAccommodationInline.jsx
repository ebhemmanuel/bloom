import { useState } from 'react';
import { useData } from '../../context/DataContext.jsx';
import AccommodationPicker from '../shared/AccommodationPicker.jsx';
import { addAccommodationsToStudent } from '../../domain/importStudent.js';
import { ensureDay } from '../../domain/seed.js';
import { formatDateMedium } from '../../domain/dates.js';

/**
 * Add an accommodation to one student, from inside their lane.
 *
 * The field itself is AccommodationPicker, shared with the student profile so
 * the two cannot drift into looking like different features. What lives here is
 * only what is specific to a lane: the dashed trigger it unfolds from, and
 * where the new cards land.
 *
 * Everything added here is dated from the day in view FORWARD. Earlier days never
 * gain the card, so they cannot seal it as Not Used - the teacher must never be
 * documented as missing something that had not been assigned yet.
 */
export default function AddAccommodationInline({ studentId, dateKey }) {
  const { mutate } = useData();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');

  const commit = (items) => {
    if (items.length === 0) return;
    mutate((d) => {
      const { doc: withAssignments } = addAccommodationsToStudent(d, studentId, items, {
        effectiveFrom: dateKey,
      });
      // Re-seed the day so the new cards appear immediately rather than tomorrow.
      return ensureDay(withAssignments, dateKey);
    });
    setValue('');
    setOpen(false);
  };

  if (!open) {
    return (
      <li className="acc-addacc">
        <button type="button" className="acc-addacc__trigger" onClick={() => setOpen(true)}>
          + Add accommodation
        </button>
      </li>
    );
  }

  return (
    <li className="acc-addacc acc-addacc--open acc-enter">
      <AccommodationPicker
        studentId={studentId}
        value={value}
        onChange={setValue}
        onCommit={commit}
        onCancel={() => setOpen(false)}
        autoFocus
        hint={`Records from ${formatDateMedium(dateKey)} forward - earlier days are untouched.`}
      />
    </li>
  );
}
