import { Select, SelectItem } from './Select';

// 15-minute steps through the day, plus 23:59 -- the sentinel src/lib/hours.js documents for
// "open all day" (an [open, close] pair can never be equal, so midnight-to-midnight is spelled
// this way). Restaurant hours are never set to the exact minute otherwise, so a themed dropdown
// beats the browser's native (and unstyleable) time picker for this.
const TIMES = [
  ...Array.from({ length: 96 }, (_, i) => {
    const h = String(Math.floor(i / 4)).padStart(2, '0');
    const m = String((i % 4) * 15).padStart(2, '0');
    return `${h}:${m}`;
  }),
  '23:59',
];

export function TimeSelect({ value, onChange, className }) {
  return (
    <Select value={value} onValueChange={onChange} className={className}>
      {TIMES.map((t) => (
        <SelectItem key={t} value={t}>{t}</SelectItem>
      ))}
    </Select>
  );
}
