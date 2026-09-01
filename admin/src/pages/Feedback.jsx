import { useCallback, useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { Check, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, MicroLabel } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Skeleton } from '../components/ui/Skeleton';
import { Stars } from '../components/ui/Stars';
import { cn } from '../components/ui/cn';

const when = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
};

const FILTERS = [
  { key: 'all', label: 'All', params: '' },
  { key: 'needs', label: 'Needs attention', params: '?maxRating=3&resolved=false' },
  { key: 'unresolved', label: 'Unresolved', params: '?resolved=false' },
];

export function Feedback() {
  const { restaurant, restaurantId, reloadSummary } = useOutletContext();
  const [visits, setVisits] = useState(null);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(() => {
    const params = FILTERS.find((f) => f.key === filter).params;
    api.getFeedback(restaurantId, params).then(setVisits).catch((err) => toast.error(err.message));
  }, [restaurantId, filter]);

  useEffect(() => {
    setVisits(null);
    load();
  }, [load]);

  const stats = useMemo(() => {
    if (!visits) return null;
    const rated = visits.filter((v) => v.rating);
    const avg = rated.length ? rated.reduce((a, v) => a + v.rating, 0) / rated.length : null;
    return {
      total: visits.length,
      average: avg === null ? '–' : avg.toFixed(1),
      // The number that should nag. Low-rated and still not dealt with.
      needsAttention: visits.filter((v) => v.rating && v.rating <= (restaurant?.alert_threshold ?? 3) && !v.resolved).length,
    };
  }, [visits, restaurant]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-[26px] font-medium tracking-[-0.015em]">Feedback</h1>
        <div className="flex gap-1.5">
          {FILTERS.map((f) => (
            <Button key={f.key} variant={filter === f.key ? 'secondary' : 'ghost'} onClick={() => setFilter(f.key)} title={`Filter: ${f.label}`}>
              {f.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-3">
        <Stat label="Visits" value={stats ? stats.total : null} />
        <Stat label="Average" value={stats ? stats.average : null} />
        <Stat label="Needs attention" value={stats ? stats.needsAttention : null} alert={stats?.needsAttention > 0} />
      </div>

      {!visits ? (
        <div className="flex flex-col gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : visits.length === 0 ? (
        <Card className="p-8 text-center text-[13px] text-muted">
          Nothing here yet. Feedback appears the moment a diner scans a coaster and rates something.
        </Card>
      ) : (
        <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto pr-1">
          {visits.map((v) => (
            <VisitRow
              key={v.id}
              visit={v}
              restaurantId={restaurantId}
              open={expanded === v.id}
              onToggle={() => setExpanded(expanded === v.id ? null : v.id)}
              onChanged={() => {
                load();
                reloadSummary();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, alert }) {
  return (
    <Card className="p-3.5">
      <MicroLabel>{label}</MicroLabel>
      <div className={cn('mt-1.5 text-[22px] font-semibold tabular-nums', alert ? 'text-bad' : 'text-text')}>
        {value === null ? <Skeleton className="h-6 w-10" /> : value}
      </div>
    </Card>
  );
}

function VisitRow({ visit, restaurantId, open, onToggle, onChanged }) {
  const [note, setNote] = useState(visit.resolved_note || '');
  const [busy, setBusy] = useState(false);

  async function save(resolved) {
    setBusy(true);
    try {
      await api.updateVisit(restaurantId, visit.id, { resolved, resolvedNote: note });
      toast.success(resolved ? 'Marked resolved' : 'Reopened');
      onChanged();
    } catch (err) {
      // 402 is the lapsed-subscription case; the banner already explains it, so this stays terse.
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className={cn('p-0', visit.resolved && 'opacity-60')}>
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left" title={open ? 'Collapse' : 'Expand'}>
        {visit.rating ? <Stars value={visit.rating} size={15} /> : <Badge>Suggestion</Badge>}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13.5px] text-text">
            {visit.comment || <span className="text-dim">No comment</span>}
          </div>
          <div className="mt-0.5 flex items-center gap-2 font-mono text-[10.5px] text-dim">
            <span>{when(visit.created_at)}</span>
            {visit.items.length > 0 && <span>· {visit.items.length} dish{visit.items.length === 1 ? '' : 'es'}</span>}
            {visit.contact && <span>· contact left</span>}
            {visit.resolved && <span className="text-ok">· resolved</span>}
          </div>
        </div>
        <ChevronDown size={14} className={cn('shrink-0 text-dim transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3.5">
          {visit.items.length > 0 && (
            <div className="mb-3.5">
              <MicroLabel className="mb-1.5">Dishes rated</MicroLabel>
              {visit.items.map((i) => (
                <div key={i.menu_item_id} className="flex items-baseline gap-2 py-1 text-[13px]">
                  <Stars value={i.rating} size={12} />
                  <span className="text-text">{i.name}</span>
                  {i.comment && <span className="text-muted">— {i.comment}</span>}
                </div>
              ))}
            </div>
          )}

          {visit.contact && (
            <div className="mb-3.5">
              <MicroLabel className="mb-1">Contact</MicroLabel>
              <div className="text-[13px] text-text">{visit.contact}</div>
              {/* POPIA: say the retention rule where the data is, not only in a policy document. */}
              <p className="mt-1 text-[11px] text-dim">
                They asked to be contacted about this visit. Deleted automatically after 90 days.
              </p>
            </div>
          )}

          <MicroLabel className="mb-1.5">Internal note</MicroLabel>
          <Input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="What did you do about it?"
            className="mb-2.5"
          />
          <div className="flex gap-2">
            {visit.resolved ? (
              <Button variant="secondary" onClick={() => save(false)} disabled={busy} loading={busy} title="Reopen this feedback item">Reopen</Button>
            ) : (
              <Button onClick={() => save(true)} disabled={busy} loading={busy} title="Mark this feedback item resolved">
                {!busy && <Check />} Mark resolved
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
