import { Button } from './ui/Button';
import { Switch } from './ui/Switch';
import { TimeSelect } from './ui/TimeSelect';
import { cn } from './ui/cn';

// Same day keys the API validates (src/lib/hours.js) and the diner page reads (src/lib/
// dinerPage.js) -- kept in sync by convention across the three, since the admin console and the
// server are separate deployables with no shared import.
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DEFAULT_PERIOD = ['09:00', '17:00'];

// True only when hours is a real (non-null) object and every day in it -- explicit or absent --
// has zero periods. Distinct from null/undefined, which means "no schedule" rather than "paused."
export const isPaused = (hours) => !!hours && Object.keys(hours).every((d) => !(hours[d] || []).length);

// Immutable updates over one `hours` object, mirrored by the four things a day row can do:
// toggle open/closed, edit a time, add a split shift, remove one.
function toggleDayOpen(hours, day, open) {
  return { ...hours, [day]: open ? [DEFAULT_PERIOD.slice()] : [] };
}
function updatePeriod(hours, day, idx, which, value) {
  const periods = (hours[day] || []).map((p, i) => (i === idx ? (which === 'open' ? [value, p[1]] : [p[0], value]) : p));
  return { ...hours, [day]: periods };
}
function addPeriod(hours, day) {
  return { ...hours, [day]: [...(hours[day] || []), DEFAULT_PERIOD.slice()] };
}
function removePeriod(hours, day, idx) {
  return { ...hours, [day]: (hours[day] || []).filter((_, i) => i !== idx) };
}

// One weekly hours editor, shared by the restaurant's own hours (Settings.jsx) and a menu
// section's serving hours (MenuEditor.jsx) -- same `hours` shape both places (src/lib/hours.js),
// same interaction underneath. `hours` is always a plain object here; callers with a possibly-null
// value pass `hours || {}` and keep the null distinct in their own form state.
export function HoursEditor({ hours, onChange }) {
  return (
    <div className="flex flex-col gap-2">
      {DAY_KEYS.map((day) => {
        const periods = hours[day] || [];
        const open = periods.length > 0;
        return (
          <div key={day} className="rounded-md border border-border-2 bg-panel p-2.5">
            <div className="flex items-center justify-between gap-2 text-[12.5px] text-text">
              <span className="font-medium">{DAY_LABELS[day]}</span>
              <Switch
                checked={open}
                onChange={(e) => onChange(toggleDayOpen(hours, day, e.target.checked))}
                aria-label={`${DAY_LABELS[day]} open`}
              />
            </div>
            {/* Grid-rows 0fr<->1fr, not a conditional unmount -- same trick dinerPage.js uses for
                #contact-wrap/.confirm-wrap, and it needs no JS height measuring. The inner
                overflow-hidden wrapper is what actually clips the content as the track shrinks;
                the outer element is what the transition runs on. */}
            <div
              className={cn(
                'grid transition-[grid-template-rows] duration-200 ease-out',
                open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              )}
            >
              <div className="overflow-hidden">
                <div className="mt-2 flex flex-col gap-1.5">
                  {periods.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <TimeSelect
                        className="h-7 w-[92px] gap-1 px-2 text-[12.5px]"
                        value={p[0]}
                        onChange={(value) => onChange(updatePeriod(hours, day, i, 'open', value))}
                      />
                      <span className="text-[11px] text-dim">to</span>
                      <TimeSelect
                        className="h-7 w-[92px] gap-1 px-2 text-[12.5px]"
                        value={p[1]}
                        onChange={(value) => onChange(updatePeriod(hours, day, i, 'close', value))}
                      />
                      {periods.length > 1 && (
                        <Button type="button" variant="ghost" className="h-7 px-2" onClick={() => onChange(removePeriod(hours, day, i))} title="Remove this time period">
                          Remove
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    className="h-7 w-fit px-2 text-[11.5px]"
                    onClick={() => onChange(addPeriod(hours, day))}
                    title="Add another time period"
                  >
                    + Add a second period
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
