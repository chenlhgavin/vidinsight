import { useState, useEffect, useCallback, useRef } from 'react';
import STRINGS from '../i18n';
import './TextSelectionPopover.css';

export default function TextSelectionPopover({ containerRef, onExplain, onTakeNote }) {
  const [popover, setPopover] = useState(null);
  const popoverRef = useRef(null);
  const selectedTextRef = useRef('');

  const handleMouseUp = useCallback(() => {
    // Delay to let the browser finalize the selection
    requestAnimationFrame(() => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text || text.length < 2) {
        setPopover(null);
        return;
      }

      // Ensure selection is inside the container
      const container = containerRef?.current;
      if (!container) return;
      const anchorNode = selection.anchorNode;
      if (!anchorNode || !container.contains(anchorNode)) {
        setPopover(null);
        return;
      }

      selectedTextRef.current = text;

      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      // Position below the selection, centered horizontally
      const left = rect.left + rect.width / 2 - containerRect.left;
      const top = rect.bottom - containerRect.top + 8;

      setPopover({ left, top });
    });
  }, [containerRef]);

  const handleMouseDown = useCallback((e) => {
    // If clicking inside the popover, don't dismiss
    if (popoverRef.current?.contains(e.target)) return;
    setPopover(null);
  }, []);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;

    container.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mousedown', handleMouseDown);

    return () => {
      container.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mousedown', handleMouseDown);
    };
  }, [containerRef, handleMouseUp, handleMouseDown]);

  const handleExplain = useCallback(() => {
    const text = selectedTextRef.current;
    setPopover(null);
    window.getSelection()?.removeAllRanges();
    onExplain?.(text);
  }, [onExplain]);

  const handleTakeNote = useCallback(() => {
    const text = selectedTextRef.current;
    setPopover(null);
    window.getSelection()?.removeAllRanges();
    onTakeNote?.(text);
  }, [onTakeNote]);

  if (!popover) return null;

  return (
    <div
      ref={popoverRef}
      className="text-selection-popover"
      style={{
        left: popover.left,
        top: popover.top,
        transform: 'translateX(-50%)',
      }}
    >
      <button type="button" className="text-selection-popover-btn" onClick={handleExplain}>
        {STRINGS.selection.explain}
      </button>
      <div className="text-selection-popover-divider" />
      <button type="button" className="text-selection-popover-btn" onClick={handleTakeNote}>
        {STRINGS.selection.takeNote}
      </button>
    </div>
  );
}
