import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/Button';
import { Input, Field } from '../components/ui/Input';

export function Login() {
  const { session, login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  if (session) return <Navigate to="/" replace />;

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    const { error } = await login(email, password);
    setBusy(false);
    if (error) toast.error(error.message);
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <form onSubmit={submit} className="w-full max-w-[340px]">
        <h1 className="text-[19px] font-semibold tracking-[-0.01em]">Restaurant console</h1>
        <p className="mb-6 mt-1 text-[13px] text-muted">Sign in to manage your menu and feedback.</p>

        <div className="flex flex-col gap-3">
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
          </Field>
          <Button type="submit" className="mt-1 h-9 w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}
