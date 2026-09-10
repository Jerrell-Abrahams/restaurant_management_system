import { useEffect, useState } from 'react';
import { useOutletContext, useParams } from 'react-router-dom';
import { ClipboardList } from 'lucide-react';
import * as api from '../api';
import { Card } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../components/ui/cn';
import { rands } from '../lib/money';

// The owner's read of the floor: what each table ordered in the last 24 hours, and what it came to.
// Deliberately NOT live -- the pass already has the live view, and a screen that reorders itself
// under an owner trying to read one order is worse than one that needs a refresh.
//
// 24 hours rather than a calendar day: a shift that runs past midnight is one service, and an owner
// cashing up at 01:30 means "tonight" when they say today.

const STATUS = {
  pending: { label: 'Waiting', tone: 'text-accent border-accent/40' },
  accepted: { label: 'In the kitchen', tone: 'text-ok border-ok/40' },
  done: { label: 'Done', tone: 'text-dim border-border-2' },
};

export function Orders() {
  const { restaurantId } = useParams();
  const { restaurant } = useOutletContext();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.getOrders(restaurantId)
      .then((data) => { if (!cancelled) setOrders(data); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [restaurantId]);

  // The tier is off. Say so plainly rather than showing an empty list that reads as "no orders
  // tonight" -- an owner seeing zero orders on a busy night will phone about it.
  if (restaurant && !restaurant.ordering_enabled) {
    return (
      <div className="flex flex-col gap-6">
        <PageHead />
        <Card>
          <div className="flex flex-col items-center gap-2 p-8 text-center">
            <ClipboardList size={26} className="text-dim" />
            <p className="text-[15px] font-medium">Table ordering is off</p>
            <p className="max-w-sm text-[13px] text-muted">
              Diners can rate dishes and call a waiter, but they cannot send an order to the
              kitchen. Turn it on in Settings.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  const total = (orders || []).reduce((sum, o) => sum + o.total_cents, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHead />

      {error && <p className="text-[13px] text-bad">{error}</p>}

      {orders === null ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : orders.length === 0 ? (
        <Card>
          <p className="p-8 text-center text-[13px] text-muted">Nothing ordered in the last 24 hours.</p>
        </Card>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="flex items-baseline gap-2">
              <span className="font-serif text-[26px] font-medium">{orders.length}</span>
              <span className="text-[13px] text-muted">order{orders.length === 1 ? '' : 's'}</span>
            </span>
            <span className="flex items-baseline gap-2">
              <span className="font-serif text-[26px] font-medium tabular-nums">{rands(total)}</span>
              <span className="text-[13px] text-muted">ordered through the table</span>
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {orders.map((o) => <OrderRow key={o.id} order={o} />)}
          </div>
        </>
      )}
    </div>
  );
}

function PageHead() {
  return (
    <div>
      <h1 className="font-serif text-[28px] font-medium">Orders</h1>
      <p className="text-[13px] text-muted">What each table sent to the kitchen, last 24 hours</p>
    </div>
  );
}

function OrderRow({ order }) {
  const status = STATUS[order.status] || STATUS.done;
  const at = new Date(order.created_at);
  return (
    <Card>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-3">
            <span className="text-[15px] font-semibold">Table {order.table_label}</span>
            <span className={cn('rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em]', status.tone)}>
              {status.label}
            </span>
          </span>
          <span className="font-mono text-[12px] tabular-nums text-dim">
            {at.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>

        <ul className="flex flex-col gap-1">
          {(order.order_items || []).map((line, i) => (
            <li key={i} className="flex items-baseline gap-2 text-[13.5px]">
              <span className="min-w-[1.6rem] font-mono tabular-nums text-muted">{line.qty}&times;</span>
              <span className="flex-1">
                {line.name_snapshot}
                {line.variant_label && <span className="text-muted"> &middot; {line.variant_label}</span>}
                {(line.add_ons || []).map((a, j) => (
                  <span key={j} className="text-muted"> + {a.label}</span>
                ))}
              </span>
              <span className="font-mono text-[12.5px] tabular-nums text-muted">{rands(line.line_cents)}</span>
            </li>
          ))}
        </ul>

        <div className="flex justify-end border-t border-border pt-2">
          <span className="font-mono text-[13px] font-medium tabular-nums">{rands(order.total_cents)}</span>
        </div>
      </div>
    </Card>
  );
}
