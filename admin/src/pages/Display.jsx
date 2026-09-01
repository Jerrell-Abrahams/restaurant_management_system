import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ConciergeBell, Receipt, CheckCircle2, QrCode, Volume2, VolumeX, Maximize } from 'lucide-react';
import { toast } from 'sonner';
import * as api from '../api';
import { IconButton } from '../components/ui/Button';
import { cn } from '../components/ui/cn';

// Design: "Waiter Call Board", variant 1A -- ticket wall, sized for a monitor read from a few
// metres away. Cards go from calm to loud: only the single longest-waiting request gets the
// filled, pulsing treatment, everything else stays quiet, and a claimed card lingers dimmed for a
// few seconds rather than vanishing mid-tap.
//
// The mockup's cards also carry a server name, seat count and bill total -- none of which this
// product tracks (no seating plan, no POS integration). Shown here is only what's real: table
// label, kind, and elapsed time.

const POLL_MS = 5000;
const CLAIMED_LINGER_MS = 4000;
const KIND = {
  waiter: { label: 'Waiter needed', icon: ConciergeBell },
  bill: { label: 'Bill requested', icon: Receipt },
};

function elapsedLabel(createdAt) {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000));
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

// One oscillator pair, no asset file -- two notes carry over kitchen noise better than one tone.
// The AudioContext is created lazily and cached on the function itself (not in React state) so it
// survives re-renders without a ref plumbed through props.
function chime() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;
  const ctx = (chime.ctx ||= new AudioCtx());
  if (ctx.state === 'suspended') ctx.resume();
  const t = ctx.currentTime;
  [880, 1174.7].forEach((hz, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = hz;
    const at = t + i * 0.16;
    // Ramped in and out -- a square-edged gain change is an audible click on cheap TV speakers.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(0.25, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(at);
    osc.stop(at + 0.5);
  });
}

