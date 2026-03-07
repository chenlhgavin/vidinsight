import {
  useRef,
  useEffect,
  useState,
  useCallback,
  useImperativeHandle,
  forwardRef,
} from "react";
import "./YouTubePlayer.css";

function loadYouTubeIFrameAPI() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT);
      return;
    }

    if (document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const check = setInterval(() => {
        if (window.YT && window.YT.Player) {
          clearInterval(check);
          resolve(window.YT);
        }
      }, 100);
      return;
    }

    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);

    window.onYouTubeIframeAPIReady = () => {
      resolve(window.YT);
    };
  });
}

const YouTubePlayer = forwardRef(function YouTubePlayer(
  { videoId, onTimeUpdate, onReady, onDurationChange },
  ref
) {
  const playerRef = useRef(null);
  const intervalRef = useRef(null);
  const containerRef = useRef(null);
  const [apiLoaded, setApiLoaded] = useState(false);

  const clearTimeUpdateInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimeUpdateInterval = useCallback(() => {
    clearTimeUpdateInterval();
    intervalRef.current = setInterval(() => {
      if (playerRef.current && typeof playerRef.current.getCurrentTime === "function") {
        const time = playerRef.current.getCurrentTime();
        onTimeUpdate?.(time);
      }
    }, 500);
  }, [clearTimeUpdateInterval, onTimeUpdate]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo(seconds) {
        playerRef.current?.seekTo(seconds, true);
      },
      play() {
        playerRef.current?.playVideo();
      },
      pause() {
        playerRef.current?.pauseVideo();
      },
      getCurrentTime() {
        return playerRef.current?.getCurrentTime() ?? 0;
      },
    }),
    []
  );

  useEffect(() => {
    loadYouTubeIFrameAPI().then(() => setApiLoaded(true));
  }, []);

  useEffect(() => {
    if (!apiLoaded || !videoId) return;

    if (playerRef.current) {
      playerRef.current.loadVideoById(videoId);
      return;
    }

    const containerId = `youtube-player-${videoId}`;

    playerRef.current = new window.YT.Player(containerId, {
      videoId,
      playerVars: {
        autoplay: 0,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: (event) => {
          const duration = event.target.getDuration();
          onDurationChange?.(duration);
          onReady?.(event);
        },
        onStateChange: (event) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            startTimeUpdateInterval();
            const duration = event.target.getDuration();
            onDurationChange?.(duration);
          } else {
            clearTimeUpdateInterval();
          }
        },
      },
    });

    return () => {
      clearTimeUpdateInterval();
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiLoaded, videoId]);

  return (
    <div className="youtube-player-container" ref={containerRef}>
      <div id={`youtube-player-${videoId}`} />
    </div>
  );
});

export default YouTubePlayer;
