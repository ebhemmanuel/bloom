import { useState } from 'react';

/**
 * Multi-select chips with optional free entry.
 *
 * Used for subjects and grade levels - both are genuinely multi-valued
 * (secondary teachers routinely teach two subjects across three grades), so a
 * single-select dropdown would be wrong.
 */
export default function ChipMulti({
  label,
  options,
  selected,
  onChange,
  allowCustom = false,
  disabled = false,
}) {
  const [custom, setCustom] = useState('');

  const toggle = (value) => {
    if (disabled) return;
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const addCustom = () => {
    const value = custom.trim();
    if (!value) return;
    // Case-insensitive dedupe, so "algebra" doesn't join an existing "Algebra".
    const exists = selected.some((s) => s.toLowerCase() === value.toLowerCase());
    if (!exists) onChange([...selected, value]);
    setCustom('');
  };

  // Anything chosen that isn't in the preset list, so custom values stay visible.
  const extras = selected.filter((s) => !options.includes(s));

  return (
    <div className="acc-field">
      <span className="acc-field__label">{label}</span>

      <div className="acc-chipset">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`acc-chip${selected.includes(option) ? ' acc-chip--on' : ''}`}
            onClick={() => toggle(option)}
            aria-pressed={selected.includes(option)}
            disabled={disabled}
          >
            {option}
          </button>
        ))}

        {extras.map((option) => (
          <button
            key={option}
            type="button"
            className="acc-chip acc-chip--on acc-chip--custom"
            onClick={() => toggle(option)}
            aria-pressed
            disabled={disabled}
            title="Remove"
          >
            {option}
          </button>
        ))}
      </div>

      {allowCustom && !disabled && (
        <div className="acc-inputgroup acc-chipset__add">
          <input
            className="acc-inputgroup__input"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustom();
              }
            }}
            placeholder="Add another…"
            aria-label={`Add another ${label.toLowerCase()}`}
          />
          <button
            type="button"
            className="acc-inputgroup__action"
            onClick={addCustom}
            disabled={!custom.trim()}
          >
            Add
          </button>
        </div>
      )}
    </div>
  );
}
