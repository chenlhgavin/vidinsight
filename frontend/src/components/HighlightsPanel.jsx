import STRINGS from '../i18n';
import { formatDuration } from '../utils/colorUtils';
import ThemeSelector from './ThemeSelector';
import VideoProgressBar from './VideoProgressBar';
import './HighlightsPanel.css';

export default function HighlightsPanel({
  topics,
  themes,
  selectedTheme,
  onThemeSelect,
  isExploringTheme,
  activeTopic,
  onTopicClick,
  onPlayAll,
  isPlayingAll,
  currentTime,
  duration,
  onSeek,
  videoId,
}) {
  return (
    <div className="highlights-panel">
      {themes && themes.length > 0 && (
        <ThemeSelector
          themes={themes}
          selectedTheme={selectedTheme}
          onThemeSelect={onThemeSelect}
          isLoading={isExploringTheme}
        />
      )}

      <div className="highlights-card">
        <div className={`highlights-body${isExploringTheme ? ' blurred' : ''}`}>
          <VideoProgressBar
            topics={topics}
            currentTime={currentTime}
            duration={duration}
            activeTopic={activeTopic}
            onSeek={onSeek}
            onTopicClick={onTopicClick}
            videoId={videoId}
          />

          <div className="highlights-controls">
            <span className="highlights-time">
              {formatDuration(currentTime || 0)} / {formatDuration(duration || 0)}
            </span>
            {topics && topics.length > 0 && (
              <button
                className={`play-all-btn${isPlayingAll ? ' playing' : ''}`}
                onClick={onPlayAll}
              >
                {isPlayingAll ? (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                    {STRINGS.video.stop}
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    {STRINGS.video.playAll}
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Loading overlay */}
        {isExploringTheme && (
          <div className="highlights-loading-overlay">
            <span className="highlights-spinner" />
            <span className="highlights-loading-text">{STRINGS.video.generatingReels}</span>
          </div>
        )}
      </div>
    </div>
  );
}
