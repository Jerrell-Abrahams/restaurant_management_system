import { useCallback, useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Trash2, Archive, RotateCcw, GripVertical, Flame, ChevronDown, ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { Button, IconButton } from '../components/ui/Button';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Input, Field } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Select, SelectItem } from '../components/ui/Select';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../components/ui/cn';
import { HoursEditor, isPaused } from '../components/HoursEditor';
import { ALLERGENS, ALLERGEN_LABELS } from '../lib/dietary';

const rands = (cents) => (cents === null || cents === undefined ? '' : `R${(cents / 100).toFixed(2)}`);
const MAX_VARIANTS = 4; // Matches src/lib/variants.js and the check constraint in db/menu_variants.sql.
const MAX_ADD_ONS = 6; // Same, against db/menu_addons.sql.
// Sizes win the list row's price column when a dish has them -- the range is what the owner is
// scanning for. The modal is where both numbers are visible at once.
const priceSummary = (item) => {
  const cents = (item.price_variants || []).map((v) => v.price_cents);
  if (!cents.length) return rands(item.price_cents);
  const [lo, hi] = [Math.min(...cents), Math.max(...cents)];
  return lo === hi ? rands(lo) : `${rands(lo)}–${rands(hi)}`;
};
const DIET_LABEL = { vegetarian: 'VEG', vegan: 'VEGAN' };
// Same six values src/lib/promotions.js validates server-side -- kept in sync by convention, same
// as Settings.jsx's DAY_KEYS, since the admin console and the server are separate deployables.
const PROMO_LABEL_TEXT = {
  best_seller: 'Best Seller',
  popular: 'Popular',
  new: 'New',
  special: 'Special',
  limited_time: 'Limited Time',
  chefs_choice: "Chef's Choice",
};

