import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import CalendarPanel from './CalendarPanel.jsx';
import { formatDateMedium, todayKey } from '../../domain/dates.js';

/**
 * A date on a form, chosen from the app's own calendar.
 *
 * These were `<input type="date">`, which draws the OPERATING SYSTEM's picker:
 * a different grid, a different week start, a different everything, opening out
 * of a sheet built to look like none of it. One calendar now, shared with the
 * board's - see CalendarPanel.
 *
 * Blank is a real answer here and always means the same thing: the student has
 * been in this class since the year opened. So there is a way back to it, which
 * a native date input never offers once a date is in it.
 *
 * Unbounded in both directions on purpose. Being typed in today is not a claim
 * about when somebody joined - they may have been here since September, or they
 * may start on Monday - and the record has to be able to say either.
 *
 * @param {object} props
 * @param {string} props.value  a date key, or '' for none
 * @param {(next: string) => void} props.onChange  '' when cleared
 * @param {string} [props.placeholder]  what blank means, in words
 */
export default function DateField({
  value,
  onChange,
  placeholder = 'Start of year',
  label,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState(value || todayKey());
  const [at, setAt] = useState({ top: 0, left: 0 });

  const ref = usePopoverDismiss(open, () => setOpen(false));
  const triggerRef = useRef(null);

  /*
    Measured from the trigger each time it opens, because the calendar is
    portalled to the body: a popover inside the sheet would be clipped by the
    pane that scrolls.
  */
  const place = () => {
    const box = triggerRef.current?.getBoundingClientRect();
    if (!box) return;
    setAt({
      top: Math.min(box.bottom + 6, window.innerHeight - 380),
      left: Math.max(8, Math.min(box.left, window.innerWidth - 316)),
    });
  };

  useEffect(() => {
    if (!open) return undefined;
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [open]);

  return (
    <span className="acc-wiz__datefield">
      <button
        type="button"
        ref={triggerRef}
        className={`acc-wiz__datetrigger${open ? ' acc-wiz__datetrigger--on' : ''}${
          value ? '' : ' acc-wiz__datetrigger--empty'
        }`}
        disabled={disabled}
        aria-expanded={open}
        aria-label={label || 'Choose a date'}
        onClick={() => {
          if (!open) {
            place();
            setAnchor(value || todayKey());
          }
          setOpen((o) => !o);
        }}
      >
        {value ? formatDateMedium(value) : placeholder}
      </button>

      {open &&
        createPortal(
          <div
            className="acc-cal acc-cal--field acc-enter"
            ref={ref}
            role="dialog"
            aria-label={label || 'Choose a date'}
            style={{ '--acc-cal-top': `${at.top}px`, '--acc-cal-left': `${at.left}px` }}
          >
            <CalendarPanel
              anchor={anchor}
              value={value || null}
              onAnchor={setAnchor}
              onPick={(key) => {
                onChange(key);
                setOpen(false);
              }}
            />

            {/* The way back to blank. A native date input has no such thing
                once a date is in it, and blank is a real answer here. */}
            <button
              type="button"
              className="acc-cal__clear"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              {placeholder}
            </button>
          </div>,
          document.body
        )}
    </span>
  );
}
