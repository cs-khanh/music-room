'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Heart,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Search,
  SkipForward,
  Trash2,
  GripVertical,
  Users,
  Volume2,
  VolumeX
} from 'lucide-react';
import type { PlayerQueuePayload, Room, RoomMember, RoomPlayerState, RoomQueueItem, YouTubeVideo } from '@music-room/shared';
import { YouTubeRoomPlayer, type YouTubeRoomPlayerHandle } from '@/components/player/youtube-room-player';
import { ApiError } from '@/lib/api-client';
import { connectSocketForUser, getSocket } from '@/lib/socket-client';
import { authService, type AuthUser } from '@/services/auth.service';
import { personalService } from '@/services/personal.service';
import { playerService } from '@/services/player.service';
import { queueService } from '@/services/queue.service';
import { roomsService } from '@/services/rooms.service';
import { youtubeService } from '@/services/youtube.service';

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const roomCode = params.code;
  const copyResetTimeoutRef = useRef<number | null>(null);
  const syncResetTimeoutRef = useRef<number | null>(null);
  const playerRef = useRef<YouTubeRoomPlayerHandle | null>(null);
  const historyVideoIdRef = useRef<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [state, setState] = useState<RoomPlayerState | null>(null);
  const [queue, setQueue] = useState<RoomQueueItem[]>([]);
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0, muted: false, volume: 100 });
  const [inviteCopyStatus, setInviteCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'synced'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [addingVideoId, setAddingVideoId] = useState<string | null>(null);
  const [controlAction, setControlAction] = useState<'play-pause' | 'next' | 'sync' | null>(null);
  const [removingQueueItemId, setRemovingQueueItemId] = useState<number | null>(null);
  const [draggingQueueItemId, setDraggingQueueItemId] = useState<number | null>(null);
  const [playingQueueItemId, setPlayingQueueItemId] = useState<number | null>(null);

  const isOwner = useMemo(() => Boolean(me && room && room.ownerId === me.id), [me, room]);
  const onlineMembers = useMemo(() => members.filter((member) => member.isOnline), [members]);

  const applyPlayerState = useCallback((nextState: RoomPlayerState) => {
    setControlAction(null);
    setState(nextState);
    setProgress((current) => ({
      ...current,
      currentTime: nextState.currentVideoId ? nextState.currentTime : 0
    }));
  }, []);

  const handleEnded = useCallback(() => {
    if (isOwner) {
      getSocket().emit('room:player:ended', { roomCode });
    }
  }, [isOwner, roomCode]);

  useEffect(() => {
    void loadRoom();
  }, [roomCode]);

  useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      if (syncResetTimeoutRef.current !== null) {
        window.clearTimeout(syncResetTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const searchQuery = query.trim();
    if (searchQuery.length < 2) {
      setResults([]);
      setSearchLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void performSearch(searchQuery);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  useEffect(() => {
    if (!me) {
      return;
    }

    const socket = connectSocketForUser(me.id);
    let joinedSocketId: string | null = null;
    const handleNext = (payload: { state: RoomPlayerState; queue: RoomQueueItem[] }) => {
      setControlAction(null);
      setQueue(payload.queue);
      applyPlayerState(payload.state);
    };
    const handleRoomState = (nextRoom: Room) => {
      setRoom(nextRoom);
      setMembers(nextRoom.members);
      setQueue(nextRoom.queue.filter((item) => item.status === 'queued'));
      applyPlayerState(nextRoom.playerState);
    };

    socket.on('room:state', handleRoomState);
    socket.on('room:queue:update', setQueue);
    socket.on('room:member:update', setMembers);
    socket.on('room:player:state', applyPlayerState);
    socket.on('room:player:seek', applyPlayerState);
    socket.on('room:player:force-sync', applyPlayerState);
    socket.on('room:player:next', handleNext);
    socket.on('room:owner:changed', (payload) => {
      setRoom((current) => (current ? { ...current, ownerId: payload.ownerId } : current));
    });
    socket.on('error', (payload) => {
      setControlAction(null);
      setError(payload.message);
    });
    socket.on('connect_error', (err) => {
      setControlAction(null);
      setError(err.message);
    });
    socket.on('exception' as never, ((payload: { message?: string }) => {
      setAddingVideoId(null);
      setControlAction(null);
      setPlayingQueueItemId(null);
      setRemovingQueueItemId(null);
      setError(payload.message ?? 'Socket request failed.');
    }) as never);

    function joinSocketRoom() {
      const socketId = socket.id ?? null;
      if (socketId && joinedSocketId === socketId) {
        return;
      }

      joinedSocketId = socketId;
      socket.emit('room:join', { roomCode });
      socket.emit('room:player:sync', { roomCode });
    }

    function handleSocketDisconnect() {
      joinedSocketId = null;
    }

    if (socket.connected) {
      joinSocketRoom();
    }
    socket.on('connect', joinSocketRoom);
    socket.on('disconnect', handleSocketDisconnect);

    return () => {
      if (socket.connected && joinedSocketId === socket.id) {
        socket.emit('room:leave', { roomCode });
      }
      socket.off('connect', joinSocketRoom);
      socket.off('disconnect', handleSocketDisconnect);
      socket.off('room:state', handleRoomState);
      socket.off('room:queue:update', setQueue);
      socket.off('room:member:update', setMembers);
      socket.off('room:player:state', applyPlayerState);
      socket.off('room:player:seek', applyPlayerState);
      socket.off('room:player:force-sync', applyPlayerState);
      socket.off('room:player:next', handleNext);
      socket.off('room:owner:changed');
      socket.off('error');
      socket.off('connect_error');
      socket.off('exception' as never);
    };
  }, [applyPlayerState, me, roomCode]);

  useEffect(() => {
    if (!me || !state?.currentVideoId || historyVideoIdRef.current === state.currentVideoId) {
      return;
    }

    historyVideoIdRef.current = state.currentVideoId;
    void personalService.addHistory(state.currentVideoId).catch(() => undefined);
  }, [me, state?.currentVideoId]);

  useEffect(() => {
    if (!me || isOwner) {
      return;
    }

    let cancelled = false;

    async function refreshMemberPlayback() {
      if (getSocket().connected) {
        return;
      }

      try {
        const [nextState, nextQueue] = await Promise.all([playerService.sync(roomCode), queueService.list(roomCode)]);
        if (cancelled) {
          return;
        }

        applyPlayerState(nextState);
        setQueue(nextQueue);
      } catch {
        // Socket remains the primary path; polling is only a production fallback.
      }
    }

    void refreshMemberPlayback();
    const intervalId = window.setInterval(() => void refreshMemberPlayback(), 10000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [applyPlayerState, isOwner, me, roomCode]);

  async function loadRoom() {
    try {
      const currentUser = await authService.me();
      const favorites = await personalService.favorites().catch(() => []);
      const currentRoom = await roomsService.join(roomCode);

      setMe(currentUser);
      setFavoriteIds(new Set(favorites.map((item) => item.videoId)));
      setRoom(currentRoom);
      applyPlayerState(currentRoom.playerState);
      setQueue(currentRoom.queue.filter((item) => item.status === 'queued'));
      setMembers(currentRoom.members);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace(`/login?next=/room/${roomCode}`);
        return;
      }

      setError(err instanceof Error ? err.message : 'Could not load room.');
    }
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performSearch(query);
  }

  async function performSearch(searchQuery: string) {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setSearchLoading(true);
    setError(null);
    try {
      const response = await youtubeService.search(normalizedQuery);
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setResults(response.items);
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setSearchLoading(false);
      }
    }
  }

  async function add(videoId: string) {
    setAddingVideoId(videoId);
    setError(null);
    try {
      const socket = getSocket();
      if (socket.connected) {
        const nextQueue = await emitSocketWithAck<RoomQueueItem[]>((resolve) => {
          socket.emit('room:queue:add', { roomCode, videoId }, resolve);
        });
        setQueue(nextQueue);
        return;
      }

      await queueService.add(roomCode, videoId);
      const nextQueue = await queueService.list(roomCode);
      setQueue(nextQueue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add song to room.');
    } finally {
      setAddingVideoId(null);
    }
  }

  async function togglePlayPause() {
    setControlAction('play-pause');
    setError(null);
    const socket = getSocket();
    if (!socket.connected) {
      setControlAction(null);
      setError('Socket is not connected.');
      return;
    }

    const isStartingPlayback = state?.status !== 'playing';
    if (isStartingPlayback && state?.currentVideoId) {
      playerRef.current?.play();
    }

    const currentTime = playerRef.current?.getCurrentTime() ?? state?.currentTime ?? 0;
    try {
      const nextState = await emitSocketWithAck<RoomPlayerState>((resolve) => {
        socket.emit(state?.status === 'playing' ? 'room:player:pause' : 'room:player:play', {
          currentTime,
          roomCode
        }, resolve);
      });
      applyPlayerState(nextState);
    } catch (err) {
      setControlAction(null);
      setError(err instanceof Error ? err.message : 'Could not update playback.');
    }
  }

  async function next() {
    setControlAction('next');
    setError(null);
    const socket = getSocket();
    if (!socket.connected) {
      setControlAction(null);
      setError('Socket is not connected.');
      return;
    }

    try {
      const result = await emitSocketWithAck<PlayerQueuePayload>((resolve) => {
        socket.emit('room:player:ended', { roomCode }, resolve);
      });
      applyPlayerState(result.state);
      setQueue(result.queue);
    } catch (err) {
      setControlAction(null);
      setError(err instanceof Error ? err.message : 'Could not skip song.');
    }
  }

  async function sync() {
    setControlAction('sync');
    setSyncStatus('idle');
    setError(null);

    function markSynced() {
      setSyncStatus('synced');
      if (syncResetTimeoutRef.current !== null) {
        window.clearTimeout(syncResetTimeoutRef.current);
      }
      syncResetTimeoutRef.current = window.setTimeout(() => {
        setSyncStatus('idle');
        syncResetTimeoutRef.current = null;
      }, 2500);
    }

    if (isOwner) {
      const socket = getSocket();
      if (!socket.connected) {
        setControlAction(null);
        setError('Socket is not connected.');
        return;
      }

      try {
        const nextState = await emitSocketWithAck<RoomPlayerState>((resolve) => {
          socket.emit('room:player:force-sync', {
            currentTime: playerRef.current?.getCurrentTime() ?? state?.currentTime ?? 0,
            roomCode
          }, resolve);
        });
        applyPlayerState(nextState);
        markSynced();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not sync player.');
      } finally {
        setControlAction(null);
      }
      return;
    }

    try {
      const nextState = await playerService.sync(roomCode);
      applyPlayerState(nextState);
      playerRef.current?.syncToState(nextState);
      markSynced();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sync player.');
    } finally {
      setControlAction(null);
    }
  }

  function seek(nextTime: number) {
    if (!isOwner) {
      return;
    }

    playerRef.current?.seekTo(nextTime);
    getSocket().emit('room:player:seek', { currentTime: nextTime, roomCode });
  }

  function setVolume(volume: number) {
    playerRef.current?.setVolume(volume);
    if (volume > 0) {
      playerRef.current?.unMute();
    }
    setProgress((current) => ({ ...current, muted: false, volume }));
  }

  function toggleMute() {
    if (progress.muted) {
      playerRef.current?.unMute();
      setProgress((current) => ({ ...current, muted: false }));
    } else {
      playerRef.current?.mute();
      setProgress((current) => ({ ...current, muted: true }));
    }
  }

  async function removeQueueItem(queueItemId: number) {
    setRemovingQueueItemId(queueItemId);
    setError(null);
    try {
      const socket = getSocket();
      if (socket.connected) {
        const nextQueue = await emitSocketWithAck<RoomQueueItem[]>((resolve) => {
          socket.emit('room:queue:remove', { queueItemId, roomCode }, resolve);
        });
        setQueue(nextQueue);
        return;
      }

      await queueService.remove(roomCode, queueItemId);
      setQueue((current) => current.filter((item) => item.id !== queueItemId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove queue item.');
    } finally {
      setRemovingQueueItemId(null);
    }
  }

  async function playQueueItemNow(queueItemId: number) {
    setPlayingQueueItemId(queueItemId);
    setError(null);
    try {
      const socket = getSocket();
      if (socket.connected) {
        const result = await emitSocketWithAck<PlayerQueuePayload>((resolve) => {
          socket.emit('room:queue:play-now', { queueItemId, roomCode }, resolve);
        });
        applyPlayerState(result.state);
        setQueue(result.queue);
        return;
      }

      const result = await queueService.playNow(roomCode, queueItemId);
      applyPlayerState(result.state);
      setQueue(result.queue);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not play queue item.');
    } finally {
      setPlayingQueueItemId(null);
    }
  }

  async function reorderQueue(draggedId: number, targetId: number) {
    if (draggedId === targetId) {
      return;
    }

    const fromIndex = queue.findIndex((item) => item.id === draggedId);
    const toIndex = queue.findIndex((item) => item.id === targetId);
    if (fromIndex < 0 || toIndex < 0) {
      return;
    }

    const nextQueue = [...queue];
    const [movedItem] = nextQueue.splice(fromIndex, 1);
    nextQueue.splice(toIndex, 0, movedItem);
    setQueue(nextQueue);
    setError(null);

    try {
      const queueItemIds = nextQueue.map((item) => item.id);
      const socket = getSocket();
      if (socket.connected) {
        setQueue(await emitSocketWithAck<RoomQueueItem[]>((resolve) => {
          socket.emit('room:queue:reorder', { queueItemIds, roomCode }, resolve);
        }));
        return;
      }

      setQueue(await queueService.reorder(roomCode, queueItemIds));
    } catch (err) {
      setQueue(queue);
      setError(err instanceof Error ? err.message : 'Could not reorder queue.');
    }
  }

  async function toggleFavorite(videoId: string) {
    if (favoriteIds.has(videoId)) {
      await personalService.removeFavorite(videoId);
      setFavoriteIds((current) => {
        const next = new Set(current);
        next.delete(videoId);
        return next;
      });
      return;
    }

    await personalService.addFavorite(videoId);
    setFavoriteIds((current) => new Set(current).add(videoId));
  }

  async function leaveRoom() {
    getSocket().emit('room:leave', { roomCode });
    await roomsService.leave(roomCode).catch(() => undefined);
    router.push('/');
  }

  async function copyInvite() {
    function resetCopyStatusLater() {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setInviteCopyStatus('idle');
        copyResetTimeoutRef.current = null;
      }, 2500);
    }

    try {
      await copyText(window.location.href);
      setInviteCopyStatus('copied');
      resetCopyStatusLater();
    } catch {
      setInviteCopyStatus('failed');
      resetCopyStatusLater();
    }
  }

  return (
    <main className="mx-auto min-h-[100dvh] max-w-7xl overflow-x-hidden px-3 py-3 sm:px-4 sm:py-5">
      <header className="flex flex-col gap-3 rounded-lg border border-white/10 bg-panel/80 p-3 sm:p-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <Link href="/" className="text-sm text-accent">
            Back home
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold sm:text-2xl">{room?.name ?? roomCode}</h1>
          <p className="text-sm text-muted">Code {roomCode}</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
          <button
            onClick={() => void copyInvite()}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border px-3 text-sm transition sm:w-auto ${
              inviteCopyStatus === 'copied'
                ? 'border-accent/50 bg-accent/10 text-accent'
                : inviteCopyStatus === 'failed'
                  ? 'border-danger/50 bg-danger/10 text-danger'
                  : 'border-white/10'
            }`}
          >
            {inviteCopyStatus === 'copied' ? <Check size={16} /> : <Copy size={16} />}
            {inviteCopyStatus === 'copied' ? 'Copied' : inviteCopyStatus === 'failed' ? 'Copy failed' : 'Copy invite'}
          </button>
          <div className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-muted sm:w-auto">
            <Users size={16} />
            {onlineMembers.length} online
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-sm text-muted sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">{isOwner ? 'You are owner' : 'Member listening mode'}</div>
          <button onClick={() => void leaveRoom()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-danger/30 px-3 text-sm text-danger sm:w-auto">
            <LogOut size={16} />
            Leave
          </button>
        </div>
      </header>

      {error ? <p className="mt-4 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

      <section className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="min-w-0 rounded-lg border border-white/10 bg-panel/80 p-3 sm:p-4">
          <YouTubeRoomPlayer ref={playerRef} isOwner={isOwner} state={state} onEnded={handleEnded} onProgress={setProgress} />

          <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-muted">Now playing</p>
                <p className="mt-1 truncate font-semibold">{state?.currentQueueItem?.title ?? state?.currentVideoId ?? 'No song playing'}</p>
              </div>
              {state?.currentVideoId ? (
                <button onClick={() => void toggleFavorite(state.currentVideoId!)} className="grid size-9 place-items-center rounded-md border border-white/10 text-muted hover:text-accent" aria-label="Favorite current song">
                  <Heart size={17} fill={favoriteIds.has(state.currentVideoId) ? 'currentColor' : 'none'} />
                </button>
              ) : null}
            </div>
            <div className="mt-3 flex items-center gap-2 sm:gap-3">
              <span className="w-9 text-xs text-muted sm:w-10">{formatTime(progress.currentTime)}</span>
              <input
                aria-label="Seek"
                className="h-1.5 min-w-0 flex-1 accent-accent"
                disabled={!isOwner || !state?.currentVideoId || progress.duration <= 0}
                max={Math.max(progress.duration, 1)}
                min={0}
                onChange={(event) => seek(Number(event.target.value))}
                type="range"
                value={Math.min(progress.currentTime, Math.max(progress.duration, 1))}
              />
              <span className="w-9 text-right text-xs text-muted sm:w-10">{formatTime(progress.duration)}</span>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 md:flex-row md:items-center md:justify-between">
            <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap">
              {isOwner ? (
                <>
                  <button
                    onClick={() => void togglePlayPause()}
                    disabled={controlAction === 'play-pause'}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    {state?.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
                    {controlAction === 'play-pause' ? 'Updating' : state?.status === 'playing' ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={() => void next()}
                    disabled={controlAction === 'next'}
                    className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
                  >
                    <SkipForward size={16} />
                    {controlAction === 'next' ? 'Skipping' : 'Next'}
                  </button>
                </>
              ) : null}
              <button
                onClick={() => void sync()}
                disabled={controlAction === 'sync'}
                className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border px-3 text-sm transition disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto ${
                  syncStatus === 'synced' ? 'border-accent/50 bg-accent/10 text-accent' : 'border-white/10'
                }`}
              >
                {syncStatus === 'synced' ? <Check size={16} /> : <RefreshCcw size={16} />}
                {controlAction === 'sync' ? 'Syncing' : syncStatus === 'synced' ? 'Synced' : 'Sync'}
              </button>
            </div>
            <div className="flex h-10 min-w-0 items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 text-muted md:w-56">
              <button onClick={toggleMute} className="grid size-7 shrink-0 place-items-center rounded text-muted hover:text-foreground" aria-label="Mute">
                {progress.muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              <input
                aria-label="Volume"
                className="h-1.5 min-w-0 flex-1 accent-white"
                max={100}
                min={0}
                onChange={(event) => setVolume(Number(event.target.value))}
                type="range"
                value={progress.muted ? 0 : progress.volume}
              />
            </div>
          </div>

          <form onSubmit={search} className="mt-5 flex flex-col gap-3 sm:flex-row">
            <div className="flex min-h-14 flex-1 items-center gap-3 rounded-md border border-white/10 bg-black/25 px-4 py-4 sm:min-h-12 sm:py-0">
              <Search size={20} className="shrink-0 text-muted sm:size-[18px]" />
              <input className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted sm:text-sm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search YouTube" />
            </div>
            <button disabled={searchLoading} className="h-14 rounded-md bg-white px-4 text-base font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60 sm:h-12 sm:w-28 sm:text-sm">
              {searchLoading ? 'Searching' : 'Search'}
            </button>
          </form>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {results.map((video) => (
              <article key={video.videoId} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 rounded-lg border border-white/10 bg-black/20 p-2 min-[420px]:grid-cols-[5rem_minmax(0,1fr)] sm:grid-cols-[6rem_1fr]">
                <img src={video.thumbnailUrl} alt="" className="aspect-video w-full rounded-md object-cover" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{video.title}</p>
                  <p className="mt-1 truncate text-xs text-muted">{video.channelTitle}</p>
                  <div className="mt-3 flex gap-2">
                    <button
                      onClick={() => void add(video.videoId)}
                      disabled={addingVideoId === video.videoId}
                      className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Plus size={14} />
                      {addingVideoId === video.videoId ? 'Adding' : 'Add'}
                    </button>
                    <button onClick={() => void toggleFavorite(video.videoId)} className="grid size-8 place-items-center rounded-md border border-white/10 text-muted hover:text-accent" aria-label="Favorite">
                      <Heart size={15} fill={favoriteIds.has(video.videoId) ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="min-w-0 rounded-lg border border-white/10 bg-panel/80 p-3 sm:p-4">
          <h2 className="text-lg font-semibold">Queue</h2>
          <div className="mt-4 space-y-3">
            {queue.length === 0 ? (
              <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted">No upcoming songs.</div>
            ) : (
              queue.map((item, index) => (
                <article
                  key={item.id}
                  draggable={isOwner}
                  onDragStart={(event) => {
                    setDraggingQueueItemId(item.id);
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(item.id));
                  }}
                  onDragOver={(event) => {
                    if (isOwner) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const draggedId = Number(event.dataTransfer.getData('text/plain')) || draggingQueueItemId;
                    setDraggingQueueItemId(null);
                    if (draggedId) {
                      void reorderQueue(draggedId, item.id);
                    }
                  }}
                  onDragEnd={() => setDraggingQueueItemId(null)}
                  className={`grid grid-cols-[auto_3.25rem_minmax(0,1fr)] items-center gap-2 rounded-md border p-2 transition min-[420px]:grid-cols-[auto_3.75rem_minmax(0,1fr)] sm:grid-cols-[auto_4.5rem_minmax(0,1fr)] sm:gap-3 ${
                    draggingQueueItemId === item.id ? 'border-accent/60 bg-accent/10 opacity-70' : 'border-white/10 bg-black/20'
                  }`}
                >
                  <div className="grid w-5 place-items-center text-muted sm:w-7">
                    {isOwner ? <GripVertical size={16} /> : <span className="text-xs">{index + 1}</span>}
                  </div>
                  {item.thumbnailUrl ? (
                    <img src={item.thumbnailUrl} alt="" className="aspect-video w-full rounded-md object-cover" />
                  ) : (
                    <div className="aspect-video w-full rounded-md bg-white/10" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 truncate text-xs text-muted">{item.channelTitle ?? item.status}</p>
                  </div>
                  {isOwner ? (
                    <div className="col-span-3 flex items-center justify-end gap-1">
                      <button
                        onClick={() => void playQueueItemNow(item.id)}
                        disabled={playingQueueItemId === item.id}
                        className="grid size-8 place-items-center rounded-md border border-white/10 text-muted hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Play queue item now"
                      >
                        <Play size={15} fill="currentColor" />
                      </button>
                      <button
                        onClick={() => void removeQueueItem(item.id)}
                        disabled={removingQueueItemId === item.id}
                        className="grid size-8 place-items-center rounded-md border border-white/10 text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                        aria-label="Remove queue item"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="mt-5 rounded-lg border border-white/10 bg-black/20 p-4">
            <h3 className="text-sm font-semibold">Members</h3>
            <div className="mt-3 space-y-2">
              {onlineMembers.map((member) => (
                <div key={member.id} className="flex items-center justify-between gap-3 rounded-md bg-white/[0.03] px-3 py-2">
                  <span className="min-w-0 truncate text-sm">{member.username}</span>
                  <span className={member.role === 'owner' ? 'text-xs text-accent' : 'text-xs text-muted'}>{member.role}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </main>
  );
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the legacy copy path below.
    }
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.left = '-9999px';
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('Could not copy invite link.');
  }
}

function emitSocketWithAck<T>(emit: (resolve: (payload: T) => void) => void) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error('Socket response timed out.')), 5000);
    emit((payload) => {
      window.clearTimeout(timeoutId);
      resolve(payload);
    });
  });
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}
