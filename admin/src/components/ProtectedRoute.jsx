import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Button } from './ui/Button';

export function ProtectedRoute({ children }) {
  const { session, me, meError, loading, logout } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-[13px] text-dim">Loading…</div>;
  }
  if (!session) return <Navigate to="/login" replace />;

  // A real failure (API down, network) reads differently from "you are not staff here", and
  // conflating them would have the owner phoning you about a permissions problem that is actually
  // an outage.
  if (meError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[13.5px] text-text">Could not reach the server.</p>
        <p className="max-w-sm text-[12.5px] text-muted">{meError}</p>
        <Button variant="secondary" onClick={() => window.location.reload()}>Try again</Button>
      </div>
    );
  }

  // Signed into the shared Supabase project, but with no restaurant.staff row. Ordinary, not an
  // error: this account belongs to one of the sibling apps.
  if (!me) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-[13.5px] text-text">This account isn't set up for the restaurant console.</p>
        <p className="max-w-sm text-[12.5px] text-muted">
          If you think it should be, ask ComplexAI to add you.
        </p>
        <Button variant="secondary" onClick={logout}>Log out</Button>
      </div>
    );
  }

  return children;
}
