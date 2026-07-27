import { describe, it, expect } from 'vitest';
import { initialsOf } from '../components/shell/AppHeader.jsx';

describe('initialsOf', () => {
  it('drops a leading honorific along with its period', () => {
    // The bug this exists to prevent: "Ms. Rivera" rendering as ".R".
    expect(initialsOf('Ms. Rivera')).toBe('R');
    expect(initialsOf('Mr. Okafor')).toBe('O');
    expect(initialsOf('Dr. Chen')).toBe('C');
    expect(initialsOf('Mx. Bell')).toBe('B');
    expect(initialsOf('Mrs Rivera')).toBe('R');
  });

  it('uses first and last initials for a full name', () => {
    expect(initialsOf('Jordan Alvarez')).toBe('JA');
    expect(initialsOf('Ms. Jordan Alvarez')).toBe('JA');
    expect(initialsOf('Ana Maria Lopez')).toBe('AL');
  });

  it('handles a single name', () => {
    expect(initialsOf('Jordan')).toBe('J');
  });

  it('handles initials-style names without emitting punctuation', () => {
    expect(initialsOf('J.A.')).toBe('JA');
    expect(initialsOf('J. Alvarez')).toBe('JA');
  });

  it('handles accented names', () => {
    expect(initialsOf('Sofía Núñez')).toBe('SN');
  });

  it('falls back to a placeholder rather than rendering nothing', () => {
    for (const input of ['', '   ', null, undefined, '...', '123']) {
      expect(initialsOf(input)).toBe('?');
    }
  });

  it('never returns more than two characters', () => {
    expect(initialsOf('Anna Bella Clara Diana Eve')).toHaveLength(2);
  });
});
