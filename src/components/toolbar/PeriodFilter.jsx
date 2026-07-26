/** Multi-select period chips. */
export default function PeriodFilter({ periods, selected, onChange }) {
  if (periods.length === 0) return null;

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((p) => p !== id) : [...selected, id]);
  };

  return (
    <div className="acc-periods" role="group" aria-label="Filter by class period">
      <button
        type="button"
        className={`acc-chip${selected.length === 0 ? ' acc-chip--on' : ''}`}
        onClick={() => onChange([])}
        aria-pressed={selected.length === 0}
      >
        All
      </button>

      {periods.map((p) => (
        <button
          key={p.id}
          type="button"
          className={`acc-chip${selected.includes(p.id) ? ' acc-chip--on' : ''}`}
          onClick={() => toggle(p.id)}
          aria-pressed={selected.includes(p.id)}
          title={p.name}
        >
          {p.shortName}
          <span className="acc-chip__count acc-numeric">{p.studentCount}</span>
        </button>
      ))}
    </div>
  );
}
