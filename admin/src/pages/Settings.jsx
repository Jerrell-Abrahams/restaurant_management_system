import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Field } from '../components/ui/Input';
import { Select, SelectItem } from '../components/ui/Select';

const FACES = ['\u{1F61E}', '\u{1F641}', '\u{1F610}', '\u{1F642}', '\u{1F60D}'];

// Same day keys the API validates (src/lib/hours.js) and the diner page reads (src/lib/
// dinerPage.js) -- kept in sync by convention across the three, since the admin console and the
// server are separate deployables with no shared import.
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = { mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday', sun: 'Sunday' };
const DEFAULT_PERIOD = ['09:00', '17:00'];

// Immutable updates over one `hours` object, mirrored by the four things a day row can do:
// toggle open/closed, edit a time, add a split shift, remove one. Kept as plain functions rather
// than folded into the JSX -- every call site below is a one-line setForm, not a decision.
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

export function Settings() {
  const { restaurant, restaurantId, reload } = useOutletContext();
  const { me } = useAuth();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (restaurant) {
      setForm({
        name: restaurant.name || '',
        alertEmail: restaurant.alert_email || '',
        alertThreshold: String(restaurant.alert_threshold ?? 3),
        googlePlaceId: restaurant.google_place_id || '',
        subscriptionId: restaurant.subscription_id || '',
        ownerUserId: restaurant.owner_user_id || '',
        address: restaurant.address || '',
        hours: restaurant.hours || {},
        closedNote: restaurant.closed_note || '',
        serviceRequests: !!restaurant.service_requests_enabled,
      });
    }
  }, [restaurant]);

  if (!form) return null;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.updateRestaurant(restaurantId, form);
      toast.success('Saved');
      reload();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save}>
      <h1 className="mb-5 font-serif text-[26px] font-medium tracking-[-0.015em]">Settings</h1>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>Restaurant</CardTitle></CardHeader>
        <div className="flex flex-col gap-3 p-4">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field
            label="Web address"
            hint="Printed on your coasters, so it can never change. A new address would mean reprinting every one."
          >
            <Input value={`/${restaurant.slug}`} disabled />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>Restaurant info</CardTitle></CardHeader>
        <div className="flex flex-col gap-3 p-4">
          <p className="text-[11.5px] leading-relaxed text-dim">
            Shown to diners behind the menu&rsquo;s burger button. Leave everything blank and that
            row simply does not appear — Share Menu still works either way.
          </p>
          <Field label="Address" hint="Becomes a tap-to-open-in-Maps link on the menu.">
            <textarea
              className="min-h-[52px] w-full rounded-md border border-border-2 bg-panel px-[11px] py-2 text-[13.5px] text-text placeholder:text-dim focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              placeholder="12 Vilakazi St, Soweto, 1804"
            />
          </Field>

          <div>
            <p className="mb-2 text-xs font-medium text-text/70">Hours</p>
            <div className="flex flex-col gap-2">
              {DAY_KEYS.map((day) => {
                const periods = form.hours[day] || [];
                const open = periods.length > 0;
                return (
                  <div key={day} className="rounded-md border border-border-2 bg-panel p-2.5">
                    <label className="flex items-center justify-between gap-2 text-[12.5px] text-text">
                      <span className="font-medium">{DAY_LABELS[day]}</span>
                      <span className="flex items-center gap-1.5 text-dim">
                        <input
                          type="checkbox"
                          checked={open}
                          onChange={(e) => setForm({ ...form, hours: toggleDayOpen(form.hours, day, e.target.checked) })}
                        />
                        Open
                      </span>
                    </label>
                    {open && (
                      <div className="mt-2 flex flex-col gap-1.5">
                        {periods.map((p, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <Input
                              type="time"
                              className="h-7 w-auto"
                              value={p[0]}
                              onChange={(e) => setForm({ ...form, hours: updatePeriod(form.hours, day, i, 'open', e.target.value) })}
                            />
                            <span className="text-[11px] text-dim">to</span>
                            <Input
                              type="time"
                              className="h-7 w-auto"
                              value={p[1]}
                              onChange={(e) => setForm({ ...form, hours: updatePeriod(form.hours, day, i, 'close', e.target.value) })}
                            />
                            {periods.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-7 px-2"
                                onClick={() => setForm({ ...form, hours: removePeriod(form.hours, day, i) })}
                              >
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-7 w-fit px-2 text-[11.5px]"
                          onClick={() => setForm({ ...form, hours: addPeriod(form.hours, day) })}
                        >
                          + Add a second period
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {/* A close-after-midnight period (e.g. 18:00 -> 02:00) is a normal entry here, not an
                error -- the diner-page badge (src/lib/hours.js status()) treats close <= open as
                spanning into the next day rather than rejecting it. */}
            <p className="mt-2 text-[11px] leading-relaxed text-dim">
              For a period that runs past midnight, set the closing time earlier than the opening
              time — e.g. 18:00 to 02:00.
            </p>
          </div>

          <Field label="Closed note" hint="Overrides the open/closed badge entirely while set. For a public holiday, a private function, anything the weekly hours above don't cover.">
            <Input
              value={form.closedNote}
              onChange={(e) => setForm({ ...form, closedNote: e.target.value })}
              placeholder="Closed 25–26 Dec"
            />
          </Field>
        </div>
      </Card>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>Alerts</CardTitle></CardHeader>
        <div className="flex flex-col gap-3 p-4">
          <Field label="Send alerts to" hint="Leave blank to turn alerts off.">
            <Input
              type="email"
              value={form.alertEmail}
              onChange={(e) => setForm({ ...form, alertEmail: e.target.value })}
              placeholder="owner@restaurant.co.za"
            />
          </Field>
          <Field label="Alert me at or below" hint="Several bad ratings in a row arrive as one email, not several.">
            <Select value={form.alertThreshold} onValueChange={(v) => setForm({ ...form, alertThreshold: v })}>
              {[1, 2, 3, 4].map((n) => (
                <SelectItem key={n} value={String(n)}>{FACES[n - 1]}  {n} and below</SelectItem>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>Table service</CardTitle></CardHeader>
        <div className="flex flex-col gap-3 p-4">
          <label className="flex items-center gap-2.5 text-[13px] text-text">
            <input
              type="checkbox"
              checked={form.serviceRequests}
              onChange={(e) => setForm({ ...form, serviceRequests: e.target.checked })}
            />
            Show &ldquo;Call waiter&rdquo; and &ldquo;Request bill&rdquo; buttons on the menu
          </label>
          <p className="text-[11.5px] leading-relaxed text-dim">
            A diner taps one, is asked their table once, and it appears on the kitchen display
            until a staff member clears it. The menu is cached a minute, so this can take that long
            to reach a phone that scans after you change it — and a phone that already has the menu
            open keeps whatever it last loaded either way.
          </p>
          {restaurant.service_requests_enabled && (
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              // Synchronous inside the click handler, no await before it -- an async window.open
              // is a popup block in most browsers.
              onClick={() => window.open(`/r/${restaurantId}/display`, 'kitchen-display')}
            >
              Open kitchen display
            </Button>
          )}
        </div>
      </Card>

      <Card className="mb-4 p-0">
        <CardHeader><CardTitle>Google</CardTitle></CardHeader>
        <div className="p-4">
          <Field
            label="Place ID"
            hint={
              me.isAdmin
                ? 'Where the review link sends diners. A wrong value sends them to another business.'
                : 'Set by ComplexAI. Ask us if it needs changing.'
            }
          >
            <Input
              value={form.googlePlaceId}
              onChange={(e) => setForm({ ...form, googlePlaceId: e.target.value })}
              disabled={!me.isAdmin}
              placeholder="ChIJ…"
            />
          </Field>
          {/* Stated plainly in the product, not only in COMPLIANCE.md: this is the rule a
              restaurant is most likely to ask us to break. */}
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-dim">
            Every diner is shown this link after rating, whatever score they gave. Showing it only to
            happy diners is called review gating and it is against Google&rsquo;s policy — it puts
            your listing at risk, not ours.
          </p>
        </div>
      </Card>

      {me.isAdmin && (
        <Card className="mb-4 p-0">
          <CardHeader><CardTitle>Account wiring</CardTitle></CardHeader>
          <div className="flex flex-col gap-3 p-4">
            <Field label="Owner user ID" hint="auth.users id of the person who signs in here.">
              <Input value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })} />
            </Field>
            <Field label="Subscription ID" hint="From the subscription system. Blank means not billed yet — not lapsed.">
              <Input value={form.subscriptionId} onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })} />
            </Field>
            <p className="text-[11.5px] text-dim">
              Billing status:{' '}
              <strong className={restaurant.active ? 'text-ok' : 'text-warn'}>
                {restaurant.active ? 'active' : 'inactive'}
              </strong>
              . Checked against the subscription system and cached for five minutes.
            </p>
          </div>
        </Card>
      )}

      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}
