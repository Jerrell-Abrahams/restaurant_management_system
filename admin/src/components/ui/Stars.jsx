import { cn } from './cn';

// A 1-5 rating as filled/empty stars -- replaces the old face-emoji glyph so a whole-visit rating
// and a single dish rating read the same way.
export function Stars({ value, size = 13, className }) {
  return (
    <span className={cn('inline-flex shrink-0', className)} style={{ fontSize: size, lineHeight: 1 }} aria-label={`${value} out of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <span key={i} className={i < value ? 'text-warn' : 'text-dim'}>★</span>
      ))}
    </span>
  );
}
