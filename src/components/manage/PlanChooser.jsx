import { useCallback, useEffect, useRef, useState } from 'react';
import Caret from '../shared/Caret.jsx';
import { usePopoverDismiss } from '../shell/AppHeader.jsx';
import {
  PLAN_TYPES,
  PLAN_LABEL_MAX,
  planClassOf,
  normalizePlanType,
} from '../../domain/constants.js';

/**
 * The plan pill beside a student's name, and the menu it opens.
 *
 * One component, three callers: adding a student, setup's roster, and editing
 * one. It was three copies of the same markup, which is how a control ends up
 * behaving differently depending on which screen you reached it from.
 *
 * "Other" is a door rather than an answer. Picking it asks what to call the
 * plan, and whatever comes back is what the pill says and what the report
 * header prints. A student on a health plan, a behaviour plan or a district's
 * own scheme was recorded as "Other" and printed as "Other", which tells an
 * auditor nothing.
 *
 * @param {object} props
 * @param {string} props.value  the current plan, which may be a custom wording
 * @param {(next: string) => void} props.onChange
 * @param {(open: boolean) => void} [props.onOpenChange]  so a sheet can keep
 *   Escape from closing it while this menu is up
 */
export default function PlanChooser({ value, onChange, disabled = false, onOpenChange }) {
  const [open, setOpen] = useState(false);
  // The menu has two faces: the three rows, and naming a custom plan.
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState('');

  const close = useCallback(() => {
    setOpen(false);
    setNaming(false);
  }, []);
  const ref = usePopoverDismiss(open, close);

  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  // Anything that is not one of the two named plans is a custom wording, so
  // "Other" is what carries the tick and the wording is what it shows.
  const isCustom = value !== 'IEP' && value !== '504';

  const commitCustom = () => {
    const next = normalizePlanType(draft, '');
    // Nothing typed still means Other. It is a worse label than a real one and
    // a better one than an empty pill.
    onChange(next || 'Other');
    close();
  };

  return (
    <span className={`acc-wiz__planwrap acc-wiz__planwrap--${planClassOf(value)}`} ref={ref}>
      <button
        type="button"
        className="acc-wiz__plan"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Plan type: ${value}`}
        title={value}
        disabled={disabled}
      >
        {value}
        <Caret up={open} />
      </button>

      {open && (
        <div
          className={`acc-wiz__planmenu acc-enter${naming ? ' acc-wiz__planmenu--naming' : ''}`}
          role="menu"
        >
          {naming ? (
            <div className="acc-wiz__planname">
              <span className="acc-wiz__planname-label">What is this plan called?</span>
              <input
                className="acc-wiz__planname-input"
                value={draft}
                maxLength={PLAN_LABEL_MAX}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitCustom();
                  }
                  // Back to the rows, not out of the sheet. The menu is what
                  // this Escape is about.
                  if (e.key === 'Escape') {
                    e.stopPropagation();
                    setNaming(false);
                  }
                }}
                placeholder="Behaviour plan, RTI, health plan…"
                aria-label="Name this plan type"
                autoFocus
              />
              <button
                type="button"
                className="acc-btn acc-btn--small acc-btn--primary"
                onClick={commitCustom}
              >
                Use this
              </button>
              <span className="acc-wiz__planname-hint">
                It prints on the report header exactly as written.
              </span>
            </div>
          ) : (
            PLAN_TYPES.map((p) => {
              const on = p === 'Other' ? isCustom : p === value;
              return (
                <button
                  key={p}
                  type="button"
                  role="menuitemradio"
                  aria-checked={on}
                  className={`acc-wiz__planrow${on ? ' acc-wiz__planrow--on' : ''}`}
                  onClick={() => {
                    if (p === 'Other') {
                      // Prefilled with what they called it last time, so
                      // reopening is a correction rather than a retype.
                      setDraft(isCustom && value !== 'Other' ? value : '');
                      setNaming(true);
                      return;
                    }
                    onChange(p);
                    close();
                  }}
                >
                  <span className="acc-wiz__plancheck">{on ? '✓' : ''}</span>
                  {p === 'Other' && isCustom && value !== 'Other' ? `Other: ${value}` : p}
                </button>
              );
            })
          )}
        </div>
      )}
    </span>
  );
}
