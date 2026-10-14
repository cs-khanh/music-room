'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  Clock3,
  Crown,
  DoorOpen,
  Headphones,
  History,
  ListMusic,
  LogIn,
  LogOut,
  Music2,
  Pause,
  Play,
  Plus,
  Search,
  Shuffle,
  SkipForward,
  Trash2,
  User,
  Volume2,
  VolumeX,
  Waves
} from 'lucide-react';
import type { MyRooms, PublicRoom, RoomListItem, RoomPlayerState, YouTubeVideo } from '@music-room/shared';
import { YouTubeRoomPlayer, type YouTubeRoomPlayerHandle } from '@/components/player/youtube-room-player';
import { ApiError, apiClient } from '@/lib/api-client';
import { authService, type AuthUser } from '@/services/auth.service';
import { personalService } from '@/services/personal.service';
import { roomsService } from '@/services/rooms.service';
import { youtubeService } from '@/services/youtube.service';

type Language = 'vi' | 'en';

const copy = {
  en: {
    add: 'Add',
    createRoom: 'Create room',
    emptyQueue: 'Pick a hot topic or search a song to add it to the queue.',
    enterRoom: 'Enter',
    language: 'Language',
    listenMode: 'Personal',
    localQueue: 'Queue stays local',
    localQueueHelp: 'Login to turn this into a shared room playlist.',
    login: 'Login',
    logout: 'Logout',
    myRooms: 'My rooms',
    noJoinedRooms: 'Rooms you recently joined will show here.',
    noOwnedRooms: 'Rooms you own will show here.',
    nowPlayingFallback: 'Choose a song to start',
    nowPlayingLabel: 'Now playing',
    topTracks: 'Top 30 music videos on YouTube',
    updatedAt: 'Updated',
    trendingLoading: 'Loading current YouTube charts…',
    trendingUnavailable: 'The chart is unavailable right now.',
    personalQueue: 'Personal queue',
    quickSuggestions: 'Quick listening ideas',
    quickSuggestionsSubtitle: 'By region and mood',
    roomHelp: 'The owner controls playback, members listen in sync and keep private volume.',
    roomMode: 'Room mode',
    roomTitle: 'Create a synced room',
    roomsJoined: 'Recently joined',
    roomsOwned: 'Owner',
    searchButton: 'Search',
    searching: 'Searching',
    searchPlaceholder: 'Search for a song, artist, or paste a YouTube link',
    upNext: 'Up next'
  },
  vi: {
    add: 'Thêm',
    createRoom: 'Tạo phòng',
    emptyQueue: 'Chọn chủ đề hot hoặc tìm bài để thêm vào queue.',
    enterRoom: 'Vào',
    language: 'Ngôn ngữ',
    listenMode: 'Cá nhân',
    localQueue: 'Queue đang lưu local',
    localQueueHelp: 'Đăng nhập để chuyển thành playlist nghe chung trong phòng.',
    login: 'Đăng nhập',
    logout: 'Đăng xuất',
    myRooms: 'Phòng của tôi',
    noJoinedRooms: 'Phòng bạn vừa tham gia sẽ hiện ở đây.',
    noOwnedRooms: 'Phòng bạn làm chủ sẽ hiện ở đây.',
    nowPlayingFallback: 'Chọn bài hát để bắt đầu',
    nowPlayingLabel: 'Đang phát',
    topTracks: 'Top 30 nhạc thịnh hành trên YouTube',
    updatedAt: 'Cập nhật lúc',
    trendingLoading: 'Đang tải bảng xếp hạng YouTube…',
    trendingUnavailable: 'Hiện chưa tải được bảng xếp hạng.',
    personalQueue: 'Hàng chờ cá nhân',
    quickSuggestions: 'Gợi ý nghe nhanh',
    quickSuggestionsSubtitle: 'Theo khu vực và mood',
    roomHelp: 'Chủ phòng điều khiển phát nhạc, thành viên nghe đồng bộ và giữ volume riêng.',
    roomMode: 'Chế độ phòng',
    roomTitle: 'Tạo phòng nghe chung',
    roomsJoined: 'Vừa tham gia',
    roomsOwned: 'Đang làm chủ',
    searchButton: 'Tìm',
    searching: 'Đang tìm',
    searchPlaceholder: 'Tìm bài hát, nghệ sĩ, hoặc dán link YouTube',
    upNext: 'Sắp phát'
  }
} satisfies Record<Language, Record<string, string>>;

const chartRegions = [
  { code: 'VN' as const, region: 'VN' }
];

const quickMoods = [
  { label: 'V-Pop mới', query: 'V-Pop mới nhất' },
  { label: 'Rap Việt hot', query: 'rap Việt hot trending' },
  { label: 'US pop', query: 'US pop hits playlist' },
  { label: 'UK dance', query: 'UK dance hits playlist' }
];

