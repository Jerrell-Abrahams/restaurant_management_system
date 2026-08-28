import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import * as api from '../api';
import { Button } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Field } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';

// Slug preview mirrors src/lib/slug.js. Duplicated rather than shared because the server is the
// authority and re-validates everything -- this exists only so nobody is surprised by what they
// are about to print on a thousand coasters.
const slugify = (s) =>
  String(s || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function Restaurants() {
  const { me, reloadMe, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', googlePlaceId: '', ownerUserId: '', subscriptionId: '' });
  const [busy, setBusy] = useState(false);

  const slug = slugify(form.slug || form.name);

  async function create(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.createRestaurant({ ...form, slug });
      toast.success(`${form.name} created`);
      setOpen(false);
      setForm({ name: '', slug: '', googlePlaceId: '', ownerUserId: '', subscriptionId: '' });
      await reloadMe();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-serif text-[26px] font-medium tracking-[-0.015em]">Restaurants</h1>
          <p className="mt-0.5 text-[12.5px] text-muted">{me.email}</p>
        </div>
        <div className="flex gap-2">
          {me.isAdmin && <Button onClick={() => setOpen(true)}>New restaurant</Button>}
          <Button variant="secondary" onClick={logout}>Log out</Button>
        </div>
      </div>

      {me.restaurants.length === 0 ? (
        <Card className="p-8 text-center text-[13px] text-muted">
          {me.isAdmin
            ? 'No restaurants yet. Create the first one.'
            : 'No restaurant is linked to this account yet. Ask ComplexAI to connect it.'}
        </Card>
      ) : (
        <Card className="p-0">
          <CardHeader><CardTitle>{me.restaurants.length} restaurant{me.restaurants.length === 1 ? '' : 's'}</CardTitle></CardHeader>
          {me.restaurants.map((r) => (
            <Link
              key={r.id}
              to={`/r/${r.id}`}
              className="flex items-center justify-between border-b border-border px-4 py-3 last:border-0 hover:bg-raised"
            >
              <span className="text-[13.5px] font-medium text-text">{r.name}</span>
              <span className="font-mono text-[11px] text-dim">/{r.slug}</span>
            </Link>
          ))}
        </Card>
      )}

      <Modal open={open} onOpenChange={setOpen} title="New restaurant">
        <form onSubmit={create} className="flex flex-col gap-3">
          <Field label="Name">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </Field>
          <Field
            label="Slug"
            hint="Printed on the coasters. This can never be changed — a new slug means a new print run."
          >
            <Input
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder={slugify(form.name) || 'marios-kitchen'}
            />
          </Field>
          {slug && <p className="-mt-1 font-mono text-[11px] text-dim">menu.complexai.co.za/{slug}</p>}
          <Field label="Google Place ID" hint="Optional. Without it the thank-you screen shows no Google link.">
            <Input value={form.googlePlaceId} onChange={(e) => setForm({ ...form, googlePlaceId: e.target.value })} />
          </Field>
          <Field label="Owner user ID" hint="Optional. The auth.users id of the person who signs in for this restaurant.">
            <Input value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })} />
          </Field>
          <Field label="Subscription ID" hint="Optional. From the subscription system. Blank means not billed yet, not lapsed.">
            <Input value={form.subscriptionId} onChange={(e) => setForm({ ...form, subscriptionId: e.target.value })} />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={busy || !form.name}>{busy ? 'Creating…' : 'Create'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
