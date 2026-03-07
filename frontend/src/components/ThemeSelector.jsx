import STRINGS from '../i18n';
import './ThemeSelector.css';

export default function ThemeSelector({ themes, selectedTheme, onThemeSelect, isLoading }) {
  const isOverallActive = selectedTheme === null || selectedTheme === undefined;

  return (
    <div className="theme-selector">
      <button
        className={`theme-pill${isOverallActive ? ' active' : ''}${isOverallActive && isLoading ? ' loading' : ''}`}
        onClick={() => onThemeSelect(null)}
      >
        {STRINGS.video.overallHighlights}
        {isOverallActive && isLoading && (
          <span className="theme-pill-spinner" />
        )}
      </button>
      {themes.map((theme) => {
        const isActive = selectedTheme === theme;
        return (
          <button
            key={theme}
            className={`theme-pill${isActive ? ' active' : ''}${isActive && isLoading ? ' loading' : ''}`}
            onClick={() => onThemeSelect(theme)}
          >
            {theme}
            {isActive && isLoading && (
              <span className="theme-pill-spinner" />
            )}
          </button>
        );
      })}
    </div>
  );
}
