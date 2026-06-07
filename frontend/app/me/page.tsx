'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { Heart, History, KeyRound, User } from 'lucide-react';
import { authService, type AuthUser } from '@/services/auth.service';
import { personalService, type FavoriteItem, type PersonalHistoryItem } from '@/services/personal.service';

export default function ProfilePage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [history, setHistory] = useState<PersonalHistoryItem[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    void Promise.all([authService.me(), personalService.history(), personalService.favorites()])
      .then(([me, historyItems, favoriteItems]) => {
        setUser(me);
        setHistory(historyItems);
        setFavorites(favoriteItems);
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load profile.'))
      .finally(() => setLoading(false));
  }, []);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setPasswordMessage(null);

    if (newPassword !== confirmPassword) {
      setPasswordError('Mật khẩu mới và xác nhận mật khẩu không khớp.');
      return;
    }

    setSavingPassword(true);
    try {
      await authService.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage('Đã đổi mật khẩu.');
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : 'Không thể đổi mật khẩu.');
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
      <Link href="/" className="text-sm text-accent">
        Back home
      </Link>
      <section className="mt-4 rounded-lg border border-white/10 bg-panel/80 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-12 place-items-center rounded-md bg-white/10">
            <User size={22} />
          </div>
          <div className="min-w-0">
            <p className="text-sm text-muted">Profile</p>
            <h1 className="truncate text-2xl font-semibold">{user?.username ?? 'Loading...'}</h1>
          </div>
        </div>
      </section>

      {error ? <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      <section className="mt-4 rounded-lg border border-white/10 bg-panel/80 p-4 sm:p-5">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-accent/15 text-accent">
            <KeyRound size={20} />
          </div>
          <div>
            <p className="text-sm text-muted">Security</p>
            <h2 className="font-semibold">Đổi mật khẩu</h2>
          </div>
        </div>

        <form onSubmit={changePassword} className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="block">
            <span className="text-xs text-muted">Mật khẩu hiện tại</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-accent"
              minLength={8}
              maxLength={128}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
              type="password"
              value={currentPassword}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Mật khẩu mới</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-accent"
              minLength={8}
              maxLength={128}
              onChange={(event) => setNewPassword(event.target.value)}
              required
              type="password"
              value={newPassword}
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted">Xác nhận mật khẩu mới</span>
            <input
              className="mt-1 h-10 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-accent"
              minLength={8}
              maxLength={128}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
              type="password"
              value={confirmPassword}
            />
          </label>

          <div className="flex flex-col gap-3 md:col-span-3 md:flex-row md:items-center">
            <button
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
              disabled={savingPassword}
            >
              {savingPassword ? 'Đang lưu' : 'Đổi mật khẩu'}
            </button>
            {passwordError ? <p className="text-sm text-danger">{passwordError}</p> : null}
            {passwordMessage ? <p className="text-sm text-accent">{passwordMessage}</p> : null}
          </div>
        </form>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <Panel icon={<History size={20} />} title="History" count={history.length}>
          {loading ? (
            <EmptyText text="Loading history..." />
          ) : history.length === 0 ? (
            <EmptyText text="No listening history yet." />
          ) : (
            history.map((item) => (
              <TrackRow key={item.id} title={item.title} subtitle={item.channelTitle ?? 'Unknown channel'} thumbnailUrl={item.thumbnailUrl} />
            ))
          )}
        </Panel>
        <Panel icon={<Heart size={20} />} title="Favorites" count={favorites.length}>
          {loading ? (
            <EmptyText text="Loading favorites..." />
          ) : favorites.length === 0 ? (
            <EmptyText text="No favorites yet." />
          ) : (
            favorites.map((item) => (
              <TrackRow key={item.id} title={item.title} subtitle={item.channelTitle ?? 'Unknown channel'} thumbnailUrl={item.thumbnailUrl} />
            ))
          )}
        </Panel>
      </section>
    </main>
  );
}

function Panel({ children, icon, title, count }: { children: React.ReactNode; icon: React.ReactNode; title: string; count: number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-panel/80 p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="grid size-10 place-items-center rounded-md bg-accent/15 text-accent">{icon}</div>
          <h2 className="font-semibold">{title}</h2>
        </div>
        <span className="text-sm text-muted">{count}</span>
      </div>
      <div className="mt-4 space-y-3">{children}</div>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted">{text}</p>;
}

function TrackRow({ subtitle, thumbnailUrl, title }: { subtitle: string; thumbnailUrl: string | null; title: string }) {
  return (
    <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-3 rounded-md border border-white/10 bg-black/20 p-2 sm:grid-cols-[4rem_minmax(0,1fr)]">
      {thumbnailUrl ? (
        <img src={thumbnailUrl} alt="" className="aspect-video w-full rounded object-cover" />
      ) : (
        <div className="aspect-video rounded bg-white/10" />
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="mt-1 truncate text-xs text-muted">{subtitle}</p>
      </div>
    </div>
  );
}