// Sits OUTSIDE <Layout/> deliberately (see App.jsx) -- a sidebar, nav badge, log-out button and
// lapsed-subscription banner are all wrong on a screen meant to be read from across a kitchen.
export function Display() {
  const { restaurantId } = useParams();
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [rows, setRows] = useState(null); // server truth: open, unacknowledged
  const [claimed, setClaimed] = useState([]); // transient ghosts, independent of polling -- see ack()
  const [lastPoll, setLastPoll] = useState(null);
  const [failing, setFailing] = useState(false);
  // Sound starts OFF. A window opened via window.open() carries no user gesture of its own, so an
  // AudioContext created on load is born suspended by the browser's autoplay policy -- it would
  // never actually sound. Unmuting IS the enabling gesture; see toggleMute below.
  const [muted, setMuted] = useState(() => {
    try { return localStorage.getItem('display-muted') === '1'; } catch { return false; }
  });
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  // Restaurant-wide ceiling, not a default (Settings.jsx): browser autoplay can't force sound ON
  // for a device that hasn't unmuted itself with its own gesture, so this can only ever silence,
  // never enable, and it overrides the local toggle above rather than just seeding it.
  const [forcedMute, setForcedMute] = useState(false);
  const forcedMuteRef = useRef(false);
  forcedMuteRef.current = forcedMute;
  const seen = useRef(null); // null until the first poll lands
  const nudged = useRef(null); // id -> last nudged_at reacted to, null until the first poll lands

  useEffect(() => {
    api.getRestaurant(restaurantId).then((r) => {
      setName(r.name);
      setLogoUrl(r.logo_url || '');
      setForcedMute(!!r.service_requests_chime_muted);
    }).catch(() => {});
  }, [restaurantId]);

  // A 1s ticker redraws the clock and every card's elapsed time between polls -- otherwise "2:41"
  // would sit frozen for up to 5s at a time on a screen whose whole point is showing how long
  // someone has been waiting.
  const [, tick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    let stopped = false;
    let timer;

    async function poll() {
      // A wall display never backgrounds. A forgotten browser tab does, and would otherwise poll
      // all night against the same per-IP rate limit the actual console needs.
      if (!document.hidden) {
        try {
          const data = await api.getServiceRequests(restaurantId);
          if (stopped) return;
          // The first response seeds the sets silently -- opening the display with 3 cards already
          // waiting (or already nudged) should not greet the kitchen with 3 chimes at once.
          const isNew = (r) => seen.current && !seen.current.has(r.id);
          // Compared by value, not presence -- a request can be nudged more than once, and each
          // one is a fresh "still waiting" that deserves its own chime.
          const isFreshNudge = (r) => nudged.current && r.nudged_at && nudged.current.get(r.id) !== r.nudged_at;
          if (seen.current && data.some((r) => isNew(r) || isFreshNudge(r)) && !mutedRef.current && !forcedMuteRef.current) chime();
          seen.current = new Set(data.map((r) => r.id));
          nudged.current = new Map(data.map((r) => [r.id, r.nudged_at || null]));
          setRows(data);
          setLastPoll(Date.now());
          setFailing(false);
        } catch {
          // Deliberately does NOT clear rows to [] on a failed poll -- that would show a false
          // "All clear" instead of the stale-but-honest previous list. The header dot is what
          // tells staff to trust the router, not the screen.
          if (!stopped) setFailing(true);
        }
      }
      // setTimeout, not setInterval: a slow response on restaurant wifi must not let polls stack
      // up behind each other.
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    }
    poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [restaurantId]);

  // Keeps the screen from sleeping mid-service. Degrades silently where unsupported -- this is a
  // nicety, not something worth a fallback UI over.
  useEffect(() => {
    let lock;
    async function acquire() {
      try {
        lock = await navigator.wakeLock?.request('screen');
      } catch {
        /* unsupported, denied, or the tab wasn't visible -- fine either way */
      }
    }
    acquire();
    const onVisible = () => document.visibilityState === 'visible' && acquire();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      lock?.release().catch(() => {});
    };
  }, []);

  function toggleMute() {
    setMuted((was) => {
      const next = !was;
      try { localStorage.setItem('display-muted', next ? '1' : '0'); } catch { /* private mode */ }
      if (!next) chime(); // the click that unmutes is also the gesture that resumes the context
      return next;
    });
  }

  async function ack(row) {
    // Removed from the live list immediately, but kept around as a dimmed "claimed" ghost for a
    // few seconds rather than just vanishing -- confirms the tap landed, and lets a second staff
    // member glancing at the board see it's already handled. Tracked separately from `rows` so
    // the next poll (which will no longer include this id) can't erase the ghost early.
    setRows((cur) => cur.filter((r) => r.id !== row.id));
    setClaimed((cur) => [...cur, row]);
    setTimeout(() => setClaimed((cur) => cur.filter((r) => r.id !== row.id)), CLAIMED_LINGER_MS);
    try {
      await api.ackServiceRequest(restaurantId, row.id);
    } catch (err) {
      toast.error(err.message);
      setClaimed((cur) => cur.filter((r) => r.id !== row.id)); // it's still open -- drop the ghost
      api.getServiceRequests(restaurantId).then(setRows).catch(() => {});
    }
  }

  const staleness = lastPoll ? Math.max(0, Math.round((Date.now() - lastPoll) / 1000)) : null;
  // Oldest first: the head of this list is the one card that gets the loud treatment below.
  const open = rows ? [...rows].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)) : [];
  const waiterCount = open.filter((r) => r.kind === 'waiter').length;
  const billCount = open.filter((r) => r.kind === 'bill').length;

  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-panel px-4 py-3 sm:px-7 sm:py-4">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded-lg bg-logo-chip object-contain p-1" />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent font-serif text-[17px] font-semibold text-accent-ink">
            C
          </span>
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] uppercase tracking-[0.16em] text-dim sm:text-[12px]">
          {name || 'Kitchen display'} · Floor calls
        </span>
        {/* One group so it wraps to its own line as a unit on a phone, rather than each piece
            breaking separately. */}
        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span className={cn('flex items-center gap-2 font-mono text-[12px]', failing ? 'text-bad' : 'text-muted')}>
            <span className={cn('h-[7px] w-[7px] rounded-full', failing ? 'bg-bad' : 'bg-ok animate-blip')} />
            {failing ? 'Reconnecting…' : 'Live'}
          </span>
          <span className="font-mono text-[18px] tabular-nums text-text sm:text-[22px]">
            {new Date().toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })}
          </span>
          <div className="flex gap-2">
            <IconButton
              onClick={toggleMute}
              disabled={forcedMute}
              aria-label={forcedMute ? 'Chime disabled in restaurant settings' : muted ? 'Unmute chime' : 'Mute chime'}
              title={forcedMute ? 'Chime disabled in restaurant settings' : muted ? 'Unmute chime' : 'Mute chime'}
            >
              {forcedMute || muted ? <VolumeX /> : <Volume2 />}
            </IconButton>
            <IconButton onClick={() => document.documentElement.requestFullscreen?.()} aria-label="Fullscreen" title="Fullscreen">
              <Maximize />
            </IconButton>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border px-4 py-3 sm:gap-x-8 sm:px-7 sm:py-3.5">
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[22px] font-medium text-accent sm:text-[26px]">{waiterCount}</span>
          <span className="text-[13px] text-muted">waiter call{waiterCount === 1 ? '' : 's'}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="font-serif text-[22px] font-medium text-ok sm:text-[26px]">{billCount}</span>
          <span className="text-[13px] text-muted">bill{billCount === 1 ? '' : 's'} wanted</span>
        </span>
        <span className="ml-auto font-mono text-[12px] text-dim">
          {staleness === null ? 'Loading…' : `Updated ${staleness}s ago`}
        </span>
      </div>

      <main className="flex-1 p-4 sm:p-6">
        {rows === null ? (
          <p className="text-[13px] text-dim">Loading…</p>
        ) : open.length === 0 && claimed.length === 0 ? (
          <div className="flex min-h-[50vh] flex-col items-center justify-center gap-2">
            <p className="font-serif text-[44px] text-dim">All clear</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {open.map((r, i) => (
              <RequestCard key={r.id} row={r} urgent={i === 0} onAck={() => ack(r)} />
            ))}
            {claimed.map((r) => (
              <ClaimedCard key={r.id} row={r} />
            ))}
            <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border-2 p-7 text-dim">
              <QrCode size={26} />
              <span className="font-mono text-[11px] uppercase tracking-[0.12em]">Next call lands here</span>
            </div>
          </div>
        )}
      </main>

      <a
        className="fixed bottom-1.5 left-1/2 z-10 -translate-x-1/2 rounded bg-bg/70 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-dim transition-colors hover:text-muted"
        href="https://complexai.co.za"
        target="_blank"
        rel="noopener"
      >
        Powered by <strong>Complex AI</strong>
      </a>
    </div>
  );
}

