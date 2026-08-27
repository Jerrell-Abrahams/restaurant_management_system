import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, Archive, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { Button, IconButton } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Field } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../components/ui/cn';

const rands = (cents) => (cents === null || cents === undefined ? '' : `R${(cents / 100).toFixed(2)}`);

export function MenuEditor() {
  const { restaurantId } = useOutletContext();
  const [menu, setMenu] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [catModal, setCatModal] = useState(null); // { id?, name }
  const [itemModal, setItemModal] = useState(null); // { categoryId, id?, ... }
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(() => {
    api.getMenu(restaurantId).then(setMenu).catch((err) => toast.error(err.message));
  }, [restaurantId]);

  useEffect(load, [load]);

  const run = async (fn, msg) => {
    try {
      await fn();
      toast.success(msg);
      load();
      return true;
    } catch (err) {
      toast.error(err.message);
      return false;
    }
  };

  if (!menu) return <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-32 w-full" />)}</div>;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Menu</h1>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setShowArchived(!showArchived)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button onClick={() => setCatModal({ name: '' })}><Plus size={13} /> Section</Button>
        </div>
      </div>

      {menu.length === 0 && (
        <Card className="p-8 text-center text-[13px] text-muted">
          No sections yet. Start with something like “Starters”.
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {menu.map((cat) => {
          const items = cat.items.filter((i) => showArchived || !i.archived_at);
          return (
            <Card key={cat.id} className="p-0">
              <CardHeader>
                <button onClick={() => setCatModal({ id: cat.id, name: cat.name })} className="text-left">
                  <CardTitle>{cat.name}</CardTitle>
                </button>
                <div className="flex gap-1.5">
                  <Button variant="ghost" onClick={() => setItemModal({ categoryId: cat.id, name: '', description: '', price: '' })}>
                    <Plus size={13} /> Dish
                  </Button>
                  <IconButton
                    aria-label={`Delete ${cat.name}`}
                    onClick={() => setConfirmDelete(cat)}
                  >
                    <Trash2 size={13} />
                  </IconButton>
                </div>
              </CardHeader>

              {items.length === 0 ? (
                <p className="px-4 py-5 text-[12.5px] text-dim">No dishes in this section.</p>
              ) : (
                items.map((item) => (
                  <div
                    key={item.id}
                    className={cn(
                      'flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0',
                      item.archived_at && 'opacity-45'
                    )}
                  >
                    <button
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setItemModal({ categoryId: cat.id, id: item.id, name: item.name, description: item.description || '', price: rands(item.price_cents) })}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13.5px] font-medium text-text">{item.name}</span>
                        {!item.available && !item.archived_at && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">sold out</span>
                        )}
                        {item.archived_at && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-dim">archived</span>
                        )}
                      </div>
                      {item.description && <div className="truncate text-[12.5px] text-muted">{item.description}</div>}
                    </button>

                    <span className="shrink-0 text-[13px] tabular-nums text-muted">{rands(item.price_cents)}</span>

                    {/* The daily toggle. Deliberately one tap from the list, not buried in a modal
                        -- "86 the ribs" happens mid-service with one hand. */}
                    {!item.archived_at && (
                      <Button
                        variant={item.available ? 'ghost' : 'secondary'}
                        className="shrink-0"
                        onClick={() => run(() => api.updateItem(restaurantId, item.id, { available: !item.available }), item.available ? `${item.name} marked sold out` : `${item.name} back on`)}
                      >
                        {item.available ? 'Available' : 'Sold out'}
                      </Button>
                    )}

                    <IconButton
                      aria-label={item.archived_at ? 'Restore' : 'Archive'}
                      onClick={() => run(() => api.updateItem(restaurantId, item.id, { archived: !item.archived_at }), item.archived_at ? 'Restored' : 'Archived')}
                    >
                      {item.archived_at ? <RotateCcw size={13} /> : <Archive size={13} />}
                    </IconButton>
                  </div>
                ))
              )}
            </Card>
          );
        })}
      </div>

      <p className="mt-5 text-[11.5px] leading-relaxed text-dim">
        Archiving keeps a dish&rsquo;s rating history and takes it off the menu. There is no delete
        for a rated dish on purpose — removing it would rewrite the numbers on your Dishes page.
      </p>

      <CategoryModal
        state={catModal}
        onClose={() => setCatModal(null)}
        onSave={(name) =>
          run(
            () => (catModal.id ? api.updateCategory(restaurantId, catModal.id, { name }) : api.createCategory(restaurantId, { name, position: menu.length })),
            'Section saved'
          ).then((ok) => ok && setCatModal(null))
        }
      />

      <ItemModal
        state={itemModal}
        onClose={() => setItemModal(null)}
        onSave={(body) =>
          run(
            () => (itemModal.id ? api.updateItem(restaurantId, itemModal.id, body) : api.createItem(restaurantId, { ...body, categoryId: itemModal.categoryId })),
            'Dish saved'
          ).then((ok) => ok && setItemModal(null))
        }
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.name}”?`}
        description="This removes the section and its dishes. If any dish has been rated, the server will refuse — archive those dishes instead so their history survives."
        confirmLabel="Delete"
        destructive
        onConfirm={() => run(() => api.deleteCategory(restaurantId, confirmDelete.id), 'Section deleted').then(() => setConfirmDelete(null))}
      />
    </div>
  );
}

function CategoryModal({ state, onClose, onSave }) {
  const [name, setName] = useState('');
  useEffect(() => setName(state?.name || ''), [state]);

  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.id ? 'Rename section' : 'New section'}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(name); }} className="flex flex-col gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Starters" required autoFocus />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!name.trim()}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

function ItemModal({ state, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', description: '', price: '' });
  useEffect(() => {
    if (state) setForm({ name: state.name || '', description: state.description || '', price: state.price || '' });
  }, [state]);

  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.id ? 'Edit dish' : 'New dish'}>
      <form onSubmit={(e) => { e.preventDefault(); onSave(form); }} className="flex flex-col gap-3">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Calamari" required autoFocus />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Grilled, lemon butter" />
        </Field>
        <Field label="Price" hint="Leave blank for market price. R189, 189.50 and 189,50 all work.">
          <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="R89.00" inputMode="decimal" />
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={!form.name.trim()}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}
