import { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { toast } from 'sonner';
import {
  CartesianGrid, Legend, Line, LineChart, Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import * as api from '../api';
import { Card, CardHeader, CardTitle, MicroLabel } from '../components/ui/Card';
import { Skeleton } from '../components/ui/Skeleton';
import { cn } from '../components/ui/cn';

const shortDate = (d) => new Date(d).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
const hourLabel = (h) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`);

// Every panel shares this so the tooltip reads as one system instead of recharts' defaults.
const tooltipStyle = {
  background: 'var(--color-panel)',
  border: '1px solid var(--color-border)',
  borderRadius: 8,
  fontSize: 12.5,
  color: 'var(--color-text)',
};

export function Analytics() {
  const { restaurant, restaurantId } = useOutletContext();
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getAnalytics(restaurantId).then(setData).catch((err) => toast.error(err.message));
  }, [restaurantId]);

  if (!data) return <div className="flex flex-col gap-3">{[0, 1].map((i) => <Skeleton key={i} className="h-56 w-full" />)}</div>;

  const { series, distribution, scansByHour, totalScans, totalRatings } = data;
  const empty = totalScans === 0 && totalRatings === 0;

  // Every ~5th day, so 30 daily points don't crowd the x-axis into an unreadable blur.
  const tickInterval = Math.max(0, Math.ceil(series.length / 6) - 1);

  return (
    <div>
      <h1 className="mb-1 font-serif text-[26px] font-medium tracking-[-0.015em]">Analytics</h1>
      <p className="mb-5 text-[12.5px] text-muted">Last 30 days of scans and feedback, day by day.</p>

      {empty ? (
        <Card className="p-8 text-center text-[13px] text-muted">
          Not enough activity in the last 30 days to chart yet. Come back once a few tables have scanned and rated.
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Stat label="Scans, last 30 days" value={totalScans} />
            <Stat label="Ratings, last 30 days" value={totalRatings} />
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card className="p-0">
              <CardHeader><CardTitle>Scans & ratings</CardTitle></CardHeader>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      interval={tickInterval}
                      tick={{ fill: 'var(--color-dim)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--color-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
                    <Line type="monotone" dataKey="scans" name="Scans" stroke="var(--color-accent)" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="ratings" name="Ratings" stroke="var(--color-ok)" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-0">
              <CardHeader><CardTitle>Average rating</CardTitle></CardHeader>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      interval={tickInterval}
                      tick={{ fill: 'var(--color-dim)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    {/* Fixed 1-5 domain -- a 4.2 should never sit at the top of the chart just
                        because nothing lower happened this month. */}
                    <YAxis domain={[1, 5]} tick={{ fill: 'var(--color-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
                    {/* Gaps on quiet days are deliberate -- see lib/analytics.js: a day with no
                        ratings has no average, and connecting through it would invent one. */}
                    <Line type="monotone" dataKey="average" name="Average" stroke="var(--color-warn)" strokeWidth={2} dot={false} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <Card className="p-0">
              <CardHeader><CardTitle>Ratings by star</CardTitle></CardHeader>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={distribution} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="star"
                      tickFormatter={(s) => `${s}★`}
                      tick={{ fill: 'var(--color-dim)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--color-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-chart-cursor)' }} />
                    <Bar dataKey="count" name="Ratings" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-0">
              <CardHeader><CardTitle>Scans by hour</CardTitle></CardHeader>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={scansByHour} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="hour"
                      tickFormatter={hourLabel}
                      interval={3}
                      tick={{ fill: 'var(--color-dim)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--color-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--color-chart-cursor)' }} labelFormatter={hourLabel} />
                    <Bar dataKey="count" name="Scans" fill="var(--color-ok)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          {restaurant?.service_requests_enabled && (
            <Card className="p-0">
              <CardHeader><CardTitle>Service requests</CardTitle></CardHeader>
              <div className="p-3">
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={series} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={shortDate}
                      interval={tickInterval}
                      tick={{ fill: 'var(--color-dim)', fontSize: 11 }}
                      axisLine={{ stroke: 'var(--color-border)' }}
                      tickLine={false}
                    />
                    <YAxis allowDecimals={false} tick={{ fill: 'var(--color-dim)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip contentStyle={tooltipStyle} labelFormatter={shortDate} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="waiter" name="Waiter" stackId="requests" fill="var(--color-warn)" />
                    <Bar dataKey="bill" name="Bill" stackId="requests" fill="var(--color-accent)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <Card className="p-3.5">
      <MicroLabel>{label}</MicroLabel>
      <div className={cn('mt-1.5 text-[22px] font-semibold tabular-nums text-text')}>{value}</div>
    </Card>
  );
}
