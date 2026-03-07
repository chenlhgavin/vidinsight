import STRINGS from '../i18n';
import LanguageSelector from './LanguageSelector';
import './RightColumnTabs.css';

const TABS = [
  { key: 'transcript', labelKey: 'transcript' },
  { key: 'summary', labelKey: 'summary' },
  { key: 'chat', labelKey: 'chat' },
  { key: 'notes', labelKey: 'notes' },
];

export default function RightColumnTabs({
  activeTab,
  onTabChange,
  selectedLanguage,
  onLanguageChange,
  children,
}) {
  return (
    <div className="right-column-tabs">
      <div className="tabs-bar">
        {TABS.map((tab) =>
          tab.key === 'transcript' ? (
            <LanguageSelector
              key={tab.key}
              value={selectedLanguage}
              onChange={onLanguageChange}
              label={STRINGS.tabs[tab.labelKey]}
              isActive={activeTab === tab.key}
              onTabClick={() => onTabChange(tab.key)}
            />
          ) : (
            <button
              key={tab.key}
              type="button"
              className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => onTabChange(tab.key)}
            >
              {STRINGS.tabs[tab.labelKey]}
            </button>
          )
        )}
      </div>
      <div className="tab-content">
        {TABS.map((tab) => (
          <div
            key={tab.key}
            className={`tab-panel ${activeTab !== tab.key ? 'hidden' : ''}`}
          >
            {children[tab.key] || null}
          </div>
        ))}
      </div>
    </div>
  );
}
