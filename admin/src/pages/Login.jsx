import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { setRememberSession } from '../supabaseClient';
import { Button } from '../components/ui/Button';
import { Input, Field } from '../components/ui/Input';
import { Logo } from '../components/Logo';

// Every ComplexAI product resets passwords through one page. Supabase Auth has a single Site URL
// per project and this project is shared with the sibling apps, so that page is the fallback every
// auth email lands on -- including for apps nobody remembered to configure. The portal sends the
// email as well as setting the password: under PKCE the code verifier stays on the origin that
// asked for the reset, so a reset started here could never be completed there. ?return= is what
// brings the owner back to this console afterwards.
const RESET_PORTAL = 'https://complexai.co.za/reset';
const resetPortalUrl = () =>
  `${RESET_PORTAL}?app=the+restaurant+console&return=${encodeURIComponent(window.location.origin)}`;

export function Login() {
  const { session, login, loginWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keepSignedIn, setKeepSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setRememberSession(keepSignedIn);
    const { error } = await login(email, password);
    setBusy(false);
    if (error) toast.error(error.message);
  }

  async function submitGoogle() {
    setGoogleBusy(true);
    const { error } = await loginWithGoogle();
    if (error) {
      toast.error(error.message);
      setGoogleBusy(false);
    }
    // On success the browser is redirected to Google, so nothing else runs here.
  }

  return (
    <div className="flex min-h-screen items-center justify-center md:px-5 md:py-8">
      <div className="flex w-full max-w-[1000px] flex-col overflow-hidden border-border bg-panel md:flex-row md:rounded-2xl md:border md:shadow-xl">
        {/* Brand panel: full header block on mobile (5A), left column on desktop (3B) */}
        <aside className="flex flex-col justify-between gap-8 rounded-b-3xl bg-bg px-6 pb-8 pt-10 text-text md:flex-1 md:justify-between md:gap-0 md:rounded-b-none md:rounded-l-2xl md:px-11 md:py-11">
          {/* The wordmark carries the name itself, so the square mark and the text beside it both
              go -- kept as one flex row so the aside still has exactly three children for its
              justify-between rhythm. */}
          <div className="flex items-center">
            <Logo className="h-9 md:h-11" />
          </div>

          <div>
            <h1 className="font-serif text-2xl font-semibold leading-tight md:text-[27px]">
              One console.
              <br />
              Every shift.
            </h1>
            <p className="mt-3 text-[13px] leading-relaxed text-text/70 md:mt-3 md:text-sm">
              The menu diners scan off the coaster, the ratings it sends back, and an email when a
              table leaves unhappy.
            </p>
            {/* Every line here is something the software actually does -- ratings live on
                menu_items (lib/dishes.js), the fifteen minutes is the debounce window in
                lib/alerts.js, and the display is /r/:id/display. Aspirational copy on a login
                screen is a support ticket waiting to be filed. */}
            <ul className="mt-7 hidden flex-col gap-2.5 text-[13px] text-text/85 md:flex">
              {['A star rating on every dish', 'Bad ratings emailed within fifteen minutes', 'Waiter and bill taps on the kitchen display'].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="size-[5px] shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="hidden md:block" aria-hidden="true" />
        </aside>

        <main className="flex flex-1 flex-col justify-center px-6 pb-7 pt-7 md:px-12 md:py-14">
          <span className="mb-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-accent">
            Restaurant console
          </span>
          <h2 className="mb-2 font-serif text-2xl font-semibold tracking-[-0.005em] text-text md:text-[27px]">
            Sign in
          </h2>
          <p className="mb-7 text-sm text-muted">Manage your menu and feedback.</p>

          <form onSubmit={submit} className="flex flex-col gap-[18px]">
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>

            <div className="flex items-center justify-between">
              <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted">
                <input
                  type="checkbox"
                  checked={keepSignedIn}
                  onChange={(e) => setKeepSignedIn(e.target.checked)}
                  className="size-3.5 accent-accent"
                />
                Keep me signed in
              </label>
              <a href={resetPortalUrl()} className="text-[13px] text-accent hover:opacity-80">
                Forgot password?
              </a>
            </div>

            <Button type="submit" className="h-9 w-full" disabled={busy} loading={busy} title="Sign in">
              {busy ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3 text-[10.5px] uppercase tracking-wide text-dim">
            <div className="h-px flex-1 bg-border-2" />
            or
            <div className="h-px flex-1 bg-border-2" />
          </div>

          <Button
            type="button"
            variant="secondary"
            className="h-9 w-full"
            disabled={googleBusy}
            loading={googleBusy}
            onClick={submitGoogle}
            title="Continue with Google"
          >
            {!googleBusy && (
              <svg viewBox="0 0 18 18" className="size-4" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.91c1.7-1.57 2.69-3.88 2.69-6.62Z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26c-.81.54-1.84.86-3.05.86-2.34 0-4.33-1.58-5.04-3.71H.96v2.33A9 9 0 0 0 9 18Z" />
                <path fill="#FBBC05" d="M3.96 10.71a5.4 5.4 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3-2.33Z" />
                <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
              </svg>
            )}
            {googleBusy ? 'Redirecting…' : 'Continue with Google'}
          </Button>

          <a
            className="mt-6 block text-center text-[10.5px] text-dim transition-colors hover:text-muted"
            href="https://complexai.co.za"
            target="_blank"
            rel="noopener"
          >
            Powered by <strong>Complex AI</strong>
          </a>
        </main>
      </div>
    </div>
  );
}