const fallbackRecentTopics = [
  { artist: 'Nhạc Việt', color: 'from-amber-300 to-rose-500', query: 'V-Pop mới nhất', title: 'V-Pop mới' },
  { artist: 'US / Billboard style', color: 'from-cyan-300 to-blue-600', query: 'US pop hits playlist', title: 'US Pop Hits' },
  { artist: 'UK club & pop', color: 'from-fuchsia-400 to-red-600', query: 'UK dance hits playlist', title: 'UK Dance' }
];

export default function HomePage() {
  const router = useRouter();
  const playerRef = useRef<YouTubeRoomPlayerHandle | null>(null);
  const searchRequestIdRef = useRef(0);
  const trendingLoadedRef = useRef(false);
  const [me, setMe] = useState<AuthUser | null>(null);
  const [listenerCount, setListenerCount] = useState(0);
  const [language, setLanguage] = useState<Language>('vi');
  const [myRoomsOpen, setMyRoomsOpen] = useState(false);
  const [myRooms, setMyRooms] = useState<MyRooms>({ owned: [], recentJoined: [] });
  const [discoverableRooms, setDiscoverableRooms] = useState<PublicRoom[]>([]);
  const [trendingTracks, setTrendingTracks] = useState<Record<string, YouTubeVideo[]>>({});
  const [trendingUpdatedAt, setTrendingUpdatedAt] = useState<string | null>(null);
  const [trendingLoading, setTrendingLoading] = useState(true);
  const [trendingError, setTrendingError] = useState(false);
  const [query, setQuery] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomCode, setNewRoomCode] = useState('');
  const [newRoomIsPrivate, setNewRoomIsPrivate] = useState(false);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [queue, setQueue] = useState<YouTubeVideo[]>([]);
  const [recentTracks, setRecentTracks] = useState<YouTubeVideo[]>([]);
  const [currentVideo, setCurrentVideo] = useState<YouTubeVideo | null>(null);
  const [playerState, setPlayerState] = useState<RoomPlayerState | null>(null);
  const [progress, setProgress] = useState({ currentTime: 0, duration: 0, muted: false, volume: 100 });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState('Hot Việt Nam');
  const t = copy[language];

  useEffect(() => {
    const storedLanguage = window.localStorage.getItem('music-room-language');
    if (storedLanguage === 'vi' || storedLanguage === 'en') {
      setLanguage(storedLanguage);
    }

    const storedRecent = window.localStorage.getItem('music-room-recent-tracks');
    if (storedRecent) {
      setRecentTracks(JSON.parse(storedRecent) as YouTubeVideo[]);
    }

    void authService.me()
      .then((currentUser) => {
        setMe(currentUser);
        return refreshMyRooms();
      })
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshPublicRooms = async () => {
      try {
        const rooms = await roomsService.publicRooms();
        if (!cancelled) setDiscoverableRooms(rooms.slice(0, 3));
      } catch {
        // Keep the home page usable if the public room directory is unavailable.
      }
    };
    void refreshPublicRooms();
    const intervalId = window.setInterval(() => void refreshPublicRooms(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshTrending = async () => {
      try {
        const charts = await Promise.all(chartRegions.map(async (region) => [region.region, await youtubeService.trending(region.code)] as const));
        if (!cancelled) {
          trendingLoadedRef.current = true;
          setTrendingTracks(Object.fromEntries(charts.map(([region, chart]) => [region, chart.items])));
          setTrendingUpdatedAt(charts[0]?.[1].updatedAt ?? null);
          setTrendingError(false);
        }
      } catch {
        if (!cancelled && !trendingLoadedRef.current) setTrendingError(true);
      } finally {
        if (!cancelled) setTrendingLoading(false);
      }
    };
    void refreshTrending();
    const intervalId = window.setInterval(() => void refreshTrending(), 60 * 60 * 1000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const refreshListenerCount = async () => {
      try {
        const stats = await apiClient<{ listeners: number }>('/stats/listeners');
        if (!cancelled) setListenerCount(stats.listeners);
      } catch {
        // Keep the home page usable if listener stats are temporarily unavailable.
      }
    };
    void refreshListenerCount();
    const intervalId = window.setInterval(() => void refreshListenerCount(), 30000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, []);

  useEffect(() => {
    const searchQuery = query.trim();
    if (searchQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void performSearch(searchQuery, searchQuery);
    }, 500);

    return () => window.clearTimeout(timeoutId);
  }, [query]);

  function changeLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    window.localStorage.setItem('music-room-language', nextLanguage);
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await performSearch(query, selectedTopic);
  }

  async function searchTopic(topic: { label: string; query: string }) {
    setSelectedTopic(topic.label);
    setQuery(topic.query);
    await performSearch(topic.query, topic.label);
  }

  async function performSearch(searchQuery: string, topicLabel: string) {
    const normalizedQuery = searchQuery.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      return;
    }

    const requestId = searchRequestIdRef.current + 1;
    searchRequestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const response = await youtubeService.search(normalizedQuery);
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setResults(response.items);
      setSelectedTopic(topicLabel);
    } catch (err) {
      if (requestId !== searchRequestIdRef.current) {
        return;
      }

      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setLoading(false);
      }
    }
  }

  async function createRoom() {
    const normalizedCode = newRoomCode.trim().toUpperCase();
    const normalizedName = newRoomName.trim();
    if (!normalizedName) {
      setError(language === 'vi' ? 'Hãy nhập tên phòng.' : 'Enter a room name.');
      return;
    }
    setError(null);
    setCreatingRoom(true);
    try {
      const room = await roomsService.create({
        allowMemberAddSong: true,
        code: normalizedCode || undefined,
        isPrivate: newRoomIsPrivate,
        name: normalizedName
      });
      router.push(`/room/${room.code}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }

      setError(err instanceof Error ? err.message : 'Could not create room.');
    } finally {
      setCreatingRoom(false);
    }
  }

  function openCreateRoom(customCode = '') {
    setNewRoomCode(customCode);
    setNewRoomName('');
    setNewRoomIsPrivate(false);
    setCreateRoomOpen(true);
  }

  async function submitCreateRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await createRoom();
  }

  async function deleteOwnedRoom(code: string) {
    if (!window.confirm(`Delete room ${code}? This cannot be undone.`)) {
      return;
    }

    setError(null);
    try {
      await roomsService.delete(code);
      await refreshMyRooms();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }

      setError(err instanceof Error ? err.message : 'Could not delete room.');
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedCode = roomCode.trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setError(null);
    try {
      const room = await roomsService.join(normalizedCode);
      router.push(`/room/${room.code}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.push('/login');
        return;
      }

      setError(err instanceof Error ? err.message : 'Could not join room.');
    }
  }

  async function refreshMyRooms() {
    try {
      setMyRooms(await roomsService.myRooms());
    } catch {
      setMyRooms({ owned: [], recentJoined: [] });
    }
  }

  async function toggleMyRooms() {
    if (!me) {
      router.push('/login');
      return;
    }

    const nextOpen = !myRoomsOpen;
    setMyRoomsOpen(nextOpen);
    if (nextOpen) {
      await refreshMyRooms();
    }
  }

  async function logout() {
    await authService.logout().catch(() => undefined);
    setMe(null);
  }

  function addToQueue(video: YouTubeVideo) {
    setQueue((current) => {
      const nextQueue = [...current, video];
      if (currentVideo) {
        return nextQueue;
      }

      const [nextTrack, ...remaining] = nextQueue;
      if (nextTrack) {
        startVideo(nextTrack);
      }

      return remaining;
    });
  }

  function startVideo(video: YouTubeVideo) {
    setCurrentVideo(video);
    rememberRecentTrack(video);
    void personalService.addHistory(video.videoId).catch(() => undefined);
    setPlayerState(createPersonalPlayerState(video.videoId, 'playing'));
    setProgress((current) => ({ ...current, currentTime: 0, duration: 0 }));
  }

  function playNextQueuedTrack() {
    setQueue((current) => {
      const [nextTrack, ...remaining] = current;
      if (nextTrack) {
        startVideo(nextTrack);
      } else {
        setCurrentVideo(null);
        setPlayerState(null);
      }

      return remaining;
    });
  }

  function playCurrentVideo() {
    if (!currentVideo) {
      playNextQueuedTrack();
      return;
    }

    const currentTime = playerRef.current?.getCurrentTime() ?? playerState?.currentTime ?? 0;
    setPlayerState(createPersonalPlayerState(currentVideo.videoId, 'playing', currentTime));
    playerRef.current?.play();
  }

  function pauseCurrentVideo() {
    if (!currentVideo) {
      return;
    }

    const currentTime = playerRef.current?.getCurrentTime() ?? playerState?.currentTime ?? 0;
    setPlayerState(createPersonalPlayerState(currentVideo.videoId, 'paused', currentTime));
    playerRef.current?.pause();
  }

  function playQueuedTrack(video: YouTubeVideo, queueIndex: number) {
    setQueue((current) => current.filter((_, index) => index !== queueIndex));
    startVideo(video);
  }

  function removeQueuedTrack(queueIndex: number) {
    setQueue((current) => current.filter((_, index) => index !== queueIndex));
  }

  function shuffleQueue() {
    setQueue((current) => {
      if (current.length < 2) {
        return current;
      }

      const shuffled = [...current];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
      }

      return shuffled;
    });
  }

  function seek(nextTime: number) {
    playerRef.current?.seekTo(nextTime);
    setPlayerState((current) => (current ? { ...current, currentTime: nextTime, startedAt: new Date().toISOString() } : current));
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

  function rememberRecentTrack(video: YouTubeVideo) {
    setRecentTracks((current) => {
      const next = [video, ...current.filter((item) => item.videoId !== video.videoId)].slice(0, 6);
      window.localStorage.setItem('music-room-recent-tracks', JSON.stringify(next));
      return next;
    });
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden px-3 py-3 text-foreground sm:px-4 md:px-6 lg:px-8">
      <div className="mx-auto flex w-full min-w-0 max-w-7xl flex-col gap-4">
        <header className="flex w-full min-w-0 max-w-full flex-col gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-3 backdrop-blur sm:px-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-md bg-accent/10 shadow-lg shadow-accent/20">
              <img src="/icon.svg" alt="" className="size-8" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-muted">Music Room</p>
              <h1 className="text-lg font-semibold leading-tight sm:text-xl">{language === 'vi' ? 'Cùng nghe, cùng chill' : 'Listen together, vibe together'}</h1>
            </div>
            <div className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full border border-accent/25 bg-accent/10 px-3 text-xs" aria-label={`${listenerCount.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')} ${language === 'vi' ? 'đang nghe' : 'listening'}`}>
              <span className="size-2 rounded-full bg-accent shadow-[0_0_8px_rgba(52,211,153,0.65)] motion-safe:animate-pulse" />
              <span className="font-semibold tabular-nums text-white">{listenerCount.toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US')}</span>
              <span className="text-white">{language === 'vi' ? 'đang nghe' : 'listening'}</span>
            </div>
          </div>

          <nav className="grid w-full grid-cols-1 gap-2 min-[420px]:grid-cols-2 sm:flex sm:flex-wrap sm:items-center xl:w-auto xl:justify-end">
            <div className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-md border border-white/10 bg-white/[0.03] p-1 sm:w-auto" aria-label={t.language}>
              {(['vi', 'en'] as const).map((option) => (
                <button
                  key={option}
                  onClick={() => changeLanguage(option)}
                  className={`h-8 rounded px-2 text-xs font-semibold transition ${
                    language === option ? 'bg-accent text-black' : 'text-muted hover:text-foreground'
                  }`}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
            {me ? (
              <>
                <button onClick={() => void toggleMyRooms()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground/90 transition hover:border-white/25 hover:bg-white/[0.07] sm:w-auto">
                  <DoorOpen size={17} />
                  {t.myRooms}
                </button>
                <button onClick={() => openCreateRoom()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-black transition hover:bg-[#55d8bb] sm:w-auto">
                  <Plus size={17} />
                  {t.createRoom}
                </button>
                <Link href="/me" className="inline-flex h-10 min-w-0 items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground/90 transition hover:border-white/25 hover:bg-white/[0.07] sm:w-auto">
                  <User size={17} />
                  <span className="max-w-28 truncate">{me.username}</span>
                </Link>
                <button onClick={() => void logout()} className="grid h-10 w-full place-items-center rounded-md border border-white/10 bg-white/[0.03] text-muted transition hover:border-white/25 hover:text-foreground min-[420px]:w-10" aria-label={t.logout}>
                  <LogOut size={17} />
                </button>
              </>
            ) : (
              <Link href="/login" className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground/90 transition hover:border-white/25 hover:bg-white/[0.07] sm:w-auto">
                <LogIn size={17} />
                {t.login}
              </Link>
            )}
            {!me ? (
              <button onClick={() => openCreateRoom()} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-black transition hover:bg-[#55d8bb] sm:w-auto">
                <Plus size={17} />
                {t.createRoom}
              </button>
            ) : null}
          </nav>
        </header>

        {createRoomOpen ? (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setCreateRoomOpen(false); }}>
            <form onSubmit={submitCreateRoom} className="w-full max-w-md rounded-xl border border-white/10 bg-[#151922] p-5 shadow-2xl">
              <h2 className="text-lg font-semibold">{language === 'vi' ? 'Tạo phòng mới' : 'Create a room'}</h2>
              <label className="mt-4 block text-sm text-muted" htmlFor="new-room-name">{language === 'vi' ? 'Tên phòng' : 'Room name'}</label>
              <input
                autoFocus
                id="new-room-name"
                className="mt-1 h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm outline-none focus:border-accent/60"
                maxLength={255}
                onChange={(event) => setNewRoomName(event.target.value)}
                placeholder={language === 'vi' ? 'Ví dụ: Nhạc chill buổi tối' : 'For example: Late night chill'}
                required
                value={newRoomName}
              />
              <label className="mt-4 block text-sm text-muted" htmlFor="new-room-code">{language === 'vi' ? 'Mã phòng (không bắt buộc)' : 'Room code (optional)'}</label>
              <input
                id="new-room-code"
                className="mt-1 h-11 w-full rounded-md border border-white/10 bg-black/25 px-3 text-sm uppercase outline-none focus:border-accent/60"
                maxLength={20}
                onChange={(event) => setNewRoomCode(event.target.value)}
                placeholder={language === 'vi' ? 'Tự tạo nếu để trống' : 'Generated if left empty'}
                value={newRoomCode}
              />
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
                <input checked={newRoomIsPrivate} className="mt-1 accent-accent" onChange={(event) => setNewRoomIsPrivate(event.target.checked)} type="checkbox" />
                <span>
                  <span className="block text-sm font-medium">{language === 'vi' ? 'Phòng riêng tư' : 'Private room'}</span>
                  <span className="mt-0.5 block text-xs text-muted">{language === 'vi' ? 'Không xuất hiện trong danh sách phòng công khai.' : 'Hidden from the public room list.'}</span>
                </span>
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setCreateRoomOpen(false)} className="h-10 rounded-md border border-white/10 px-4 text-sm text-muted hover:text-foreground">
                  {language === 'vi' ? 'Hủy' : 'Cancel'}
                </button>
                <button disabled={creatingRoom} className="h-10 rounded-md bg-accent px-4 text-sm font-semibold text-black disabled:opacity-60">
                  {creatingRoom ? (language === 'vi' ? 'Đang tạo...' : 'Creating...') : (language === 'vi' ? 'Tạo phòng' : 'Create room')}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <section className="w-full min-w-0 max-w-full rounded-lg border border-accent/25 bg-accent/10 p-3">
          <RecentRoomsPreview
            emptyText={language === 'vi' ? 'Chưa có phòng công khai.' : 'No public rooms yet.'}
            rooms={discoverableRooms}
            title={language === 'vi' ? 'Phòng công khai' : 'Public rooms'}
          />
        </section>

        <section className="grid w-full min-w-0 max-w-full gap-3 rounded-lg border border-white/10 bg-panel/80 p-3 xl:grid-cols-2">
          <RecentRoomsPreview
            emptyText={me
              ? (language === 'vi' ? 'Phòng gần đây sẽ hiện ở đây.' : 'Recent rooms will show here.')
              : (language === 'vi' ? 'Đăng nhập để xem phòng gần đây.' : 'Login to see recent rooms.')}
            rooms={[...myRooms.recentJoined, ...myRooms.owned].slice(0, 3)}
            title={language === 'vi' ? 'Phòng gần đây' : 'Recent rooms'}
          />
          <form onSubmit={joinRoom} className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <input
              className="min-h-14 min-w-0 flex-1 rounded-md border border-accent/25 bg-black/35 px-4 py-4 text-base uppercase text-foreground outline-none placeholder:normal-case placeholder:text-muted focus:border-accent sm:min-h-12 sm:py-0"
              placeholder={language === 'vi' ? 'Nhập mã phòng' : 'Enter room code'}
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value)}
            />
            <button className="h-14 w-full rounded-md border border-accent/30 px-4 text-base font-semibold text-accent transition hover:bg-accent hover:text-black sm:h-12 sm:w-24 sm:text-sm">
              {language === 'vi' ? 'Vào' : 'Join'}
            </button>
            <button
              type="button"
              onClick={() => openCreateRoom(roomCode)}
              className="h-14 w-full rounded-md bg-accent px-4 text-base font-semibold text-black transition hover:bg-[#55d8bb] sm:h-12 sm:w-28 sm:text-sm"
            >
              {language === 'vi' ? 'Tạo' : 'Create'}
            </button>
          </form>
        </section>

        {error ? <p className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{error}</p> : null}

        {myRoomsOpen ? (
          <section className="grid w-full min-w-0 max-w-full gap-4 rounded-lg border border-white/10 bg-panel/80 p-4 backdrop-blur xl:grid-cols-2">
            <RoomList
              title={t.roomsOwned}
              emptyText={t.noOwnedRooms}
              rooms={myRooms.owned}
              icon="owner"
              enterText={t.enterRoom}
              currentUserId={me?.id}
              onDelete={(code) => void deleteOwnedRoom(code)}
            />
            <RoomList title={t.roomsJoined} emptyText={t.noJoinedRooms} rooms={myRooms.recentJoined} icon="history" enterText={t.enterRoom} />
          </section>
        ) : null}

        <section className="grid w-full min-w-0 max-w-full gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,0.7fr)] 2xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.7fr)]">
          <div className="grid w-full min-w-0 max-w-full gap-4">
            <section className="relative w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-white/10 bg-panel/80 p-3 shadow-2xl shadow-black/30 backdrop-blur sm:p-4 md:p-5">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/70 to-transparent" />
              <div className="grid w-full min-w-0 max-w-full gap-5 2xl:grid-cols-[minmax(0,1fr)_18rem]">
                <div className="flex w-full min-w-0 max-w-full flex-col justify-between gap-6 md:min-h-[28rem]">
                  <div>
                    <form onSubmit={search} className="flex min-h-16 w-full min-w-0 max-w-full items-center gap-3 rounded-lg border border-white/10 bg-black/30 px-4 py-4 shadow-inner shadow-black/40 sm:min-h-14 sm:py-0">
                      <Search size={22} className="shrink-0 text-muted sm:size-[21px]" />
                      <input
                        className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
                        placeholder={t.searchPlaceholder}
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      <button className="hidden h-10 items-center gap-2 rounded-md bg-white px-3 text-sm font-semibold text-black transition hover:bg-accent sm:inline-flex">
                        <Search size={16} />
                        {loading ? t.searching : t.searchButton}
                      </button>
                    </form>

                    <div className="mt-3 flex flex-wrap gap-2">
                      {quickMoods.map((mood) => (
                        <button
                          key={mood.label}
                          onClick={() => void searchTopic(mood)}
                          className="inline-flex h-9 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 text-sm text-foreground/80 transition duration-200 hover:scale-[1.02] hover:border-accent/40 hover:text-accent motion-reduce:transform-none"
                        >
                          <Music2 size={15} />
                          {mood.label}
                        </button>
                      ))}
                    </div>

                    {results.length > 0 ? (
                      <SearchResultsGrid tracks={results} addText={t.add} onAdd={addToQueue} />
                    ) : null}

                  </div>

                  <section className="mt-6 min-w-0" aria-labelledby="youtube-trending-title">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                      <Music2 size={18} className="text-accent" />
                      <h2 id="youtube-trending-title" className="text-lg font-semibold">{t.topTracks}</h2>
                      </div>
                      {trendingUpdatedAt ? (
                        <p className="text-xs text-muted">
                          {t.updatedAt} {new Date(trendingUpdatedAt).toLocaleString(language === 'vi' ? 'vi-VN' : 'en-US', { dateStyle: 'short', timeStyle: 'short' })}
                        </p>
                      ) : null}
                    </div>
                    {trendingLoading ? (
                      <p className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted">{t.trendingLoading}</p>
                    ) : trendingError ? (
                      <p className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted">{t.trendingUnavailable}</p>
                    ) : (
                      <div className="grid min-w-0 gap-3">
                        {chartRegions.map((region) => (
                          <div key={region.region} className="min-w-0 rounded-lg border border-white/10 bg-white/[0.03] p-3">
                            <div className="mb-2 flex items-center justify-between gap-2">
                              <h3 className="truncate text-sm font-semibold">{language === 'vi' ? 'Việt Nam' : 'Vietnam'}</h3>
                              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] text-muted">{region.region}</span>
                            </div>
                            <div className="max-h-[30rem] space-y-2 overflow-y-auto pr-1">
                              {(trendingTracks[region.region] ?? []).slice(0, 30).map((track, index) => (
                                <article key={track.videoId} className="flex min-w-0 items-center gap-2 rounded-md bg-black/20 p-2 transition duration-200 hover:scale-[1.01] hover:bg-white/[0.05] motion-reduce:transform-none">
                                  <span className="w-5 shrink-0 text-center text-xs font-semibold text-accent">{index + 1}</span>
                                  <button onClick={() => startVideo(track)} className="flex min-w-0 flex-1 items-center gap-2 text-left" title={track.title}>
                                    {track.thumbnailUrl ? <img alt="" src={track.thumbnailUrl} className="size-12 shrink-0 rounded object-cover" /> : <span className="size-12 shrink-0 rounded bg-white/10" />}
                                    <span className="min-w-0">
                                      <span className="block truncate text-xs font-medium">{track.title}</span>
                                      <span className="mt-0.5 block truncate text-[10px] text-muted">{track.channelTitle}</span>
                                    </span>
                                  </button>
                                  <button onClick={() => void addToQueue(track)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold text-black transition hover:bg-[#55d8bb]" aria-label={`${t.add} ${track.title}`} title={t.add}>
                                    <Plus size={14} />
                                    {t.add}
                                  </button>
                                </article>
                              ))}
                              {(trendingTracks[region.region] ?? []).length === 0 ? <p className="text-xs text-muted">{t.trendingUnavailable}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>

                <aside className="order-first w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-white/10 bg-black/25 p-3 sm:p-4 2xl:order-none">
                  {playerState ? (
                    <YouTubeRoomPlayer
                      ref={playerRef}
                      isOwner
                      onEnded={playNextQueuedTrack}
                      onProgress={setProgress}
                      state={playerState}
                    />
                  ) : (
                    <div className="relative aspect-video w-full max-w-full overflow-hidden rounded-md border border-white/10 bg-[#10141d]">
                      <div className="flex size-full items-center justify-center bg-gradient-to-br from-red-500 via-amber-300 to-slate-950 text-black">
                        <Waves size={42} />
                      </div>
                    </div>
                  )}
                  <div className="mt-3">
                    <p className="text-sm text-muted">{t.nowPlayingLabel}</p>
                    <p className="mt-1 truncate font-semibold">{currentVideo?.title ?? t.nowPlayingFallback}</p>
                  </div>
                  <div className="mt-4">
                    <div className="flex items-center justify-between text-xs text-muted">
                      <span>{formatTime(progress.currentTime)}</span>
                      <span>{formatTime(progress.duration)}</span>
                    </div>
                    <input
                      aria-label="Seek"
                      className="mt-2 h-1.5 w-full accent-accent"
                      disabled={!playerState?.currentVideoId || progress.duration <= 0}
                      max={Math.max(progress.duration, 1)}
                      min={0}
                      onChange={(event) => seek(Number(event.target.value))}
                      type="range"
                      value={Math.min(progress.currentTime, Math.max(progress.duration, 1))}
                    />
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={shuffleQueue}
                      className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-foreground transition hover:bg-white/10"
                      aria-label="Shuffle queue"
                    >
                      <Shuffle size={18} />
                    </button>
                    <button
                      onClick={playerState?.status === 'playing' ? pauseCurrentVideo : playCurrentVideo}
                      className="grid size-12 place-items-center rounded-full bg-accent text-black shadow-lg shadow-accent/20 transition hover:bg-[#55d8bb]"
                      aria-label={playerState?.status === 'playing' ? 'Pause' : 'Play'}
                    >
                      {playerState?.status === 'playing' ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                    </button>
                    <button
                      onClick={playNextQueuedTrack}
                      className="grid size-10 place-items-center rounded-md border border-white/10 bg-white/[0.04] text-foreground transition hover:bg-white/10"
                      aria-label="Next"
                    >
                      <SkipForward size={18} />
                    </button>
                  </div>
                  <div className="mt-4 flex items-center gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-muted">
                    <button onClick={toggleMute} className="grid size-7 place-items-center rounded text-muted hover:text-foreground" aria-label="Mute">
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
                </aside>
              </div>
            </section>

            <section className="grid w-full min-w-0 max-w-full gap-4 xl:grid-cols-[1fr_0.82fr]">
              <div className="min-w-0 rounded-lg border border-white/10 bg-panel/75 p-4 backdrop-blur">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm text-muted">{t.quickSuggestions}</p>
                    <h2 className="text-lg font-semibold">{t.quickSuggestionsSubtitle}</h2>
                  </div>
                  <Clock3 size={19} className="text-muted" />
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  {recentTracks.length > 0 ? recentTracks.slice(0, 3).map((track) => (
                    <button key={track.videoId} onClick={() => startVideo(track)} className="flex min-h-24 min-w-0 max-w-full items-end overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3 text-left transition duration-200 hover:scale-[1.02] hover:border-white/25 motion-reduce:transform-none">
                      {track.thumbnailUrl ? <img src={track.thumbnailUrl} alt="" className="mr-3 size-11 shrink-0 rounded-md object-cover" /> : <span className="mr-3 size-11 shrink-0 rounded-md bg-white/10" />}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{track.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted">{track.channelTitle}</span>
                      </span>
                    </button>
                  )) : fallbackRecentTopics.map((track) => (
                    <button key={track.title} onClick={() => void searchTopic({ label: track.title, query: track.query })} className="flex min-h-24 min-w-0 max-w-full items-end overflow-hidden rounded-lg border border-white/10 bg-black/20 p-3 text-left transition duration-200 hover:scale-[1.02] hover:border-white/25 motion-reduce:transform-none">
                      <span className={`mr-3 size-11 shrink-0 rounded-md bg-gradient-to-br ${track.color}`} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{track.title}</span>
                        <span className="mt-1 block truncate text-xs text-muted">{track.artist}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0 rounded-lg border border-accent/20 bg-accent/10 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-accent">{t.roomMode}</p>
                    <h2 className="mt-1 text-lg font-semibold">{t.roomTitle}</h2>
                    <p className="mt-2 text-sm leading-6 text-foreground/70">{t.roomHelp}</p>
                  </div>
                  <Headphones size={22} className="text-accent" />
                </div>
                <button onClick={() => openCreateRoom()} className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 text-sm font-semibold text-black sm:w-auto">
                  <Plus size={16} />
                  {t.createRoom}
                </button>
              </div>
            </section>
          </div>

          <aside className="w-full min-w-0 max-w-full rounded-lg border border-white/10 bg-panel/80 p-3 shadow-2xl shadow-black/25 backdrop-blur sm:p-4 xl:sticky xl:top-4 xl:max-h-[calc(100dvh-2rem)]">
            <div>
              <p className="text-sm text-muted">{t.personalQueue}</p>
              <h2 className="text-xl font-semibold">{t.upNext}</h2>
            </div>

            <div className="mt-5 space-y-3">
              {queue.length === 0 ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-muted">{t.emptyQueue}</div>
              ) : (
                queue.map((track, index) => (
                  <div
                    key={`${track.videoId}-${index}`}
                    className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-center gap-2 rounded-lg border border-white/10 bg-black/20 p-2 transition hover:border-accent/40"
                  >
                    <button onClick={() => playQueuedTrack(track, index)} className="grid min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3 text-left">
                      {track.thumbnailUrl ? (
                        <span className="relative block aspect-video w-full overflow-hidden rounded-md">
                          <img src={track.thumbnailUrl} alt="" className="size-full object-cover" />
                          <span className="absolute bottom-1 right-1 grid size-5 place-items-center rounded bg-black/70 text-white">
                            <Play size={11} fill="currentColor" />
                          </span>
                        </span>
                      ) : (
                        <div className="grid aspect-video w-full place-items-center rounded-md bg-white/[0.06] text-sm text-muted">
                          {index === 0 ? <Play size={15} fill="currentColor" /> : index + 1}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{track.title}</p>
                        <p className="mt-1 truncate text-xs text-muted">{track.channelTitle}</p>
                      </div>
                    </button>
                    <button
                      onClick={() => removeQueuedTrack(index)}
                      className="grid size-8 place-items-center rounded-md border border-white/10 text-muted transition hover:border-danger/40 hover:text-danger"
                      aria-label="Remove from queue"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-md bg-danger/15 text-danger">
                  <ListMusic size={20} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium">{t.localQueue}</p>
                  <p className="mt-1 text-xs leading-5 text-muted">{t.localQueueHelp}</p>
                </div>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}

function RoomList({
  currentUserId,
  emptyText,
  enterText,
  icon,
  onDelete,
  rooms,
  title
}: {
  currentUserId?: number;
  emptyText: string;
  enterText: string;
  icon: 'history' | 'owner';
  onDelete?: (code: string) => void;
  rooms: RoomListItem[];
  title: string;
}) {
  const Icon = icon === 'owner' ? Crown : History;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-accent" />
        <h2 className="text-base font-semibold">{title}</h2>
      </div>

      <div className="mt-3 space-y-2">
        {rooms.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-black/20 p-3 text-sm text-muted">{emptyText}</div>
        ) : (
          rooms.map((room) => {
            const canDelete = Boolean(onDelete && currentUserId && room.ownerId === currentUserId);
            return (
            <Link
              key={room.code}
              href={`/room/${room.code}`}
              className="grid grid-cols-1 items-center gap-3 rounded-md border border-white/10 bg-black/20 p-3 transition duration-200 hover:scale-[1.01] hover:border-accent/40 hover:bg-white/[0.05] motion-reduce:transform-none sm:grid-cols-[minmax(0,1fr)_auto]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{room.name}</span>
                  <span className="shrink-0 rounded border border-white/10 bg-white/[0.04] px-1.5 py-0.5 text-[11px] text-muted">{room.code}</span>
                </span>
                <span className="mt-1 block truncate text-xs text-muted">
                  {room.currentTitle ?? room.playerStatus} · {room.onlineMemberCount}/{room.memberCount} online · {formatShortDate(room.lastSeenAt ?? room.updatedAt)}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-flex h-8 w-full items-center justify-center rounded-md bg-accent px-2 text-xs font-semibold text-black sm:w-auto">{enterText}</span>
                {canDelete ? (
                  <span
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete?.(room.code);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      onDelete?.(room.code);
                    }}
                    className="grid size-8 place-items-center rounded-md border border-white/10 text-muted transition hover:border-danger/40 hover:text-danger"
                    aria-label={`Delete room ${room.code}`}
                    role="button"
                    tabIndex={0}
                    title="Delete room"
                  >
                    <Trash2 size={15} />
                  </span>
                ) : null}
              </span>
            </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function RecentRoomsPreview({ emptyText, rooms, title }: { emptyText: string; rooms: Array<Pick<RoomListItem, 'code' | 'name' | 'onlineMemberCount' | 'memberCount'>>; title: string }) {
  return (
    <div className="min-w-0 rounded-md border border-white/10 bg-black/20 p-3">
      <div className="flex items-center gap-2">
        <History size={16} className="text-accent" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>

      {rooms.length === 0 ? (
        <p className="mt-2 text-sm text-muted">{emptyText}</p>
      ) : (
        <div className="mt-2 grid min-w-0 gap-2 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
          {rooms.map((room) => (
            <Link
              key={room.code}
              href={`/room/${room.code}`}
              className="min-w-0 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 transition duration-200 hover:scale-[1.02] hover:border-accent/40 hover:bg-white/[0.06] motion-reduce:transform-none"
            >
              <span className="block truncate text-sm font-medium">{room.name}</span>
              <span className="mt-1 block truncate text-xs text-muted">
                {room.code} · {room.onlineMemberCount}/{room.memberCount} online
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchResultsGrid({ addText, onAdd, tracks }: { addText: string; onAdd: (video: YouTubeVideo) => void; tracks: YouTubeVideo[] }) {
  return (
    <div className="mt-4 grid w-full min-w-0 max-w-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tracks.map((track) => (
        <article key={track.videoId} className="group w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] transition duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-accent/40 hover:bg-white/[0.07] motion-reduce:transform-none">
          <div className="relative aspect-video overflow-hidden bg-black">
            {track.thumbnailUrl ? (
              <img src={track.thumbnailUrl} alt="" className="size-full object-cover opacity-85 transition duration-300 group-hover:scale-105 group-hover:opacity-100" />
            ) : (
              <div className="grid size-full place-items-center bg-white/10 text-sm text-muted">No thumbnail</div>
            )}
          </div>
          <div className="p-3">
            <p className="truncate text-sm font-medium">{track.title}</p>
            <p className="mt-2 truncate text-xs text-muted">{track.channelTitle}</p>
            <button onClick={() => onAdd(track)} className="mt-3 inline-flex h-8 items-center gap-1 rounded-md bg-accent px-2 text-xs font-semibold text-black">
              <Plus size={14} />
              {addText}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

function createPersonalPlayerState(videoId: string, status: RoomPlayerState['status'], currentTime = 0): RoomPlayerState {
  return {
    currentQueueItemId: null,
    currentTime,
    currentVideoId: videoId,
    roomId: 0,
    startedAt: status === 'playing' ? new Date().toISOString() : null,
    status,
    updatedBy: 0
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '0:00';
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}

function formatShortDate(value: string | null) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit'
  }).format(new Date(value));
}
