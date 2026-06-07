'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { LogIn, Waves } from 'lucide-react';
import { authService } from '@/services/auth.service';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await authService.login({ email, password });
      router.push(new URLSearchParams(window.location.search).get('next') ?? '/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-[100dvh] place-items-center px-4 py-8">
      <form onSubmit={submit} className="w-full max-w-md rounded-lg border border-white/10 bg-panel/80 p-5 shadow-2xl shadow-black/30">
        <div className="flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-md bg-accent text-black">
            <Waves size={22} />
          </div>
          <div>
            <p className="text-sm text-muted">Music Room</p>
            <h1 className="text-2xl font-semibold">Login</h1>
          </div>
        </div>

        <label className="mt-6 block text-sm text-muted">
          Email
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-foreground outline-none focus:border-accent"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
          />
        </label>

        <label className="mt-4 block text-sm text-muted">
          Password
          <input
            className="mt-2 h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-foreground outline-none focus:border-accent"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            type="password"
            required
          />
        </label>

        {error ? <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

        <button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-accent px-4 font-semibold text-black" disabled={loading}>
          <LogIn size={18} />
          {loading ? 'Logging in...' : 'Login'}
        </button>

        <p className="mt-4 text-center text-sm text-muted">
          Need an account?{' '}
          <Link href="/register" className="text-accent">
            Register
          </Link>
        </p>
      </form>
    </main>
  );
}