export function MenuEditor() {
  const { restaurantId } = useOutletContext();
  const [menu, setMenu] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [catModal, setCatModal] = useState(null); // { id?, name }
  const [itemModal, setItemModal] = useState(null); // { categoryId, id?, ... }
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [catSaving, setCatSaving] = useState(false);
  const [itemSaving, setItemSaving] = useState(false);
  const [dragging, setDragging] = useState(null); // { categoryId, index }
  const [catDragging, setCatDragging] = useState(null); // index of the section being dragged
  const [collapsed, setCollapsed] = useState(() => new Set()); // category ids hidden from view, not from the server

  const load = useCallback(() => {
    api.getMenu(restaurantId).then(setMenu).catch((err) => toast.error(err.message));
  }, [restaurantId]);

  useEffect(load, [load]);

  // Reorders the in-memory list live as the drag crosses rows, so the UI tracks the pointer --
  // the API write only happens once, on drop. Indices are positions within the category's full
  // item list (not the filtered/visible one), so this stays correct with archived items hidden.
  function reorderLocal(categoryId, from, to) {
    if (from === to) return;
    setMenu((cur) =>
      cur.map((cat) => {
        if (cat.id !== categoryId) return cat;
        const items = cat.items.slice();
        items.splice(to, 0, items.splice(from, 1)[0]);
        return { ...cat, items };
      })
    );
    setDragging({ categoryId, index: to });
  }

  // Writes the whole category's order in one shot once the drag ends. On failure, reload to
  // discard the optimistic reorder rather than leaving the screen out of sync with the server.
  async function persistOrder(categoryId) {
    const cat = menu.find((c) => c.id === categoryId);
    if (!cat) return;
    try {
      await Promise.all(cat.items.map((item, idx) => api.updateItem(restaurantId, item.id, { position: idx })));
    } catch (err) {
      toast.error(err.message);
      load();
    }
  }

  // Same live-reorder-then-persist-on-drop shape as reorderLocal/persistOrder above, one level up:
  // sections reorder in the top-level `menu` array instead of a category's `items` array.
  function reorderCatLocal(from, to) {
    if (from === to) return;
    setMenu((cur) => {
      const cats = cur.slice();
      cats.splice(to, 0, cats.splice(from, 1)[0]);
      return cats;
    });
    setCatDragging(to);
  }

  async function persistCatOrder() {
    try {
      await Promise.all(menu.map((cat, idx) => api.updateCategory(restaurantId, cat.id, { position: idx })));
    } catch (err) {
      toast.error(err.message);
      load();
    }
  }

  function toggleCollapse(id) {
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Every section is open by default (an empty set), so "all collapsed" is the one state worth
  // naming explicitly -- everything else, including a mix of open and closed sections, reads as
  // "collapse all" on the header button rather than "expand all".
  // Checked by membership, not by size against collapsed -- collapsed can hold the id of a
  // section that's since been deleted, and a size comparison would then never agree again even
  // though every section still on screen is collapsed.
  const allCollapsed = menu?.length > 0 && menu.every((c) => collapsed.has(c.id));
  const toggleCollapseAll = () => setCollapsed(allCollapsed ? new Set() : new Set(menu.map((c) => c.id)));

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
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-[26px] font-medium tracking-[-0.015em]">Menu</h1>
        <div className="flex flex-wrap gap-2">
          {menu.length > 1 && (
            <Button variant="ghost" onClick={toggleCollapseAll} title={allCollapsed ? 'Expand all sections' : 'Collapse all sections'}>
              {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />} {allCollapsed ? 'Expand all' : 'Collapse all'}
            </Button>
          )}
          <Button variant="ghost" onClick={() => setShowArchived(!showArchived)} title={showArchived ? 'Hide archived dishes' : 'Show archived dishes'}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </Button>
          <Button onClick={() => setCatModal({ name: '' })} title="Add a new menu section"><Plus /> Section</Button>
        </div>
      </div>
      <p className="mb-5 font-mono text-[10.5px] text-dim">DRAG THE HANDLE TO REORDER · CHANGES ARE LIVE FOR DINERS</p>

      {menu.length === 0 && (
        <Card className="p-8 text-center text-[13px] text-muted">
          No sections yet. Start with something like “Starters”.
        </Card>
      )}

      <div className="flex flex-col gap-4">
        {menu.map((cat, catIdx) => {
          const visibleItems = cat.items.filter((i) => showArchived || !i.archived_at);
          return (
            <Card key={cat.id} className={cn('p-0', catDragging === catIdx && 'bg-raised')}>
              <CardHeader
                draggable
                onDragStart={() => setCatDragging(catIdx)}
                onDragEnter={() => catDragging !== null && reorderCatLocal(catDragging, catIdx)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => {
                  const wasDragging = catDragging !== null;
                  setCatDragging(null);
                  if (wasDragging) persistCatOrder();
                }}
                className="cursor-grab"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <GripVertical size={14} className="shrink-0 text-dim" />
                  <IconButton
                    variant="ghost"
                    aria-label={collapsed.has(cat.id) ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                    title={collapsed.has(cat.id) ? `Expand ${cat.name}` : `Collapse ${cat.name}`}
                    onClick={() => toggleCollapse(cat.id)}
                  >
                    <ChevronDown className={cn('transition-transform', collapsed.has(cat.id) && '-rotate-90')} />
                  </IconButton>
                  <button onClick={() => setCatModal({ id: cat.id, name: cat.name, hours: cat.hours })} className="flex min-w-0 items-center gap-2 text-left" title={`Edit ${cat.name}`}>
                    <CardTitle className="min-w-0 truncate">{cat.name}</CardTitle>
                    {isPaused(cat.hours) && (
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">Paused</span>
                    )}
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <Button variant="ghost" onClick={() => setItemModal({ categoryId: cat.id, name: '', description: '', price: '' })} title={`Add a dish to ${cat.name}`}>
                    <Plus /> Dish
                  </Button>
                  <IconButton
                    aria-label={`Delete ${cat.name}`}
                    title={`Delete ${cat.name}`}
                    onClick={() => setConfirmDelete(cat)}
                  >
                    <Trash2 />
                  </IconButton>
                </div>
              </CardHeader>

              <AnimatePresence initial={false}>
                {!collapsed.has(cat.id) && (
                  <motion.div
                    key="items"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: 'easeInOut' }}
                    style={{ overflow: 'hidden' }}
                  >
                    {visibleItems.length === 0 ? (
                      <p className="px-4 py-5 text-[12.5px] text-dim">No dishes in this section.</p>
                    ) : (
                      <div className="max-h-[420px] overflow-y-auto">
                {cat.items.map((item, idx) => {
                  if (!showArchived && item.archived_at) return null;
                  return (
                  <div
                    key={item.id}
                    draggable={!item.archived_at}
                    onDragStart={() => setDragging({ categoryId: cat.id, index: idx })}
                    onDragEnter={() => dragging && dragging.categoryId === cat.id && reorderLocal(cat.id, dragging.index, idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDragEnd={() => {
                      const cid = dragging?.categoryId;
                      setDragging(null);
                      if (cid) persistOrder(cid);
                    }}
                    className={cn(
                      'flex items-center gap-3 border-b border-border px-4 py-2.5 last:border-0',
                      item.archived_at && 'opacity-45',
                      dragging?.categoryId === cat.id && dragging.index === idx && 'bg-raised'
                    )}
                  >
                    <GripVertical size={14} className={cn('shrink-0 text-dim', !item.archived_at && 'cursor-grab')} />
                    <button
                      className="min-w-0 flex-1 text-left"
                      title={`Edit ${item.name}`}
                      onClick={() =>
                        setItemModal({
                          categoryId: cat.id,
                          id: item.id,
                          name: item.name,
                          description: item.description || '',
                          price: rands(item.price_cents),
                          spiceLevel: item.spice_level || 0,
                          diet: item.diet || '',
                          allergens: item.allergens || [],
                          promoLabel: item.promo_label || '',
                          variants: (item.price_variants || []).map((v) => ({ label: v.label, price: rands(v.price_cents) })),
                          addOns: (item.add_ons || []).map((a) => ({ label: a.label, price: rands(a.price_cents) })),
                        })
                      }
                    >
                      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-text">{item.name}</span>
                        {PROMO_LABEL_TEXT[item.promo_label] && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-accent">{PROMO_LABEL_TEXT[item.promo_label]}</span>
                        )}
                        {item.rating_count > 0 && (
                          <span className="shrink-0 font-mono text-[10.5px] text-dim">{item.rating_count}★</span>
                        )}
                        {item.spice_level > 0 && (
                          <span className="inline-flex shrink-0 items-center gap-px text-accent">{spiceIcons(item.spice_level, 11)}</span>
                        )}
                        {DIET_LABEL[item.diet] && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-ok">{DIET_LABEL[item.diet]}</span>
                        )}
                        {!item.available && !item.archived_at && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-warn">sold out</span>
                        )}
                        {item.archived_at && (
                          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.08em] text-dim">archived</span>
                        )}
                      </div>
                      {item.description && <div className="truncate text-[12.5px] text-muted">{item.description}</div>}
                    </button>

                    <span className="shrink-0 text-[13px] tabular-nums text-muted">{priceSummary(item)}</span>

                    {/* The daily toggle. Deliberately one tap from the list, not buried in a modal
                        -- "86 the ribs" happens mid-service with one hand. */}
                    {!item.archived_at && (
                      <Button
                        variant={item.available ? 'ghost' : 'secondary'}
                        className="shrink-0"
                        title={item.available ? `Mark ${item.name} sold out` : `Mark ${item.name} available`}
                        onClick={() => run(() => api.updateItem(restaurantId, item.id, { available: !item.available }), item.available ? `${item.name} marked sold out` : `${item.name} back on`)}
                      >
                        {item.available ? 'Available' : 'Sold out'}
                      </Button>
                    )}

                    <IconButton
                      aria-label={item.archived_at ? 'Restore' : 'Archive'}
                      title={item.archived_at ? `Restore ${item.name}` : `Archive ${item.name}`}
                      onClick={() => run(() => api.updateItem(restaurantId, item.id, { archived: !item.archived_at }), item.archived_at ? 'Restored' : 'Archived')}
                    >
                      {item.archived_at ? <RotateCcw /> : <Archive />}
                    </IconButton>
                  </div>
                  );
                })}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
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
        saving={catSaving}
        onClose={() => setCatModal(null)}
        onSave={async (body) => {
          setCatSaving(true);
          const ok = await run(
            () => (catModal.id ? api.updateCategory(restaurantId, catModal.id, body) : api.createCategory(restaurantId, { name: body.name, position: menu.length })),
            'Section saved'
          );
          setCatSaving(false);
          if (ok) setCatModal(null);
        }}
      />

      <ItemModal
        state={itemModal}
        saving={itemSaving}
        onClose={() => setItemModal(null)}
        onSave={async (body) => {
          setItemSaving(true);
          const ok = await run(
            () => (itemModal.id ? api.updateItem(restaurantId, itemModal.id, body) : api.createItem(restaurantId, { ...body, categoryId: itemModal.categoryId })),
            'Dish saved'
          );
          setItemSaving(false);
          if (ok) setItemModal(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
        title={`Delete “${confirmDelete?.name}”?`}
        description="This removes the section and its dishes. If any dish has been rated, the server will refuse — archive those dishes instead so their history survives."
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          const ok = await run(() => api.deleteCategory(restaurantId, confirmDelete.id), 'Section deleted');
          if (ok) setConfirmDelete(null);
        }}
      />
    </div>
  );
}

function CategoryModal({ state, saving, onClose, onSave }) {
  const [name, setName] = useState('');
  // null = no schedule, the section always shows normally -- distinct from {}, which is every day
  // with zero periods (the Pause button below), and is what makes status() report closed always.
  const [hours, setHours] = useState(null);
  useEffect(() => {
    setName(state?.name || '');
    setHours(state?.hours || null);
  }, [state]);

  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.id ? 'Edit section' : 'New section'}>
      <form onSubmit={(e) => { e.preventDefault(); onSave({ name, hours }); }} className="flex flex-col gap-3">
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Starters" required />
        </Field>
        {/* Only once the section exists -- a brand-new section is created with no schedule, and
            gets one via a second edit rather than crowding the "New section" modal with it. */}
        {state?.id && (
          <Field
            label="Serving hours"
            as="div"
            hint="Leave every day off for no schedule -- the section always shows normally. This is what a Breakfast section that only appears 07:00-11:00 is built from."
          >
            <HoursEditor hours={hours || {}} onChange={setHours} />
            <Button type="button" variant="ghost" className="mt-2 w-fit" onClick={() => setHours({})} title="Clear all hours to pause this section">
              Pause section
            </Button>
          </Field>
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} title="Cancel">Cancel</Button>
          <Button type="submit" disabled={!name.trim()} loading={saving} title="Save section">Save</Button>
        </div>
      </form>
    </Modal>
  );
}

const SPICE_LEVELS = [0, 1, 2, 3];
const spiceIcons = (n, size = 12) => Array.from({ length: n }, (_, i) => <Flame key={i} size={size} />);
const spiceLabel = (n) => (n === 0 ? 'None' : <span className="inline-flex gap-px text-accent">{spiceIcons(n)}</span>);

const EMPTY_ITEM_FORM = { name: '', description: '', price: '', spiceLevel: 0, diet: 'none', allergens: [], promoLabel: 'none', variants: [], addOns: [] };

// Rows are edited in place and removed by their index -- no ids, because array order is the only
// identity one of these has (it is the display order on the menu, and that is all it is).
function PriceRows({ rows, onChange, max, noun, addLabel, labelPlaceholder, pricePlaceholder }) {
  const set = (i, patch) => onChange(rows.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-1.5">
          {/* Width lives on wrappers, not on the Inputs: cn() here is a plain join with no
              tailwind-merge, so a w-28 passed to Input would sit alongside its own w-full
              and the winner would come down to Tailwind's stylesheet order. */}
          <div className="min-w-0 flex-1">
            <Input value={r.label} onChange={(e) => set(i, { label: e.target.value })} placeholder={labelPlaceholder} maxLength={20} />
          </div>
          <div className="w-28 shrink-0">
            <Input value={r.price} onChange={(e) => set(i, { price: e.target.value })} placeholder={pricePlaceholder} inputMode="decimal" />
          </div>
          <IconButton type="button" aria-label={`Remove ${noun}`} title={`Remove ${r.label || `this ${noun}`}`} onClick={() => onChange(rows.filter((_, n) => n !== i))}>
            <Trash2 />
          </IconButton>
        </div>
      ))}
      {rows.length < max && (
        <Button type="button" variant="ghost" className="self-start" onClick={() => onChange([...rows, { label: '', price: '' }])} title={addLabel}>
          <Plus /> {addLabel}
        </Button>
      )}
    </div>
  );
}

function ItemModal({ state, saving, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY_ITEM_FORM);
  useEffect(() => {
    if (state) setForm({
      name: state.name || '',
      description: state.description || '',
      price: state.price || '',
      spiceLevel: state.spiceLevel || 0,
      // Radix Select can't represent "no selection" as an empty string, so 'none' stands in for
      // it here and gets translated back to '' on save -- dietary.js's dietError only recognises
      // '', null, undefined, 'vegetarian' or 'vegan'. Same trick for promoLabel below.
      diet: state.diet || 'none',
      allergens: state.allergens || [],
      promoLabel: state.promoLabel || 'none',
      variants: state.variants || [],
      addOns: state.addOns || [],
    });
  }, [state]);

  // Sizes and add-ons are the same editor pointed at a different key on the form.
  const setRows = (key, rows) => setForm((f) => ({ ...f, [key]: rows }));

  function toggleAllergen(a) {
    setForm((f) => ({
      ...f,
      allergens: f.allergens.includes(a) ? f.allergens.filter((x) => x !== a) : [...f.allergens, a],
    }));
  }

  return (
    <Modal open={!!state} onOpenChange={(o) => !o && onClose()} title={state?.id ? 'Edit dish' : 'New dish'}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            ...form,
            diet: form.diet === 'none' ? '' : form.diet,
            promoLabel: form.promoLabel === 'none' ? '' : form.promoLabel,
          });
        }}
        className="flex flex-col gap-4"
      >
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Calamari" required />
        </Field>
        <Field label="Description" hint="Optional.">
          <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Grilled, lemon butter" />
        </Field>
        <Field label="Price" hint="Leave blank for market price, or when the dish is priced by size below. R189, 189.50 and 189,50 all work.">
          <Input value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="R89.00" inputMode="decimal" />
        </Field>
        <Field label="Sizes" as="div" hint="Optional. 300ml/500ml, half/full, glass/bottle -- up to four, shown on the menu in this order.">
          <PriceRows
            rows={form.variants}
            onChange={(rows) => setRows('variants', rows)}
            max={MAX_VARIANTS}
            noun="size"
            addLabel="Add size"
            labelPlaceholder="500ml"
            pricePlaceholder="R35.00"
          />
        </Field>
        <Field label="Add-ons" as="div" hint="Optional. Extras a diner can ask for -- up to six, listed on the dish when it is opened. Price 0 shows as free.">
          <PriceRows
            rows={form.addOns}
            onChange={(rows) => setRows('addOns', rows)}
            max={MAX_ADD_ONS}
            noun="add-on"
            addLabel="Add add-on"
            labelPlaceholder="Extra cheese"
            pricePlaceholder="R10.00"
          />
        </Field>
        <Field label="Promotion" hint="One label max -- shows as a pill next to the dish name on the menu.">
          <Select value={form.promoLabel} onValueChange={(promoLabel) => setForm({ ...form, promoLabel })}>
            <SelectItem value="none">None</SelectItem>
            {Object.entries(PROMO_LABEL_TEXT).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </Select>
        </Field>
        <Field label="Spice" as="div">
          <div className="flex gap-1.5">
            {SPICE_LEVELS.map((n) => (
              <Button
                key={n}
                type="button"
                variant="secondary"
                // Inline style, not a `bg-raised` className: Button's own variant classes already
                // set bg-transparent, and this codebase's cn() is a plain join (no tailwind-merge),
                // so a same-property className here would lose to it rather than override it.
                style={form.spiceLevel === n ? { backgroundColor: 'var(--color-raised)' } : undefined}
                onClick={() => setForm({ ...form, spiceLevel: n })}
                title={`Spice level: ${n === 0 ? 'None' : n}`}
              >
                {spiceLabel(n)}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Diet">
          <Select value={form.diet} onValueChange={(diet) => setForm({ ...form, diet })}>
            <SelectItem value="none">No claim</SelectItem>
            <SelectItem value="vegetarian">Vegetarian</SelectItem>
            <SelectItem value="vegan">Vegan</SelectItem>
          </Select>
        </Field>
        <Field label="Allergens" as="div" hint="Only what you tick here reaches the menu -- leave it blank rather than guess.">
          {/* Same toggle-pill pattern as Spice above, not a checkbox list -- a fixed vocabulary of
              14 is a set of choices to tap, not a form of independent yes/no fields. */}
          <div className="flex flex-wrap gap-1.5">
            {ALLERGENS.map((a) => (
              <Button
                key={a}
                type="button"
                variant={form.allergens.includes(a) ? 'secondary' : 'ghost'}
                aria-pressed={form.allergens.includes(a)}
                onClick={() => toggleAllergen(a)}
                title={`Toggle ${ALLERGEN_LABELS[a]}`}
              >
                {ALLERGEN_LABELS[a]}
              </Button>
            ))}
          </div>
        </Field>
        <div className="mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving} title="Cancel">Cancel</Button>
          <Button type="submit" disabled={!form.name.trim()} loading={saving} title="Save dish">Save</Button>
        </div>
      </form>
    </Modal>
  );
}
