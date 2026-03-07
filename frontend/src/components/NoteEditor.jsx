import { useState, useRef, useEffect } from 'react';
import STRINGS from '../i18n';
import './NoteEditor.css';

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatTimeRange(start, end) {
  if (start == null) return null;
  if (end != null && end !== start) return `${formatTime(start)} - ${formatTime(end)}`;
  return formatTime(start);
}

export default function NoteEditor({
  selectedText,
  metadata,
  currentTime,
  onSave,
  onCancel,
  onEnhance,
}) {
  const [text, setText] = useState('');
  const [timestamp, setTimestamp] = useState(metadata?.timestamp ?? null);
  const [snippetText, setSnippetText] = useState(selectedText || '');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isEnhanced, setIsEnhanced] = useState(false);
  const textareaRef = useRef(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  const handleSave = () => {
    const noteText = text.trim() || snippetText.trim();
    if (!noteText) return;
    const noteMeta = { ...(metadata || {}) };
    if (snippetText) noteMeta.selectedText = selectedText || '';
    if (timestamp !== null) noteMeta.timestamp = timestamp;
    if (isEnhanced) noteMeta.enhancedText = snippetText;
    onSave(noteText, Object.keys(noteMeta).length > 0 ? noteMeta : null);
  };

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  };

  const handleCaptureTimestamp = () => {
    setTimestamp(Math.floor(currentTime));
  };

  const handleEnhance = async () => {
    if (!snippetText || !onEnhance || isEnhancing) return;
    setIsEnhancing(true);
    try {
      const enhanced = await onEnhance(snippetText);
      if (enhanced) {
        setSnippetText(enhanced);
        setIsEnhanced(true);
      }
    } finally {
      setIsEnhancing(false);
    }
  };

  const timestampRange = formatTimeRange(
    metadata?.timestampStart ?? timestamp,
    metadata?.timestampEnd
  );

  return (
    <div className="note-editor">
      {/* Selected snippet */}
      {snippetText && (
        <>
          <div className="note-editor-snippet">
            <div className="note-editor-snippet-label">
              {STRINGS.notes.selectedSnippet}
            </div>
            <p className={`note-editor-snippet-text${isEnhanced ? ' note-editor-snippet-enhanced' : ''}`}>
              {snippetText}
            </p>
          </div>
          <div className="note-editor-enhance-row">
            <button
              type="button"
              className={`note-editor-enhance-btn${isEnhancing ? ' enhancing' : ''}`}
              onClick={handleEnhance}
              disabled={isEnhancing || !onEnhance}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6z" />
              </svg>
              {isEnhancing ? STRINGS.notes.enhancing : STRINGS.notes.enhanceWithAi}
            </button>
            <span className="note-editor-enhance-hint">{STRINGS.notes.enhanceHint}</span>
          </div>
        </>
      )}

      {/* Your note */}
      <div className="note-editor-note-section">
        <div className="note-editor-note-label">{STRINGS.notes.yourNote}</div>
        <textarea
          ref={textareaRef}
          className="note-editor-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={STRINGS.notes.placeholder}
        />
      </div>

      {/* Bottom bar */}
      <div className="note-editor-bottom">
        {timestampRange ? (
          <div className="note-editor-timestamp-display">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            Timestamp: {timestampRange}
          </div>
        ) : (
          <button
            type="button"
            className="note-editor-timestamp-btn"
            onClick={handleCaptureTimestamp}
          >
            {STRINGS.notes.captureTimestamp}
          </button>
        )}

        <div className="note-editor-bottom-actions">
          <button type="button" className="note-editor-cancel-btn" onClick={onCancel}>
            {STRINGS.notes.cancel}
          </button>
          <button
            type="button"
            className="note-editor-save-btn"
            onClick={handleSave}
            disabled={!text.trim() && !snippetText.trim()}
            aria-label={STRINGS.notes.save}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
