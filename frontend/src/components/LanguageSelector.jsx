import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './LanguageSelector.css';

const LANGUAGES = [
  { value: '', label: 'English', native: 'English', badge: 'Original' },
  { value: 'ja', label: 'Japanese', native: '\u65e5\u672c\u8a9e', badge: 'AI' },
  { value: 'zh-CN', label: 'Simplified Chinese', native: '\u7b80\u4f53\u4e2d\u6587', badge: 'AI' },
  { value: 'es', label: 'Spanish', native: 'Espa\u00f1ol', badge: 'AI' },
];

/**
 * Renders a translate icon + label + chevron as a single tab button.
 * Clicking the chevron area opens a portaled dropdown.
 */
export default function LanguageSelector({ value, onChange, label, isActive, onTabClick }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const dropdownRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: rect.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePos();
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        btnRef.current?.contains(e.target) ||
        dropdownRef.current?.contains(e.target)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hasTranslation = Boolean(value);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`tab-btn tab-btn-translate ${isActive ? 'active' : ''}`}
        onClick={() => onTabClick()}
      >
        {/* Translate icon on left */}
        <svg
          className={`translate-icon ${hasTranslation ? 'highlight' : ''}`}
          width="14" height="14" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
        >
          <path d="M5 8l6 0" />
          <path d="M4 5l0 3" />
          <path d="M8 5l0 1" />
          <path d="M5 11c1.333 1.778 3 3.222 5 4" />
          <path d="M10 8c0 2.667-1.333 5.333-4 8" />
          <path d="M15 5l5 10" />
          <path d="M20 15l-5 0" />
          <path d="M13 15l2-5 2 5" />
        </svg>
        {label}
        {/* Chevron on right */}
        <svg
          className={`lang-chevron ${open ? 'open' : ''}`}
          width="10" height="10" viewBox="0 0 24 24"
          fill="none" stroke="currentColor" strokeWidth="2.5"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && createPortal(
        <div
          ref={dropdownRef}
          className="lang-selector-dropdown"
          style={{ top: pos.top, left: pos.left }}
        >
          {LANGUAGES.map((lang) => (
            <button
              key={lang.value}
              type="button"
              className={`lang-option ${value === lang.value ? 'selected' : ''}`}
              onClick={() => { onChange(lang.value); setOpen(false); }}
            >
              <span className={`lang-radio ${value === lang.value ? 'checked' : ''}`} />
              <span className="lang-option-text">
                <span className="lang-option-label">{lang.native || lang.label}</span>
                {lang.native && (
                  <span className="lang-option-sub">{lang.label}</span>
                )}
              </span>
              <span className={`lang-badge ${lang.badge === 'AI' ? 'ai' : 'orig'}`}>
                {lang.badge}
              </span>
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
