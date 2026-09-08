import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { Card, CardHeader, CardTitle } from '../components/ui/Card';
import { Table, Thead, Tbody, Tr, Th, Td } from '../components/ui/Table';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../components/ui/cn';

// Colour follows the score, not the rank: a 4.6 is good whether or not it happens to be bottom of
// a very good menu. Exported so Overview's "dishes to watch" panel renders the same way.
export const scoreColor = (avg) => (avg === null ? 'text-dim' : avg >= 4 ? 'text-ok' : avg >= 3 ? 'text-warn' : 'text-bad');

export function Dishes() {
  const { restaurantId } = useOutletContext();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getDishes(restaurantId).then(setData).catch((err) => toast.error(err.message));
  }, [restaurantId]);

  if (!data) return <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full" />)}</div>;

  const { boards, dishes, minRatings } = data;
  const live = dishes.filter((d) => !d.archived);
  const anyRanked = boards.best.length > 0;

  return (
    <div>
      <h1 className="mb-1 font-serif text-[26px] font-medium tracking-[-0.015em]">Dishes</h1>
      <p className="mb-5 text-[12.5px] text-muted">
        What diners rated, and how it is moving. Nothing is ranked until it has {minRatings} ratings.
      </p>

      {!anyRanked ? (
        <Card className="p-8 text-center">
          <p className="text-[13px] text-text">Not enough ratings to rank anything yet.</p>
          <p className="mx-auto mt-1.5 max-w-md text-[12.5px] text-muted">
            A dish needs {minRatings} ratings before it appears in a list here. Ranking two ratings
            would be guessing, and you would act on it.
          </p>
        </Card>
      ) : (
        <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
          <Board title="Best rated" rows={boards.best} />
          <Board title="Needs work" rows={boards.worst} />
          <Board title="Most rated" rows={boards.mostRated} metric="count" />
          <Board title="Slipping" rows={boards.slipping} metric="trend" empty="Nothing is trending down." />
          {boards.byCategory.length > 0 && (
            <Board title="By category" rows={boards.byCategory} className="md:col-span-2" />
          )}
        </div>
      )}

      <Card className="p-0">
        <CardHeader>
          <CardTitle>Every dish</CardTitle>
          {boards.unrankedCount > 0 && (
            <span className="font-mono text-[10.5px] text-dim">
              {boards.unrankedCount} awaiting ratings
            </span>
          )}
        </CardHeader>
        {live.length === 0 ? (
          <p className="px-4 py-6 text-[12.5px] text-dim">No dishes on the menu yet.</p>
        ) : (
          <Table containerClassName="max-h-[420px] overflow-y-auto">
            <Thead className="sticky top-0 z-10">
              <Tr>
                <Th>Dish</Th>
                <Th className="text-right">Ratings</Th>
                <Th className="text-right">Average</Th>
                <Th className="text-right">Last 30d</Th>
                <Th className="text-right">Trend</Th>
              </Tr>
            </Thead>
            <Tbody>
              {live.map((d) => (
                <Tr key={d.id}>
                  <Td className="text-text">
                    {d.name}
                    {!d.ranked && (
                      <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.08em] text-dim">
                        needs {minRatings - d.count} more
                      </span>
                    )}
                  </Td>
                  {/* The count sits next to the average always, so a 5.0 from one diner can never
                      read as a verdict. */}
                  <Td className="text-right tabular-nums">{d.count}</Td>
                  <Td className={cn('text-right tabular-nums font-medium', scoreColor(d.average))}>
                    {d.average ?? '–'}
                  </Td>
                  <Td className="text-right tabular-nums">{d.recentAverage ?? '–'}</Td>
                  <Td className="text-right tabular-nums">
                    <Trend value={d.trend} />
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}

function Board({ title, rows, metric = 'average', empty = 'Not enough ratings yet.', className }) {
  return (
    <Card className={cn('p-0', className)}>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      {rows.length === 0 ? (
        <p className="px-4 py-5 text-[12.5px] text-dim">{empty}</p>
      ) : (
        rows.map((d) => (
          <div key={d.id} className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5 last:border-0">
            <span className="min-w-0 flex-1 truncate text-[13px] text-text">{d.name}</span>
            <span className="flex shrink-0 items-baseline gap-2">
              {metric === 'trend' ? (
                <Trend value={d.trend} />
              ) : metric === 'count' ? (
                <span className="text-[13px] tabular-nums text-text">{d.count}</span>
              ) : (
                <span className={cn('text-[13px] font-medium tabular-nums', scoreColor(d.average))}>{d.average}</span>
              )}
              <span className="font-mono text-[10px] text-dim">{d.count} rating{d.count === 1 ? '' : 's'}</span>
            </span>
          </div>
        ))
      )}
    </Card>
  );
}

export function Trend({ value }) {
  // Null means there was nothing to compare against, not that nothing changed. Rendering it as
  // "0.0" would be a claim we cannot support.
  if (value === null || value === undefined) return <span className="text-dim">–</span>;
  if (value === 0) return <span className="text-muted">0.0</span>;
  const up = value > 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5', up ? 'text-ok' : 'text-bad')}>
      {up ? <ArrowUp size={11} /> : <ArrowDown size={11} />}
      {Math.abs(value).toFixed(1)}
    </span>
  );
}
