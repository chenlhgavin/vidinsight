import { useState, useRef, useEffect, useMemo, useCallback, useLayoutEffect } from 'react';
import STRINGS from '../i18n';
import { mergeTranscriptSegments } from '../utils/transcriptMerger';
import { createTranscriptExport, downloadBlob } from '../utils/transcriptExport';
import TranscriptExportDialog from './TranscriptExportDialog';
import TextSelectionPopover from './TextSelectionPopover';
import './TranscriptViewer.css';

function isMergedSegmentInTopic(mergedSeg, topics) {
  if (!topics || topics.length === 0) return false;

  for (const seg of mergedSeg.segments) {
    for (const topic of topics) {
      if (!topic.segments) continue;
      for (const topicSeg of topic.segments) {
        const topicStart = topicSeg.start ?? topicSeg.start_time;
        const topicEnd = topicSeg.end ?? topicSeg.end_time;
        if (topicStart == null || topicEnd == null) continue;
        if (seg.start >= topicStart && seg.start < topicEnd) {
          return true;
        }
      }
    }
  }
  return false;
}

export default function TranscriptViewer({
  transcript,
  currentTime,
  topics,
  onSeek,
  selectedLanguage,
  translationCache,
  onRequestTranslation,
  videoTitle,
  onExplainSelection,
  onTakeNoteSelection,
}) {
  // Export state
  const [isExportOpen, setIsExportOpen] = useState(false);

  // Search state
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentResultIndex, setCurrentResultIndex] = useState(-1);
  const searchInputRef = useRef(null);

  // Scroll state
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpButton, setShowJumpButton] = useState(false);
  const listRef = useRef(null);
  const currentSegmentRef = useRef(null);
  const lastProgrammaticScrollTime = useRef(0);
  const manualModeRef = useRef(false);

  // Merge raw segments into sentences
  const mergedSentences = useMemo(
    () => mergeTranscriptSegments(transcript),
    [transcript]
  );

  // Determine which merged sentence is current based on currentTime
  const currentIndex = useMemo(() => {
    if (!mergedSentences || mergedSentences.length === 0 || currentTime == null) return -1;
    for (let i = mergedSentences.length - 1; i >= 0; i--) {
      const seg = mergedSentences[i];
      if (currentTime >= seg.start) {
        const end = seg.start + (seg.duration || 0);
        if (currentTime < end || i === mergedSentences.length - 1) {
          return i;
        }
      }
    }
    return -1;
  }, [mergedSentences, currentTime]);

  // Build search results against merged sentence text
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const results = [];

    mergedSentences.forEach((sentence, sentenceIndex) => {
      const text = sentence.text.toLowerCase();
      let startPos = 0;
      let matchIndex = text.indexOf(query, startPos);

      while (matchIndex !== -1) {
        results.push({
          segmentIndex: sentenceIndex,
          startIndex: matchIndex,
          endIndex: matchIndex + query.length,
        });
        startPos = matchIndex + 1;
        matchIndex = text.indexOf(query, startPos);
      }
    });

    return results;
  }, [searchQuery, mergedSentences]);

  // Clamp currentResultIndex to valid range
  const safeResultIndex = searchResults.length === 0
    ? -1
    : currentResultIndex >= searchResults.length
      ? 0
      : currentResultIndex;

  // Scroll to element within the list container
  const scrollToElement = useCallback((element, smooth = true) => {
    if (!element || !listRef.current) return;

    const viewport = listRef.current;
    const elementRect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const relativeTop = elementRect.top - viewportRect.top + viewport.scrollTop;
    const scrollPosition = relativeTop - viewportRect.height / 3;

    lastProgrammaticScrollTime.current = Date.now() + 500;

    requestAnimationFrame(() => {
      viewport.scrollTo({
        top: Math.max(0, scrollPosition),
        behavior: smooth ? 'smooth' : 'auto',
      });
    });
  }, []);

  // Search navigation
  const navigateSearch = useCallback(
    (direction) => {
      if (searchResults.length === 0) return;

      let newIndex;
      if (direction === 'next') {
        newIndex = safeResultIndex + 1 >= searchResults.length ? 0 : safeResultIndex + 1;
      } else {
        newIndex = safeResultIndex - 1 < 0 ? searchResults.length - 1 : safeResultIndex - 1;
      }

      setCurrentResultIndex(newIndex);

      const result = searchResults[newIndex];
      const element = listRef.current?.querySelector(
        `[data-segment-index="${result.segmentIndex}"]`
      );
      if (element) {
        scrollToElement(element);
      }
    },
    [searchResults, safeResultIndex, scrollToElement]
  );

  // Auto-focus search input when opened
  useEffect(() => {
    if (isSearchOpen && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isSearchOpen]);

  // Scroll to first search result when results change
  useEffect(() => {
    if (searchResults.length > 0 && safeResultIndex === 0) {
      const result = searchResults[0];
      const element = listRef.current?.querySelector(
        `[data-segment-index="${result.segmentIndex}"]`
      );
      if (element) {
        scrollToElement(element);
      }
    }
  }, [searchResults, scrollToElement, safeResultIndex]);

  // Detect user scroll to switch to manual mode
  const handleUserScroll = useCallback(() => {
    const now = Date.now();
    if (manualModeRef.current) {
      return;
    }
    if (now - lastProgrammaticScrollTime.current > 300) {
      if (autoScroll) {
        setAutoScroll(false);
        setShowJumpButton(true);
      }
    }
  }, [autoScroll]);

  // Add scroll event listener
  useEffect(() => {
    const viewport = listRef.current;
    if (viewport) {
      viewport.addEventListener('scroll', handleUserScroll);
      return () => viewport.removeEventListener('scroll', handleUserScroll);
    }
  }, [handleUserScroll]);

  // Auto-scroll to current segment during playback
  useEffect(() => {
    if (!autoScroll || !currentSegmentRef.current || currentTime <= 0) return;
    if (isSearchOpen && searchQuery.trim()) return;

    const viewport = listRef.current;
    if (!viewport) return;

    const element = currentSegmentRef.current;
    const elementRect = element.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();

    const topThreshold = viewportRect.top + viewportRect.height * 0.25;
    const bottomThreshold = viewportRect.top + viewportRect.height * 0.40;
    const isOutOfView =
      elementRect.bottom < viewportRect.top || elementRect.top > viewportRect.bottom;

    if (isOutOfView || elementRect.top < topThreshold || elementRect.bottom > bottomThreshold) {
      scrollToElement(currentSegmentRef.current, true);
    }
  }, [currentTime, autoScroll, scrollToElement, isSearchOpen, searchQuery]);

  // Jump to current segment
  const jumpToCurrent = useCallback(() => {
    manualModeRef.current = false;
    setAutoScroll(true);
    setShowJumpButton(false);

    if (currentSegmentRef.current) {
      scrollToElement(currentSegmentRef.current);
    }
  }, [scrollToElement]);

  // Toggle auto/manual mode
  const toggleAutoScroll = useCallback(() => {
    if (autoScroll) {
      manualModeRef.current = true;
      setAutoScroll(false);
    } else {
      manualModeRef.current = false;
      setShowJumpButton(false);
      jumpToCurrent();
    }
  }, [autoScroll, jumpToCurrent]);

  // IntersectionObserver for translation pre-fetching
  useLayoutEffect(() => {
    if (!selectedLanguage || !onRequestTranslation || !listRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const textsToTranslate = [];
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.dataset.segmentIndex);
          const seg = mergedSentences[idx];
          if (!seg) continue;
          const cacheKey = `${selectedLanguage}:${seg.text}`;
          if (!translationCache?.has(cacheKey)) {
            textsToTranslate.push(seg.text);
          }
        }
        if (textsToTranslate.length > 0) {
          onRequestTranslation(textsToTranslate);
        }
      },
      { root: listRef.current, rootMargin: '200px' }
    );

    const elements = listRef.current.querySelectorAll('[data-segment-index]');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [selectedLanguage, mergedSentences, translationCache, onRequestTranslation]);

  // Export
  const handleExport = useCallback(
    ({ format, includeTimestamps }) => {
      const { blob, filename } = createTranscriptExport(mergedSentences, {
        format,
        includeTimestamps,
        videoTitle,
      });
      downloadBlob(blob, filename);
      setIsExportOpen(false);
    },
    [mergedSentences, videoTitle]
  );

  // Close search
  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
    setSearchQuery('');
    setCurrentResultIndex(-1);
  }, []);

  // Handle sentence click (click-to-seek, ignore text selection drags)
  const handleSegmentClick = useCallback(
    (mergedSeg) => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) {
        return;
      }
      onSeek?.(mergedSeg.start);
    },
    [onSeek]
  );

  // Render highlighted text with search matches
  const renderSegmentText = useCallback(
    (sentence, sentenceIndex) => {
      const sentenceSearchResults = searchResults.filter((r) => r.segmentIndex === sentenceIndex);

      if (sentenceSearchResults.length > 0) {
        const text = sentence.text;
        const parts = [];
        let lastIndex = 0;

        sentenceSearchResults.forEach((match) => {
          if (match.startIndex > lastIndex) {
            parts.push({ text: text.substring(lastIndex, match.startIndex), type: 'normal' });
          }
          const isCurrentMatch = searchResults[safeResultIndex] === match;
          parts.push({
            text: text.substring(match.startIndex, match.endIndex),
            type: isCurrentMatch ? 'current-match' : 'match',
          });
          lastIndex = match.endIndex;
        });

        if (lastIndex < text.length) {
          parts.push({ text: text.substring(lastIndex), type: 'normal' });
        }

        return parts.map((part, i) => (
          <span
            key={i}
            className={
              part.type === 'current-match'
                ? 'search-match search-match-current'
                : part.type === 'match'
                  ? 'search-match'
                  : undefined
            }
          >
            {part.text}
          </span>
        ));
      }

      return sentence.text;
    },
    [searchResults, safeResultIndex]
  );

  if (!transcript || transcript.length === 0) {
    return (
      <div className="transcript-viewer transcript-viewer-empty">
        <p className="transcript-empty-text">No transcript available.</p>
      </div>
    );
  }

  return (
    <div className="transcript-viewer">
      {/* Header bar */}
      <div className="transcript-header">
        {isSearchOpen ? (
          <div className="transcript-search-bar">
            <svg
              className="transcript-search-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={searchInputRef}
              type="text"
              className="transcript-search-input"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentResultIndex(0); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigateSearch('next');
                if (e.key === 'Escape') closeSearch();
              }}
              placeholder={STRINGS.video.searchPlaceholder}
            />
            <div className="transcript-search-nav">
              <span className="transcript-search-counter">
                {searchResults.length > 0
                  ? `${safeResultIndex + 1}/${searchResults.length}`
                  : '0/0'}
              </span>
              <button
                type="button"
                className="transcript-nav-btn"
                onClick={() => navigateSearch('prev')}
                disabled={searchResults.length === 0}
                aria-label="Previous result"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
              </button>
              <button
                type="button"
                className="transcript-nav-btn"
                onClick={() => navigateSearch('next')}
                disabled={searchResults.length === 0}
                aria-label="Next result"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              <button
                type="button"
                className="transcript-nav-btn transcript-close-btn"
                onClick={closeSearch}
                aria-label="Close search"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          </div>
        ) : (
          <div className="transcript-header-controls">
            <button
              type="button"
              className="transcript-icon-btn"
              onClick={() => setIsExportOpen(true)}
              title={STRINGS.export.title}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              type="button"
              className="transcript-icon-btn"
              onClick={() => setIsSearchOpen(true)}
              title={STRINGS.video.searchTranscript}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </button>
            <button
              type="button"
              className={`transcript-scroll-toggle ${autoScroll ? 'active' : ''}`}
              onClick={toggleAutoScroll}
            >
              {autoScroll ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  {STRINGS.video.auto}
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                  {STRINGS.video.manual}
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Jump to Current floating button */}
      {showJumpButton && currentTime > 0 && (
        <div className="transcript-jump-wrap">
          <button type="button" className="transcript-jump-btn" onClick={jumpToCurrent}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="6 9 12 15 18 9" />
            </svg>
            {STRINGS.video.jumpToCurrent}
          </button>
        </div>
      )}

      {/* Transcript list */}
      <div className="transcript-list" ref={listRef}>
        <TextSelectionPopover
          containerRef={listRef}
          onExplain={onExplainSelection}
          onTakeNote={onTakeNoteSelection}
        />
        <div className="transcript-sentences">
          {mergedSentences.map((seg, index) => {
            const isCurrent = index === currentIndex;
            const inTopic = isMergedSegmentInTopic(seg, topics);

            return (
              <div
                key={index}
                data-segment-index={index}
                ref={isCurrent ? currentSegmentRef : null}
                className={[
                  'transcript-sentence',
                  isCurrent ? 'current' : '',
                  inTopic ? 'topic-highlight' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={() => handleSegmentClick(seg)}
              >
                <div>{renderSegmentText(seg, index)}</div>
                {selectedLanguage && (
                  <div className="transcript-translation">
                    {translationCache?.get(`${selectedLanguage}:${seg.text}`) || STRINGS.video.translating}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <TranscriptExportDialog
        open={isExportOpen}
        onClose={() => setIsExportOpen(false)}
        onConfirm={handleExport}
      />
    </div>
  );
}
