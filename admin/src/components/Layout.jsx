import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, UtensilsCrossed, TrendingDown, QrCode, SlidersHorizontal, LogOut, Menu as MenuIcon, Sun, Moon, ChevronsUpDown, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../lib/theme';
import * as api from '../api';
import { Button, IconButton } from './ui/Button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from './ui/DropdownMenu';
import { Skeleton } from './ui/Skeleton';
import { cn } from './ui/cn';

const nav = [
  { to: '', label: 'Feedback', icon: MessageSquare, end: true },
  { to: 'menu', label: 'Menu', icon: UtensilsCrossed },
  { to: 'dishes', label: 'Dishes', icon: TrendingDown },
  { to: 'qr', label: 'QR code', icon: QrCode },
  { to: 'settings', label: 'Settings', icon: SlidersHorizontal },
];

export function Layout() {
  const { restaurantId } = useParams();
  const { me, logout } = useAuth();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [restaurant, setRestaurant] = useState(null);
  const [drawer, setDrawer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getRestaurant(restaurantId)
      .then((r) => !cancelled && setRestaurant(r))
      .catch((err) => {
        toast.error(err.message);
        navigate('/');
      });
    return () => {
      cancelled = true;
    };
  }, [restaurantId, navigate]);

  const others = (me?.restaurants || []).filter((r) => r.id !== restaurantId);

  const sidebar = (
    <div className="flex h-full flex-col gap-1 p-3">
      <div className="px-2 pb-3 pt-1">
        {restaurant ? (
          <>
            <div className="truncate text-[14px] font-semibold text-text">{restaurant.name}</div>
            <a
              className="mt-0.5 inline-flex items-center gap-1 font-mono text-[10.5px] text-dim hover:text-muted"
              href={restaurant.qr_target_url}
              target="_blank"
              rel="noopener"
            >
              /{restaurant.slug} <ExternalLink size={10} />
            </a>
          </>
        ) : (
          <Skeleton className="h-4 w-32" />
        )}
      </div>

      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={label}
          to={to ? `/r/${restaurantId}/${to}` : `/r/${restaurantId}`}
          end={end}
          onClick={() => setDrawer(false)}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors',
              isActive ? 'bg-raised text-text' : 'text-muted hover:bg-raised hover:text-text'
            )
          }
        >
          <Icon size={15} />
          {label}
        </NavLink>
      ))}

      <div className="mt-auto flex items-center gap-2 border-t border-border pt-3">
        {/* Only rendered when there is somewhere to switch to. An admin with one restaurant, and
            every restaurant owner, sees no switcher at all rather than a menu of one. */}
        {others.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="min-w-0 flex-1 justify-between">
                <span className="truncate">Switch</span>
                <ChevronsUpDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {others.map((r) => (
                <DropdownMenuItem key={r.id} onSelect={() => navigate(`/r/${r.id}`)}>
                  {r.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <IconButton onClick={toggleTheme} aria-label="Toggle theme">
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </IconButton>
        <IconButton onClick={logout} aria-label="Log out">
          <LogOut size={14} />
        </IconButton>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-bg">
      <aside className="fixed inset-y-0 left-0 hidden w-56 border-r border-border bg-panel lg:block">{sidebar}</aside>

      {/* Mobile: the console is genuinely used on a phone by an owner standing in their kitchen. */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-border bg-bg px-4 py-3 lg:hidden">
        <IconButton onClick={() => setDrawer(true)} aria-label="Open menu">
          <MenuIcon size={14} />
        </IconButton>
        <span className="truncate text-[13.5px] font-semibold">{restaurant?.name || ''}</span>
      </header>
      {drawer && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button className="absolute inset-0 bg-black/60" onClick={() => setDrawer(false)} aria-label="Close menu" />
          <div className="absolute inset-y-0 left-0 w-64 animate-drawer-in border-r border-border bg-panel">{sidebar}</div>
        </div>
      )}

      <main className="lg:pl-56">
        <div className="mx-auto max-w-5xl px-4 py-6 lg:px-8">
          {/* The lapsed-subscription banner. Deliberately says the menu keeps working, because the
              first thing an owner will fear is that their tables have gone dark. */}
          {restaurant && restaurant.active === false && (
            <div className="mb-5 rounded-lg border border-warn/35 bg-warn/8 px-4 py-3 text-[13px] text-text">
              <strong className="font-semibold">Subscription inactive.</strong> The console is
              read-only. Your menu and QR code keep working normally for diners — nothing on your
              tables has changed.
            </div>
          )}
          <Outlet context={{ restaurant, restaurantId, reload: () => api.getRestaurant(restaurantId).then(setRestaurant) }} />
        </div>
      </main>
    </div>
  );
}
