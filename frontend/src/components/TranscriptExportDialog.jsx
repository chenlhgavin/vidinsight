import { useState } from 'react';
import STRINGS from '../i18n';
import './TranscriptExportDialog.css';

const FORMATS = [
  { key: 'txt', label: 'TXT', description: 'Plain text for reading and note apps' },
  { key: 'srt', label: 'SRT', description: 'Timecoded captions for video players' },
  { key: 'csv', label: 'CSV', description: 'Spreadsheet with timestamps and text' },
];

export default function TranscriptExportDialog({ open, onClose, onConfirm }) {
  const [format, setFormat] = useState('txt');
  const [includeTimestamps, setIncludeTimestamps] = useState(true);

  if (!open) return null;

  const isSrt = format === 'srt';

  const handleConfirm = () => {
    onConfirm({ format, includeTimestamps: isSrt ? true : includeTimestamps });
  };

  return (
    <div className="export-dialog-overlay" onClick={onClose}>
      <div className="export-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="export-dialog-header">
          <h3 className="export-dialog-title">{STRINGS.export.title}</h3>
          <button type="button" className="export-dialog-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="export-dialog-body">
          <div className="export-section">
            <label className="export-section-label">{STRINGS.export.formatLabel}</label>
            <div className="export-format-options">
              {FORMATS.map((f) => (
                <label key={f.key} className={`export-format-option ${format === f.key ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="export-format"
                    value={f.key}
                    checked={format === f.key}
                    onChange={() => setFormat(f.key)}
                  />
                  <div className="export-format-info">
                    <span className="export-format-name">{f.label}</span>
                    <span className="export-format-desc">{f.description}</span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="export-section">
            <label className="export-section-label">{STRINGS.export.settingsLabel}</label>
            <label className={`export-toggle-option ${isSrt ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={isSrt ? true : includeTimestamps}
                onChange={(e) => setIncludeTimestamps(e.target.checked)}
                disabled={isSrt}
              />
              <span>{STRINGS.export.includeTimestamps}</span>
              {isSrt && <span className="export-toggle-note">{STRINGS.export.requiredForSrt}</span>}
            </label>
          </div>
        </div>

        <div className="export-dialog-footer">
          <button type="button" className="export-cancel-btn" onClick={onClose}>
            {STRINGS.common.cancel}
          </button>
          <button type="button" className="export-download-btn" onClick={handleConfirm}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            {STRINGS.export.download}
          </button>
        </div>
      </div>
    </div>
  );
}
