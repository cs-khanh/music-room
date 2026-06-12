'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { RoomPlayerState } from '@music-room/shared';

type YouTubeRoomPlayerProps = {
  isOwner: boolean;
  onProgress?: (progress: { currentTime: number; duration: number; volume: number; muted: boolean }) => void;
  state: RoomPlayerState | null;
  onEnded: () => void;
};

export type YouTubeRoomPlayerHandle = {
  getDuration: () => number;
  getCurrentTime: () => number;
  getVolume: () => number;
  isMuted: () => boolean;
  mute: () => void;
  pause: () => void;
  play: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  syncToState: (state: RoomPlayerState) => void;
  unMute: () => void;
};

type YouTubePlayer = {
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  getVolume: () => number;
  isMuted: () => boolean;
  loadVideoById: (videoId: string, startSeconds?: number) => void;
  mute: () => void;
  pauseVideo: () => void;
  playVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  unMute: () => void;
};

type YouTubePlayerConstructor = new (
  elementId: string,
  options: {
    events: {
      onAutoplayBlocked?: () => void;
      onError?: () => void;
      onReady: () => void;
      onStateChange: (event: { data: number }) => void;
    };
    height: string;
    playerVars: Record<string, number | string>;
    videoId?: string;
    width: string;
  }
) => YouTubePlayer;

