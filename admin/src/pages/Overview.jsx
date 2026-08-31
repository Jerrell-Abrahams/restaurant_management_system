import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Check, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { Button } from '../components/ui/Button';
import { Card, MicroLabel } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { Stars } from '../components/ui/Stars';
import { cn } from '../components/ui/cn';
import { scoreColor, Trend } from './Dishes';

const when = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso)) / 60000);
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
};

export function Overview() {
  const { restaurant, restaurantId, summary, reloadSummary } = useOutletContext();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(null);
  const [boards, setBoards] = useState(null);

  useEffect(() => {
    api.getMenu(restaurantId).then(setMenu).catch((err) => toast.error(err.message));
    api.getDishes(restaurantId).then((d) => setBoards(d.boards)).catch((err) => toast.error(err.message));
  }, [restaurantId]);

  const soldOut = useMemo(() => {
    if (!menu) return [];
    const out = [];
    menu.forEach((cat) => cat.items.forEach((i) => {
      if (!i.available && !i.archived_at) out.push(i);
    }));
    return out;
  }, [menu]);

  async function backOn(item) {
    try {
      await api.updateItem(restaurantId, item.id, { available: true });
      toast.success(`${item.name} is back on`);
      api.getMenu(restaurantId).then(setMenu);
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function resolveVisit(id) {
    try {
      await api.updateVisit(restaurantId, id, { resolved: true });
      toast.success('Marked resolved');
      reloadSummary();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!summary) {
    return <div className="flex flex-col gap-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>;
  }

  // No visits at all yet, rather than "quiet today" -- average is null only when nothing has
  // ever been rated, so it is the one number that can tell the two apart.
  const firstRun = summary.average === null;

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 font-serif text-[26px] font-medium tracking-[-0.015em]">Overview</h1>
          <p className="text-[12.5px] text-muted">
            {firstRun ? 'Nothing has been scanned yet — two things left to do' : 'What’s happening across your restaurant'}
          </p>
        </div>
        {restaurant?.service_requests_enabled && (
          <Button
            variant="secondary"
            title="Open the kitchen display in a new window"
            // Synchronous inside the click handler, no await before it -- an async window.open is
            // a popup block in most browsers.
            onClick={() => window.open(`/r/${restaurantId}/display`, 'kitchen-display')}
          >
            Open kitchen display
          </Button>
        )}
      </div>

      {firstRun ? (
        <Card className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border-2 bg-raised text-dim">
            <UtensilsCrossed size={30} />
          </div>
          <div>
            <h2 className="font-serif text-[19px] font-semibold text-text">No scans yet — that is expected</h2>
            <p className="mt-1.5 max-w-lg text-[13px] leading-relaxed text-muted">
              Feedback appears here the moment a diner scans a coaster. Two things left: check your
              menu reads the way you want it to, and get the code onto the tables.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => navigate(`/r/${restaurantId}/menu`)} title="Go to the menu editor">Check the menu</Button>
              <Button variant="secondary" onClick={() => navigate(`/r/${restaurantId}/qr`)} title="Go to the QR code page">Get the coaster file</Button>
            </div>
          </div>
        </Card>
      ) : (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Ratings today" value={summary.todayCount} />
            <Stat label="Average visit" value={summary.average} tone="ok" />
            <Stat label="Needs attention" value={summary.openIssues} tone={summary.openIssues > 0 ? 'bad' : undefined} />
            <Stat label="Off the menu" value={menu ? soldOut.length : null} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr] lg:items-start">
            <div className="flex flex-col gap-3">
              <div className="flex items-baseline gap-2">
                <h2 className="font-serif text-[17px] font-semibold">Deal with these first</h2>
                <button onClick={() => navigate(`/r/${restaurantId}/feedback`)} className="ml-auto text-[12px] text-accent" title="Open the feedback inbox">
                  Open inbox
                </button>
              </div>
              <Card className="p-0">
                {summary.urgent.length === 0 ? (
                  <p className="px-4 py-6 text-center text-[13px] text-text">
                    Nothing unresolved. Every unhappy table has been dealt with.
                  </p>
                ) : (
                  summary.urgent.map((v) => (
                    <div key={v.id} className="flex gap-3 border-b border-border px-4 py-3 last:border-0">
                      <Stars value={v.rating} size={14} className="self-center" />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] leading-snug text-text">
                          {v.comment || <span className="text-dim">No comment</span>}
                        </p>
                        <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] text-dim">
                          <span>{when(v.createdAt)}</span>
                          {v.itemCount > 0 && <span>· {v.itemCount} dish{v.itemCount === 1 ? '' : 'es'}</span>}
                          {v.contact && <span>· contact left</span>}
                        </div>
                      </div>
                      <Button onClick={() => resolveVisit(v.id)} className="shrink-0 self-start" title="Mark resolved">
                        <Check /> Resolve
                      </Button>
                    </div>
                  ))
                )}
              </Card>

              <div className="mt-2 flex items-baseline gap-2">
                <h2 className="font-serif text-[17px] font-semibold">Off the menu right now</h2>
                <button onClick={() => navigate(`/r/${restaurantId}/menu`)} className="ml-auto text-[12px] text-accent" title="Go to the menu editor">
                  Edit menu
                </button>
              </div>
              {soldOut.length === 0 ? (
                <p className="text-[12.5px] text-dim">Everything on the menu is available.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {soldOut.map((item) => (
                    <span
                      key={item.id}
                      className="flex items-center gap-2 rounded-full border border-border-2 bg-panel py-1 pl-3 pr-1 text-[12.5px]"
                    >
                      {item.name}
                      <button onClick={() => backOn(item)} className="rounded-full bg-raised px-2.5 py-1 text-[11px] text-muted" title={`Mark ${item.name} back on the menu`}>
                        Back on
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3">
              <h2 className="font-serif text-[17px] font-semibold">Dishes to watch</h2>
              <Card className="p-0">
                {!boards ? (
                  <div className="p-4"><Skeleton className="h-20 w-full" /></div>
                ) : boards.worst.length === 0 && boards.best.length === 0 ? (
                  <p className="px-4 py-5 text-[12.5px] text-dim">Not enough ratings yet to rank anything.</p>
                ) : (
                  <>
                    {boards.worst.slice(0, 2).map((d) => (
                      <div key={d.id} className="flex flex-col gap-1 border-b border-border px-4 py-3">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[13px] font-medium text-text">{d.name}</span>
                          <span className={cn('ml-auto text-[13px] font-semibold tabular-nums', scoreColor(d.average))}>
                            {d.average}
                          </span>
                          <span className="font-mono text-[10px] text-dim">{d.count} ratings</span>
                        </div>
                        <Trend value={d.trend} />
                      </div>
                    ))}
                    {boards.best[0] && (
                      <div className="flex items-baseline gap-2 px-4 py-3">
                        <span className="text-[13px] font-medium text-text">{boards.best[0].name}</span>
                        <span className="ml-auto text-[13px] font-semibold tabular-nums text-ok">{boards.best[0].average}</span>
                        <span className="font-mono text-[10px] text-dim">best rated</span>
                      </div>
                    )}
                  </>
                )}
              </Card>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  return (
    <Card className="p-3.5">
      <MicroLabel>{label}</MicroLabel>
      <div
        className={cn(
          'mt-1.5 text-[26px] font-medium tabular-nums',
          tone === 'ok' && 'text-ok',
          tone === 'bad' && 'text-bad',
          !tone && 'text-text'
        )}
      >
        {value === null || value === undefined ? <Skeleton className="h-6 w-10" /> : value}
      </div>
    </Card>
  );
}
