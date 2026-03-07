import { useEffect, useRef, useState } from 'react';
import STRINGS from '../i18n';
import './ModelDropdown.css';

export default function ModelDropdown({
  selectedModel,
  onModelChange,
  modelOptions = [],
  modelNameById = {},
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);
  const hasModels = modelOptions.length > 0;
  const label = modelNameById[selectedModel] || selectedModel || STRINGS.video.selectModel;

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="model-dropdown" ref={dropdownRef}>
      <button
        type="button"
        className={`model-dropdown-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        disabled={!hasModels || disabled}
        title={disabled ? STRINGS.video.modelFixed : STRINGS.video.selectModel}
      >
        <span className="model-dropdown-label">{label}</span>
        <svg className="model-dropdown-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.5L6 7.5L9 4.5" />
        </svg>
      </button>
      {open && hasModels && !disabled && (
        <ul className="model-dropdown-menu">
          {modelOptions.map((model) => (
            <li
              key={model.id}
              className={`model-dropdown-item${model.id === selectedModel ? ' active' : ''}`}
              onClick={() => {
                onModelChange(model.id);
                setOpen(false);
              }}
            >
              <span className="model-dropdown-item-name">{model.name}</span>
              {model.id === selectedModel && (
                <svg className="model-dropdown-check" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3.5 8.5L6.5 11.5L12.5 4.5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
