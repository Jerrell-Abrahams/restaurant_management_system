import { useEffect, useRef, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import { ImagePlus, Loader2, Upload } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { cn } from '../components/ui/cn';
import { Input, Field } from '../components/ui/Input';
import { Select, SelectItem } from '../components/ui/Select';
import { Stars } from '../components/ui/Stars';
import { HoursEditor } from '../components/HoursEditor';

export function Settings() {
  const { restaurant, restaurantId, reload } = useOutletContext();
  const { me } = useAuth();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef(null);

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
        autoDismissMinutes: String(restaurant.service_requests_auto_dismiss_minutes || 'off'),
        chimeMuted: !!restaurant.service_requests_chime_muted,
        logoUrl: restaurant.logo_url || '',
      });
    }
  }, [restaurant]);

  if (!form) return null;

  // Sent as raw base64, not a data URL -- src/lib/logo.js decodes the field directly, the same
  // shape the existing QR upload already uses for the same reason (no multipart-parsing dep in
  // this codebase). Uploads immediately on pick rather than waiting for Save: a preview that isn't
  // actually saved yet would be a second, silent kind of unsaved-changes state on this page.
  async function pickLogo(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets picking the same file again re-fire onChange
    if (!file) return;

    setUploadingLogo(true);
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { logoUrl } = await api.uploadLogo(restaurantId, base64);
      setForm((f) => ({ ...f, logoUrl }));
      reload();
      toast.success('Logo updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploadingLogo(false);
    }
  }

  async function removeLogo() {
    try {
      await api.updateRestaurant(restaurantId, { logoUrl: null });
      setForm((f) => ({ ...f, logoUrl: '' }));
      reload();
    } catch (err) {
      toast.error(err.message);
    }
  }

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
          <div>
            <p className="mb-2 text-xs font-medium text-text/70">Logo</p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                title={form.logoUrl ? 'Replace logo' : 'Upload logo'}
                className={cn(
                  'group relative h-24 w-24 shrink-0 overflow-hidden rounded-full bg-panel transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  form.logoUrl ? 'border border-border-2' : 'border border-dashed border-border-2 hover:border-accent/50'
                )}
              >
                {form.logoUrl ? (
                  <>
                    {/* contain + padding, not cover -- a wordmark or a non-square logo would
                        otherwise get cropped or zoomed to fill a circle it was never designed
                        for. The circle is a frame around the logo here, not a mask over it. */}
                    <img src={form.logoUrl} alt="" className="h-full w-full object-contain p-3" />
                    {/* Hover affordance on a filled thumbnail, permanent overlay while a request is
                        in flight -- the same "something is happening" spinner Button uses
                        elsewhere, just anchored to the thing being replaced instead of the trigger. */}
                    <span
                      className={cn(
                        'pointer-events-none absolute inset-0 flex items-center justify-center bg-bg/75 text-text opacity-0 transition-opacity',
                        uploadingLogo ? 'opacity-100' : 'group-hover:opacity-100'
                      )}
                    >
                      {uploadingLogo ? <Loader2 size={22} className="animate-spin" /> : <Upload size={22} />}
                    </span>
                  </>
                ) : (
                  // One icon, not two stacked layers -- the filled state above needs a hover
                  // overlay ON TOP of the image, but an empty circle has nothing under it to
                  // overlay, so it just swaps in place instead.
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-dim transition-colors group-hover:text-accent">
                    {uploadingLogo ? <Loader2 size={28} className="animate-spin" /> : <ImagePlus size={28} />}
                  </span>
                )}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={pickLogo}
              />
              <div className="flex flex-col gap-1">
                <span className="text-[12.5px] text-text">
                  {form.logoUrl ? 'Click the logo to replace it' : 'Shown next to your name at the top of the menu'}
                </span>
                <span className="text-[11px] text-dim">PNG, JPEG or WEBP, up to 750KB — saved immediately</span>
                {form.logoUrl && (
                  <button type="button" onClick={removeLogo} className="w-fit text-[11.5px] text-bad hover:underline">
                    Remove logo
                  </button>
                )}
              </div>
            </div>
          </div>

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
            <HoursEditor hours={form.hours} onChange={(hours) => setForm({ ...form, hours })} />
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
                <SelectItem key={n} value={String(n)}>
                  <span className="inline-flex items-center gap-1.5">
                    <Stars value={n} size={12} /> {n} and below
                  </span>
                </SelectItem>
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
          {form.serviceRequests && (
            <Field
              label="Clear requests from the display"
              hint={form.autoDismissMinutes === 'off' ? undefined : 'A request still clears itself early if a staff member taps it.'}
            >
              <Select value={form.autoDismissMinutes} onValueChange={(v) => setForm({ ...form, autoDismissMinutes: v })}>
                <SelectItem value="off">Staff dismiss only</SelectItem>
                {[5, 10, 15, 20, 30].map((n) => (
                  <SelectItem key={n} value={String(n)}>Auto-dismiss after {n} min</SelectItem>
                ))}
              </Select>
            </Field>
          )}
          {form.serviceRequests && (
            <label className="flex items-center gap-2.5 text-[13px] text-text">
              <input
                type="checkbox"
                checked={form.chimeMuted}
                onChange={(e) => setForm({ ...form, chimeMuted: e.target.checked })}
              />
              Always mute the kitchen display chime
            </label>
          )}
          {restaurant.service_requests_enabled && (
            <Button
              type="button"
              variant="secondary"
              className="w-fit"
              title="Open the kitchen display in a new window"
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

      <Button type="submit" disabled={busy} loading={busy} title="Save changes">{busy ? 'Saving…' : 'Save changes'}</Button>
    </form>
  );
}