// The one card allowed to shout: filled accent, pulsing ring. Whichever request has been waiting
// longest gets this regardless of kind -- "longest ignored" is the thing that actually needs
// eyes, more than which button the diner tapped.
function RequestCard({ row, urgent, onAck }) {
  const { label, icon: Icon } = KIND[row.kind] || KIND.waiter;

  if (urgent) {
    return (
      <button
        onClick={onAck}
        className="flex animate-pulse-ring flex-col rounded-2xl bg-accent p-6 text-left text-accent-ink"
        title={`Acknowledge table ${row.table_label}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <span className="font-mono text-[12px] uppercase tracking-[0.14em] opacity-85">{label}</span>
            {row.nudged_at && (
              <span className="rounded-full border border-accent-ink/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] opacity-90">
                Nudged
              </span>
            )}
          </span>
          <Icon size={24} className="opacity-90" />
        </div>
        <span className="mt-auto pt-8 font-serif text-[52px] font-medium leading-none">Table {row.table_label}</span>
        <span className="mt-2.5 self-end font-mono text-[24px] tabular-nums">{elapsedLabel(row.created_at)}</span>
      </button>
    );
  }

  const isBill = row.kind === 'bill';
  return (
    <button
      onClick={onAck}
      className={cn('flex flex-col rounded-2xl border p-6 text-left', isBill ? 'border-border-2 bg-panel' : 'border-border bg-raised')}
      title={`Acknowledge table ${row.table_label}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span className={cn('font-mono text-[12px] uppercase tracking-[0.14em]', isBill ? 'text-ok' : 'text-accent')}>{label}</span>
          {row.nudged_at && (
            <span className="rounded-full bg-warn/15 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-warn">
              Nudged
            </span>
          )}
        </span>
        <Icon size={22} className={isBill ? 'text-ok' : 'text-accent'} />
      </div>
      <span className="mt-auto pt-8 font-serif text-[44px] font-medium leading-none">Table {row.table_label}</span>
      <span className="mt-2.5 self-end font-mono text-[20px] tabular-nums text-muted">{elapsedLabel(row.created_at)}</span>
    </button>
  );
}

// Lingers dimmed for CLAIMED_LINGER_MS after a tap -- see ack() for why this isn't just an
// instant removal.
function ClaimedCard({ row }) {
  return (
    <div className="flex flex-col rounded-2xl border border-border bg-raised p-6 text-left opacity-60">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[12px] uppercase tracking-[0.14em] text-muted">Claimed</span>
        <CheckCircle2 size={22} className="text-muted" />
      </div>
      <span className="mt-auto pt-8 font-serif text-[44px] font-medium leading-none">Table {row.table_label}</span>
      <span className="mt-2.5 text-[14px] text-muted">On the way</span>
    </div>
  );
}