declare global {
  interface Window {
    YT?: {
      Player: YouTubePlayerConstructor;
      PlayerState: {
        BUFFERING: number;
        ENDED: number;
        PAUSED: number;
        PLAYING: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let playerApiPromise: Promise<void> | null = null;
const playbackDriftToleranceSeconds = 2;

export const YouTubeRoomPlayer = forwardRef<YouTubeRoomPlayerHandle, YouTubeRoomPlayerProps>(
  function YouTubeRoomPlayer({ isOwner, onEnded, onProgress, state }, ref) {
    const elementBaseId = useRef(`youtube-player-${Math.random().toString(36).slice(2)}`);
    const onEndedRef = useRef(onEnded);
    const onProgressRef = useRef(onProgress);
    const playerRef = useRef<YouTubePlayer | null>(null);
    const playerContainerRef = useRef<HTMLDivElement | null>(null);
    const stateRef = useRef<RoomPlayerState | null>(state);
    const isOwnerRef = useRef(isOwner);
    const lastVideoId = useRef<string | null>(null);
    const audioUnlockedRef = useRef(false);
    const recoveryAttempts = useRef({ count: 0, videoId: null as string | null });
    const [ready, setReady] = useState(false);
    const [embedFallback, setEmbedFallback] = useState(false);
    const [embedFallbackState, setEmbedFallbackState] = useState<RoomPlayerState | null>(null);
    const [autoMuted, setAutoMuted] = useState(false);
    const [needsUserStart, setNeedsUserStart] = useState(false);
    const [playerVersion, setPlayerVersion] = useState(0);
    const elementId = `${elementBaseId.current}-${playerVersion}`;

    function getPlayer() {
      const player = playerRef.current;
      if (!isYouTubePlayer(player)) {
        return null;
      }

      return player;
    }

    function reportProgress() {
      const player = getPlayer();
      if (!player) {
        return;
      }

      onProgressRef.current?.({
        currentTime: player.getCurrentTime() || 0,
        duration: player.getDuration() || 0,
        muted: player.isMuted(),
        volume: player.getVolume() ?? 100
      });
    }

    function clearPlayerContainer() {
      const container = playerContainerRef.current;
      if (!container) {
        return;
      }

      container.replaceChildren();
    }

    function destroyPlayer() {
      const player = getPlayer();
      if (player) {
        try {
          player.destroy();
        } catch {
          // YouTube may already have removed its iframe during route changes.
        }
      }

      playerRef.current = null;
      clearPlayerContainer();
    }

    function playVideoWithFallback() {
      const player = getPlayer();
      if (!player) {
        return;
      }

      audioUnlockedRef.current = true;
      setNeedsUserStart(false);
      player.playVideo();
      reportProgress();
    }

    function isPlayerActivelyLoadingOrPlaying() {
      const player = getPlayer();
      const playerState = window.YT?.PlayerState;
      if (!player || !playerState) {
        return false;
      }

      const currentPlayerState = player.getPlayerState();
      return currentPlayerState === playerState.PLAYING || currentPlayerState === playerState.BUFFERING;
    }

    function schedulePlaybackCheck(nextState: RoomPlayerState) {
      if (nextState.status !== 'playing' || !nextState.currentVideoId) {
        return;
      }

      window.setTimeout(() => {
        const currentState = stateRef.current;
        if (currentState?.status !== 'playing' || currentState.currentVideoId !== nextState.currentVideoId) {
          return;
        }

        if (!isPlayerActivelyLoadingOrPlaying()) {
          setNeedsUserStart(true);
        }
      }, 1200);
    }

    function tryMutedAutoplay() {
      const player = getPlayer();
      const currentState = stateRef.current;
      if (!player || currentState?.status !== 'playing' || !currentState.currentVideoId) {
        return;
      }

      if (audioUnlockedRef.current) {
        setNeedsUserStart(true);
        return;
      }

      player.mute();
      setAutoMuted(true);
      player.playVideo();
      reportProgress();
      schedulePlaybackCheck(currentState);
    }

    function startListening() {
      const currentState = stateRef.current;
      const player = getPlayer();
      if (!currentState?.currentVideoId || !player) {
        return;
      }

      setNeedsUserStart(false);
      audioUnlockedRef.current = true;
      if (currentState.currentVideoId !== lastVideoId.current || player.getDuration() <= 0) {
        player.loadVideoById(currentState.currentVideoId, currentState.currentTime);
      } else {
        player.seekTo(currentState.currentTime, true);
      }
      player.unMute();
      setAutoMuted(false);
      player.playVideo();
      reportProgress();
    }

    function unmuteAutoplay() {
      const player = getPlayer();
      if (!player) {
        return;
      }

      audioUnlockedRef.current = true;
      player.unMute();
      setAutoMuted(false);
      reportProgress();
    }

    function recreatePlayer() {
      destroyPlayer();
      lastVideoId.current = null;
      setReady(false);
      setPlayerVersion((current) => current + 1);
    }

    function activateEmbedFallback() {
      destroyPlayer();
      setReady(false);
      setEmbedFallbackState(stateRef.current);
      setEmbedFallback(true);
    }

    function scheduleLoadFallback(nextState: RoomPlayerState) {
      if (!nextState.currentVideoId) {
        return;
      }

      window.setTimeout(() => {
        const currentState = stateRef.current;
        const player = getPlayer();
        if (!currentState?.currentVideoId || currentState.currentVideoId !== nextState.currentVideoId || !player) {
          return;
        }

        if (player.getDuration() > 0 || isPlayerActivelyLoadingOrPlaying()) {
          recoveryAttempts.current = { count: 0, videoId: currentState.currentVideoId };
          return;
        }

        const attempts =
          recoveryAttempts.current.videoId === currentState.currentVideoId ? recoveryAttempts.current.count + 1 : 1;
        recoveryAttempts.current = { count: attempts, videoId: currentState.currentVideoId };

        if (attempts <= 2) {
          recreatePlayer();
          return;
        }

        activateEmbedFallback();
      }, 5000);
    }

    function syncPlayerToState(nextState: RoomPlayerState) {
      if (!nextState.currentVideoId || nextState.currentVideoId !== lastVideoId.current) {
        setEmbedFallback(false);
        setEmbedFallbackState(null);
      }
      if (embedFallback && nextState.currentVideoId && nextState.currentVideoId === lastVideoId.current) {
        setEmbedFallbackState((current) => {
          if (!current || current.currentVideoId !== nextState.currentVideoId || current.status !== nextState.status) {
            return nextState;
          }

          if (nextState.status !== 'playing' && Math.abs(current.currentTime - nextState.currentTime) > playbackDriftToleranceSeconds) {
            return nextState;
          }

          return current;
        });
        return;
      }
      const player = getPlayer();
      if (!player) {
        return;
      }

      if (!nextState.currentVideoId) {
        player.pauseVideo();
        lastVideoId.current = null;
        setAutoMuted(false);
        setNeedsUserStart(false);
        reportProgress();
        return;
      }

      const shouldLoadVideo = lastVideoId.current !== nextState.currentVideoId || player.getDuration() <= 0;
      lastVideoId.current = nextState.currentVideoId;

      if (shouldLoadVideo) {
        if (nextState.status === 'playing') {
          player.loadVideoById(nextState.currentVideoId, nextState.currentTime);
        } else {
          player.cueVideoById(nextState.currentVideoId, nextState.currentTime);
        }
      } else {
        const currentTime = player.getCurrentTime() || 0;
        const drift = Math.abs(currentTime - nextState.currentTime);
        if (nextState.status !== 'playing' || drift > playbackDriftToleranceSeconds) {
          player.seekTo(nextState.currentTime, true);
        }
      }

      if (nextState.status === 'playing') {
        setNeedsUserStart(false);
        if (!isPlayerActivelyLoadingOrPlaying()) {
          player.playVideo();
          window.setTimeout(() => {
            const currentState = stateRef.current;
            if (currentState?.status === 'playing' && currentState.currentVideoId === nextState.currentVideoId && !isPlayerActivelyLoadingOrPlaying()) {
              tryMutedAutoplay();
            }
          }, 300);
        }
      }

      if (nextState.status === 'paused' || nextState.status === 'idle') {
        setAutoMuted(false);
        setNeedsUserStart(false);
        player.pauseVideo();
      }

      reportProgress();
      window.setTimeout(reportProgress, 500);
      window.setTimeout(reportProgress, 1500);
      schedulePlaybackCheck(nextState);
      scheduleLoadFallback(nextState);
    }

    useImperativeHandle(ref, () => ({
      getDuration: () => getPlayer()?.getDuration() ?? 0,
      getCurrentTime: () => getPlayer()?.getCurrentTime() ?? state?.currentTime ?? 0,
      getVolume: () => getPlayer()?.getVolume() ?? 100,
      isMuted: () => getPlayer()?.isMuted() ?? false,
      mute: () => getPlayer()?.mute(),
      pause: () => getPlayer()?.pauseVideo(),
      play: () => playVideoWithFallback(),
      seekTo: (seconds: number) => getPlayer()?.seekTo(seconds, true),
      setVolume: (volume: number) => {
        if (volume > 0) {
          audioUnlockedRef.current = true;
          setAutoMuted(false);
        }
        getPlayer()?.setVolume(volume);
      },
      syncToState: (nextState: RoomPlayerState) => syncPlayerToState(nextState),
      unMute: () => {
        audioUnlockedRef.current = true;
        setAutoMuted(false);
        getPlayer()?.unMute();
      }
    }));

    useEffect(() => {
      onEndedRef.current = onEnded;
    }, [onEnded]);

    useEffect(() => {
      onProgressRef.current = onProgress;
    }, [onProgress]);

    useEffect(() => {
      stateRef.current = state;
    }, [state]);

    useEffect(() => {
      isOwnerRef.current = isOwner;
    }, [isOwner]);

    useEffect(() => {
      let mounted = true;
      void loadYouTubeApi().then(() => {
        const container = playerContainerRef.current;
        if (!mounted || embedFallback || playerRef.current || !window.YT || !container) {
          return;
        }

        clearPlayerContainer();
        const mountNode = document.createElement('div');
        mountNode.id = elementId;
        mountNode.className = 'size-full';
        container.appendChild(mountNode);

        playerRef.current = new window.YT.Player(elementId, {
          height: '100%',
          width: '100%',
          playerVars: {
            autoplay: 0,
            controls: 1,
            disablekb: isOwner ? 0 : 1,
            enablejsapi: 1,
            modestbranding: 1,
            origin: window.location.origin,
            playsinline: 1,
            rel: 0
          },
          events: {
            onAutoplayBlocked: () => {
              const currentState = stateRef.current;
              if (currentState?.status !== 'playing') {
                return;
              }

              tryMutedAutoplay();
            },
            onError: () => {
              activateEmbedFallback();
            },
            onReady: () => {
              setReady(true);
              const currentState = stateRef.current;
              if (currentState) {
                syncPlayerToState(currentState);
              }
            },
            onStateChange: (event) => {
              reportProgress();
              if (event.data === window.YT?.PlayerState.PLAYING || event.data === window.YT?.PlayerState.BUFFERING) {
                setNeedsUserStart(false);
              }
              if (isOwner && event.data === window.YT?.PlayerState.ENDED) {
                onEndedRef.current();
              }
            }
          }
        });
      });

      return () => {
        mounted = false;
        destroyPlayer();
        lastVideoId.current = null;
        setReady(false);
      };
    }, [elementId, embedFallback, isOwner]);

    useEffect(() => {
      const player = getPlayer();
      if (!ready || !player || !state?.currentVideoId) {
        return;
      }

      syncPlayerToState(state);
    }, [ready, state]);

    useEffect(() => {
      if (!embedFallback || !state?.currentVideoId) {
        return;
      }

      syncPlayerToState(state);
    }, [embedFallback, state]);

    useEffect(() => {
      if (!ready || !state?.currentVideoId) {
        return;
      }

      const interval = window.setInterval(() => {
        const player = getPlayer();
        if (!player) {
          return;
        }

        onProgressRef.current?.({
          currentTime: player.getCurrentTime() || 0,
          duration: player.getDuration() || 0,
          muted: player.isMuted(),
          volume: player.getVolume() ?? 100
        });
      }, 500);

      return () => window.clearInterval(interval);
    }, [ready, state?.currentVideoId]);

    useEffect(() => {
      if (!needsUserStart) {
        return;
      }

      const interval = window.setInterval(() => {
        if (isPlayerActivelyLoadingOrPlaying()) {
          setNeedsUserStart(false);
        }
      }, 500);

      return () => window.clearInterval(interval);
    }, [needsUserStart]);

    useEffect(() => {
      if (ready || embedFallback || !state?.currentVideoId) {
        return;
      }

      const timeoutId = window.setTimeout(() => {
        if (!ready && stateRef.current?.currentVideoId) {
          activateEmbedFallback();
        }
      }, 5000);

      return () => window.clearTimeout(timeoutId);
    }, [embedFallback, ready, state?.currentVideoId]);

    return (
      <div className="relative aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black">
        {embedFallback && (embedFallbackState ?? state)?.currentVideoId ? (
          <iframe
            key={(embedFallbackState ?? state)!.currentVideoId!}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
            className="size-full"
            src={createEmbedFallbackUrl((embedFallbackState ?? state)!)}
            title="YouTube fallback player"
          />
        ) : (
          <div ref={playerContainerRef} className="size-full" />
        )}
        {!state?.currentVideoId ? (
          <div className="absolute inset-0 grid place-items-center bg-black text-muted">No song playing</div>
        ) : null}
        {autoMuted && state?.status === 'playing' && state.currentVideoId ? (
          <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-md border border-white/10 bg-black/80 p-3 text-sm text-white shadow-lg sm:flex-row sm:items-center sm:justify-between">
            <span>Autoplay started muted. Unmute to hear audio.</span>
            <button className="rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-black" onClick={unmuteAutoplay} type="button">
              Unmute
            </button>
          </div>
        ) : null}
        {needsUserStart && state?.status === 'playing' && state.currentVideoId ? (
          <button
            className="absolute inset-0 grid place-items-center bg-black/75 px-4 text-center text-sm font-semibold text-white"
            onClick={startListening}
            type="button"
          >
            {isOwner ? 'Click to start playback' : 'Click to start listening'}
          </button>
        ) : null}
      </div>
    );
  }
);

function createEmbedFallbackUrl(state: RoomPlayerState) {
  const params = new URLSearchParams({
    autoplay: state.status === 'playing' ? '1' : '0',
    controls: '1',
    enablejsapi: '1',
    modestbranding: '1',
    origin: window.location.origin,
    playsinline: '1',
    rel: '0',
    start: String(Math.max(0, Math.floor(state.currentTime)))
  });

  return `https://www.youtube.com/embed/${state.currentVideoId}?${params.toString()}`;
}

function loadYouTubeApi() {
  if (window.YT?.Player) {
    return Promise.resolve();
  }

  if (!playerApiPromise) {
    playerApiPromise = new Promise((resolve) => {
      const previous = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previous?.();
        resolve();
      };

      if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(script);
      }
    });
  }

  return playerApiPromise;
}

function isYouTubePlayer(player: YouTubePlayer | null): player is YouTubePlayer {
  return (
    Boolean(player) &&
    typeof player?.cueVideoById === 'function' &&
    typeof player.destroy === 'function' &&
    typeof player.getCurrentTime === 'function' &&
    typeof player.getDuration === 'function' &&
    typeof player.getPlayerState === 'function' &&
    typeof player.getVolume === 'function' &&
    typeof player.isMuted === 'function' &&
    typeof player.loadVideoById === 'function' &&
    typeof player.mute === 'function' &&
    typeof player.pauseVideo === 'function' &&
    typeof player.playVideo === 'function' &&
    typeof player.seekTo === 'function' &&
    typeof player.setVolume === 'function' &&
    typeof player.unMute === 'function'
  );
}
