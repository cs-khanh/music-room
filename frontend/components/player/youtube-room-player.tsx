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
  unMute: () => void;
};

type YouTubePlayer = {
  cueVideoById: (videoId: string, startSeconds?: number) => void;
  destroy: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
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
        ENDED: number;
      };
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let playerApiPromise: Promise<void> | null = null;

export const YouTubeRoomPlayer = forwardRef<YouTubeRoomPlayerHandle, YouTubeRoomPlayerProps>(
  function YouTubeRoomPlayer({ isOwner, onEnded, onProgress, state }, ref) {
    const elementId = useRef(`youtube-player-${Math.random().toString(36).slice(2)}`);
    const onEndedRef = useRef(onEnded);
    const onProgressRef = useRef(onProgress);
    const playerRef = useRef<YouTubePlayer | null>(null);
    const stateRef = useRef<RoomPlayerState | null>(state);
    const isOwnerRef = useRef(isOwner);
    const lastVideoId = useRef<string | null>(null);
    const [ready, setReady] = useState(false);

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
        volume: player.getVolume()
      });
    }

    function playVideoWithFallback() {
      const player = getPlayer();
      if (!player) {
        return;
      }

      player.playVideo();
      reportProgress();
    }

    function syncPlayerToState(nextState: RoomPlayerState) {
      const player = getPlayer();
      if (!player) {
        return;
      }

      if (!nextState.currentVideoId) {
        player.pauseVideo();
        lastVideoId.current = null;
        reportProgress();
        return;
      }

      const shouldLoadVideo = lastVideoId.current !== nextState.currentVideoId || player.getDuration() <= 0;
      lastVideoId.current = nextState.currentVideoId;

      if (shouldLoadVideo) {
        if (nextState.status === 'playing') {
          if (!isOwnerRef.current && !player.isMuted()) {
            player.mute();
          }
          player.loadVideoById(nextState.currentVideoId, nextState.currentTime);
        } else {
          player.cueVideoById(nextState.currentVideoId, nextState.currentTime);
        }
      } else {
        player.seekTo(nextState.currentTime, true);
      }

      if (nextState.status === 'playing') {
        player.playVideo();
      }

      if (nextState.status === 'paused' || nextState.status === 'idle') {
        player.pauseVideo();
      }

      reportProgress();
      window.setTimeout(reportProgress, 500);
      window.setTimeout(reportProgress, 1500);
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
      setVolume: (volume: number) => getPlayer()?.setVolume(volume),
      unMute: () => getPlayer()?.unMute()
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
        if (!mounted || playerRef.current || !window.YT) {
          return;
        }

        playerRef.current = new window.YT.Player(elementId.current, {
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
              if (currentState?.status !== 'playing' || isOwnerRef.current) {
                return;
              }

              const player = getPlayer();
              player?.mute();
              player?.playVideo();
              reportProgress();
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
              if (isOwner && event.data === window.YT?.PlayerState.ENDED) {
                onEndedRef.current();
              }
            }
          }
        });
      });

      return () => {
        mounted = false;
        const player = getPlayer();
        if (player) {
          player.destroy();
        }
        playerRef.current = null;
        lastVideoId.current = null;
        setReady(false);
      };
    }, [isOwner]);

    useEffect(() => {
      const player = getPlayer();
      if (!ready || !player || !state?.currentVideoId) {
        return;
      }

      syncPlayerToState(state);
    }, [ready, state]);

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
          volume: player.getVolume()
        });
      }, 500);

      return () => window.clearInterval(interval);
    }, [ready, state?.currentVideoId]);

    return (
      <div className="aspect-video w-full max-w-full overflow-hidden rounded-lg bg-black">
        {state?.currentVideoId ? <div id={elementId.current} className="size-full" /> : <div className="grid size-full place-items-center text-muted">No song playing</div>}
      </div>
    );
  }
);

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
