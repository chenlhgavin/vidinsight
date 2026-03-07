import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import STRINGS from '../i18n';
import VideoHeader from '../components/VideoHeader';
import YouTubePlayer from '../components/YouTubePlayer';
import HighlightsPanel from '../components/HighlightsPanel';
import RightColumnTabs from '../components/RightColumnTabs';
import SummaryViewer from '../components/SummaryViewer';
import TranscriptViewer from '../components/TranscriptViewer';
import VideoChatPanel from '../components/VideoChatPanel';
import StatusBanner from '../components/StatusBanner';
import {
  checkVideoCache,
  analyzeVideo,
  sendVideoChat,
  exploreVideoTheme,
  getVideoConversation,
  listModels,
  translateTexts,
  fetchNotes,
  createNote,
  deleteNote,
} from '../api';
import NotesPanel from '../components/NotesPanel';
import { TranslationBatcher } from '../utils/translationBatcher';
import './AnalyzePage.css';

const STAGES = {
  IDLE: 'idle',
  ANALYZING: 'analyzing',
  DONE: 'done',
  ERROR: 'error',
};

export default function AnalyzePage() {
  const { videoId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const playerRef = useRef(null);

  const urlParam = searchParams.get('url');
  const modelParam = searchParams.get('model');
  const isConversationId = !urlParam && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(videoId);
  const urlFromParams = urlParam || `https://www.youtube.com/watch?v=${videoId}`;

  // Page state
  const [stage, setStage] = useState(STAGES.IDLE);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [error, setError] = useState('');

  // Video data
  const [ytVideoId, setYtVideoId] = useState(isConversationId ? '' : videoId);
  const [videoTitle, setVideoTitle] = useState('');
  const [transcript, setTranscript] = useState([]);
  const [conversationId, setConversationId] = useState(isConversationId ? videoId : '');

  // Analysis data
  const [topics, setTopics] = useState([]);
  const [analysis, setAnalysis] = useState(null);

  // Player state
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [activeTopic, setActiveTopic] = useState(null);
  const [isPlayingAll, setIsPlayingAll] = useState(false);
  const [playAllIndex, setPlayAllIndex] = useState(-1);

  // Right column
  const [activeTab, setActiveTab] = useState('transcript');

  // Translation state
  const [selectedLanguage, setSelectedLanguage] = useState('');
  const [translationCache, setTranslationCache] = useState(() => new Map());
  const batcherRef = useRef(null);

  // Chat state
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState(modelParam || '');
  const [chatMessages, setChatMessages] = useState([]);
  const [isChatStreaming, setIsChatStreaming] = useState(false);
  const [chatStreamingText, setChatStreamingText] = useState('');
  const [chatStatusText, setChatStatusText] = useState('');
  const [suggestedQuestions, setSuggestedQuestions] = useState([]);

  // Notes state
  const [notes, setNotes] = useState([]);
  const [editingNote, setEditingNote] = useState(null);

  // Layout sync
  const leftInnerRef = useRef(null);
  const [rightHeight, setRightHeight] = useState(undefined);

  // Theme exploration
  const [themes, setThemes] = useState([]);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [isExploringTheme, setIsExploringTheme] = useState(false);

  const modelNameById = useMemo(() => models.reduce((acc, model) => {
    acc[model.id] = model.name;
    return acc;
  }, {}), [models]);

  const resolveSelectedModel = useCallback(() => {
    if (selectedModel) return selectedModel;
    const qwen = models.find((model) => model.id === 'qwen');
    return qwen?.id || models[0]?.id || 'qwen';
  }, [models, selectedModel]);

  // Load cached conversation by conversation ID (history entry)
  const loadFromConversation = async (convId) => {
    setStage(STAGES.ANALYZING);
    setLoadingPhase('cache');
    try {
      const conv = await getVideoConversation(convId);
      const meta = conv.video_metadata;
      if (!meta) {
        setStage(STAGES.ERROR);
        setError('Video metadata not found');
        return;
      }
      setYtVideoId(meta.video_id);
      setVideoTitle(meta.video_title || '');
      setDuration(meta.video_duration_seconds || 0);
      setSelectedModel(conv.model || resolveSelectedModel());
      const transcriptData = meta.transcript ? JSON.parse(meta.transcript) : [];
      setTranscript(transcriptData);

      // Extract analysis from messages (stored as video_analysis content_type)
      const analysisMsg = conv.messages?.find((m) => m.content_type === 'video_analysis');
      if (analysisMsg) {
        const analysisData = JSON.parse(analysisMsg.content);
        setAnalysis(analysisData);
        setTopics(analysisData.topics || []);
        setSuggestedQuestions(analysisData.questions || []);
        setThemes(analysisData.themes || []);
      }
      setStage(STAGES.DONE);
    } catch (err) {
      setStage(STAGES.ERROR);
      setError(err.message);
    }
  };

  useEffect(() => {
    listModels()
      .then((data) => {
        setModels(data);
        const qwen = data.find((model) => model.id === 'qwen');
        setSelectedModel((prev) => prev || qwen?.id || data[0]?.id || 'qwen');
      })
      .catch(() => {});
  }, []);

  // Auto-start analysis on mount
  useEffect(() => {
    if (videoId && stage === STAGES.IDLE) {
      if (isConversationId) {
        loadFromConversation(videoId);
      } else {
        startAnalysis();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Sync right column height with left column
  useEffect(() => {
    const el = leftInnerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setRightHeight(entry.contentRect.height);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Auto-advance to next topic in play-all mode
  useEffect(() => {
    if (!isPlayingAll || playAllIndex < 0 || playAllIndex >= topics.length) return;

    const currentTopic = topics[playAllIndex];
    const lastSeg = currentTopic?.segments?.[currentTopic.segments.length - 1];
    if (!lastSeg) return;

    if (currentTime >= lastSeg.end + 1) {
      const nextIndex = playAllIndex + 1;
      if (nextIndex < topics.length) {
        setPlayAllIndex(nextIndex);
        setActiveTopic(topics[nextIndex]);
        const seg = topics[nextIndex]?.segments?.[0];
        if (seg) {
          playerRef.current?.seekTo(seg.start);
          playerRef.current?.play();
        }
      } else {
        setIsPlayingAll(false);
        setPlayAllIndex(-1);
      }
    }
  }, [currentTime, isPlayingAll, playAllIndex, topics]);

  // Fetch notes when conversationId is set
  useEffect(() => {
    if (!conversationId) return;
    fetchNotes(conversationId).then(setNotes).catch(() => {});
  }, [conversationId]);

  // Recreate batcher when selectedLanguage changes
  useEffect(() => {
    batcherRef.current?.destroy();
    if (!selectedLanguage) {
      batcherRef.current = null;
      return;
    }
    batcherRef.current = new TranslationBatcher({
      translateFn: translateTexts,
      onTranslated: (resultMap) => {
        setTranslationCache((prev) => {
          const next = new Map(prev);
          for (const [key, value] of resultMap) {
            next.set(key, value);
          }
          return next;
        });
      },
    });
    return () => {
      batcherRef.current?.destroy();
      batcherRef.current = null;
    };
  }, [selectedLanguage]);

  const handleRequestTranslation = useCallback(
    (texts) => {
      if (!selectedLanguage || !batcherRef.current) return;
      for (const text of texts) {
        batcherRef.current.request(text, selectedLanguage, 'video transcript');
      }
    },
    [selectedLanguage]
  );

  const startAnalysis = async () => {
    setStage(STAGES.ANALYZING);
    setError('');

    try {
      // Check cache first
      setLoadingPhase('cache');
      const model = resolveSelectedModel();
      const cacheResult = await checkVideoCache(urlFromParams, model);
      if (cacheResult.cached) {
        if (cacheResult.video_info?.video_id) setYtVideoId(cacheResult.video_info.video_id);
        setVideoTitle(cacheResult.video_info?.title || '');
        setTranscript(cacheResult.transcript || []);
        setConversationId(cacheResult.conversation_id);
        setAnalysis(cacheResult.analysis);
        setTopics(cacheResult.analysis?.topics || []);
        setSuggestedQuestions(cacheResult.analysis?.questions || []);
        setThemes(cacheResult.analysis?.themes || []);
        setDuration(cacheResult.video_info?.duration || 0);
        if (cacheResult.conversation_id) {
          getVideoConversation(cacheResult.conversation_id)
            .then((conv) => setSelectedModel(conv.model || model))
            .catch(() => setSelectedModel(model));
        }
        setStage(STAGES.DONE);
        return;
      }

      // Run SSE analysis
      await analyzeVideo(urlFromParams, {
        onStatus: (text) => setLoadingPhase(text),
        onVideoInfo: (info) => {
          if (info.video_id) setYtVideoId(info.video_id);
          if (info.title) setVideoTitle(info.title);
          if (info.duration) setDuration(info.duration);
        },
        onTranscript: (entries) => setTranscript(entries || []),
        onAnalysisStart: (data) => {
          setConversationId(data.conversation_id);
          setSelectedModel(model);
        },
        onTopics: (topicsList) => {
          setTopics(topicsList || []);
        },
        onAnalysis: (result, convId) => {
          setAnalysis(result);
          setTopics(result?.topics || []);
          setSuggestedQuestions(result?.questions || []);
          setThemes(result?.themes || []);
          if (convId) setConversationId(convId);
        },
        onCached: (data) => {
          if (data.video_info?.video_id) setYtVideoId(data.video_info.video_id);
          setVideoTitle(data.video_info?.title || '');
          setTranscript(data.transcript || []);
          setConversationId(data.conversation_id);
          setSelectedModel(model);
          setAnalysis(data.analysis);
          setTopics(data.analysis?.topics || []);
          setSuggestedQuestions(data.analysis?.questions || []);
          setThemes(data.analysis?.themes || []);
          setStage(STAGES.DONE);
        },
        onDone: () => {
          setStage(STAGES.DONE);
          setLoadingPhase('');
        },
        onError: (msg) => {
          setStage(STAGES.ERROR);
          setError(msg);
          setLoadingPhase('');
        },
      }, conversationId, model);
    } catch (err) {
      setStage(STAGES.ERROR);
      setError(err.message);
      setLoadingPhase('');
    }
  };

  // Player controls
  const handleSeek = useCallback((seconds) => {
    playerRef.current?.seekTo(seconds);
    playerRef.current?.play();
    setCurrentTime(seconds);
  }, []);

  const handleTopicClick = useCallback((topic) => {
    setActiveTopic(topic);
    setIsPlayingAll(false);
    setPlayAllIndex(-1);
    const seg = topic?.segments?.[0];
    if (seg) {
      handleSeek(seg.start);
    }
  }, [handleSeek]);

  const handlePlayAll = useCallback(() => {
    if (isPlayingAll) {
      setIsPlayingAll(false);
      setPlayAllIndex(-1);
      return;
    }
    if (topics.length > 0) {
      setIsPlayingAll(true);
      setPlayAllIndex(0);
      const firstTopic = topics[0];
      setActiveTopic(firstTopic);
      const seg = firstTopic?.segments?.[0];
      if (seg) {
        handleSeek(seg.start);
      }
    }
  }, [isPlayingAll, topics, handleSeek]);

  const handleTimestampClick = useCallback((seconds) => {
    handleSeek(seconds);
  }, [handleSeek]);

  // Theme selection
  const handleThemeSelect = async (theme) => {
    setSelectedTheme(theme);
    if (!theme || !conversationId) return;

    setIsExploringTheme(true);
    try {
      await exploreVideoTheme(conversationId, theme, {
        onStatus: () => {},
        onText: () => {},
        onExploration: () => {
          setIsExploringTheme(false);
        },
        onDone: () => setIsExploringTheme(false),
        onError: () => setIsExploringTheme(false),
      });
    } catch {
      setIsExploringTheme(false);
    }
  };

  // Notes
  const handleAddNote = useCallback(() => {
    setEditingNote({ source: 'custom' });
  }, []);

  const handleSaveNote = useCallback(async (text, metadata) => {
    if (!conversationId) return;
    try {
      const note = await createNote({
        conversationId,
        source: editingNote?.source || 'custom',
        text,
        sourceId: editingNote?.sourceId,
        metadata,
      });
      setNotes((prev) => [note, ...prev]);
      setEditingNote(null);
    } catch (err) {
      console.error('Failed to save note:', err);
    }
  }, [conversationId, editingNote]);

  const handleDeleteNote = useCallback(async (noteId) => {
    try {
      await deleteNote(noteId);
      setNotes((prev) => prev.filter((n) => n.id !== noteId));
    } catch (err) {
      console.error('Failed to delete note:', err);
    }
  }, []);

  const handleCancelEditing = useCallback(() => {
    setEditingNote(null);
  }, []);

  const handleEnhanceNote = useCallback(async (snippetText) => {
    if (!conversationId) return null;
    const prompt = `Clean up the following transcript snippet. Remove filler words, fix typos, and improve readability while preserving the original meaning. Return ONLY the cleaned text, nothing else:\n\n"${snippetText}"`;
    return new Promise((resolve) => {
      let result = '';
      sendVideoChat(conversationId, prompt, {
        onText: (chunk) => { result += chunk; },
        onDone: () => resolve(result.trim()),
        onError: () => resolve(null),
        onStatus: () => {},
      }).catch(() => resolve(null));
    });
  }, [conversationId]);

  // Chat
  const handleChatSend = async (text) => {
    if (!conversationId || isChatStreaming) return;

    const userMsg = { id: `user-${Date.now()}`, role: 'user', content: text, content_type: 'text' };
    setChatMessages((prev) => [...prev, userMsg]);
    setIsChatStreaming(true);
    setChatStreamingText('');
    setChatStatusText('');

    try {
      let fullText = '';
      await sendVideoChat(conversationId, text, {
        onStatus: (s) => setChatStatusText(s),
        onText: (chunk) => {
          setChatStatusText('');
          fullText += chunk;
          setChatStreamingText(fullText);
        },
        onDone: () => {
          setChatMessages((prev) => [
            ...prev,
            { id: `assistant-${Date.now()}`, role: 'assistant', content: fullText, content_type: 'text' },
          ]);
          setChatStreamingText('');
          setChatStatusText('');
          setIsChatStreaming(false);
        },
        onError: (msg) => {
          setChatMessages((prev) => [
            ...prev,
            { id: `error-${Date.now()}`, role: 'assistant', content: `**${msg}**`, content_type: 'text' },
          ]);
          setChatStreamingText('');
          setChatStatusText('');
          setIsChatStreaming(false);
        },
      });
    } catch (err) {
      setChatMessages((prev) => [
        ...prev,
        { id: `error-${Date.now()}`, role: 'assistant', content: `**${err.message}**`, content_type: 'text' },
      ]);
      setChatStreamingText('');
      setChatStatusText('');
      setIsChatStreaming(false);
    }
  };

  // Text selection actions from transcript
  const handleExplainSelection = (text) => {
    setActiveTab('chat');
    handleChatSend(`Explain: "${text}"`);
  };

  const handleTakeNoteFromSelection = (text) => {
    setActiveTab('notes');
    setEditingNote({ source: 'transcript', selectedText: text });
  };

  const getLoadingText = () => {
    switch (loadingPhase) {
      case 'fetching': return STRINGS.analyze.stageFetching;
      case 'generating': return STRINGS.analyze.stageGenerating;
      case 'processing': return STRINGS.analyze.stageProcessing;
      case 'cache': return STRINGS.analyze.loadingCached;
      default: return STRINGS.analyze.analyzing;
    }
  };

  const isLoading = stage === STAGES.ANALYZING;

  return (
    <div className="analyze-page">
      <VideoHeader onBack={() => navigate('/')} />

      {/* Loading / Error banners */}
      {isLoading && (
        <div className="analyze-status-bar">
          <StatusBanner variant="running" text={getLoadingText()} />
        </div>
      )}
      {stage === STAGES.ERROR && (
        <div className="analyze-status-bar">
          <StatusBanner variant="error" text={error} onRetry={startAnalysis} retryText={STRINGS.analyze.retry} />
        </div>
      )}

      <div className="analyze-content">
        {/* Left column */}
        <div className="analyze-left">
          <div className="analyze-left-inner" ref={leftInnerRef}>
            <YouTubePlayer
              ref={playerRef}
              videoId={ytVideoId}
              onTimeUpdate={setCurrentTime}
              onDurationChange={(d) => { if (d > 0) setDuration(d); }}
            />

            <HighlightsPanel
              topics={topics}
              themes={themes}
              selectedTheme={selectedTheme}
              onThemeSelect={handleThemeSelect}
              isExploringTheme={isExploringTheme}
              activeTopic={activeTopic}
              onTopicClick={handleTopicClick}
              onPlayAll={handlePlayAll}
              isPlayingAll={isPlayingAll}
              currentTime={currentTime}
              duration={duration}
              onSeek={handleSeek}
              videoId={ytVideoId}
            />
          </div>
        </div>

        {/* Right column */}
        <div className="analyze-right">
          <div className="analyze-right-inner" style={rightHeight ? { height: rightHeight } : undefined}>
            {stage === STAGES.DONE ? (
              <RightColumnTabs
                activeTab={activeTab}
                onTabChange={setActiveTab}
                selectedLanguage={selectedLanguage}
                onLanguageChange={setSelectedLanguage}
              >
                {{
                  summary: (
                    <SummaryViewer
                      takeaways={analysis?.takeaways || []}
                      onTimestampClick={handleTimestampClick}
                    />
                  ),
                  chat: (
                    <VideoChatPanel
                      messages={chatMessages}
                      onSend={handleChatSend}
                      isStreaming={isChatStreaming}
                      streamingText={chatStreamingText}
                      statusText={chatStatusText}
                      suggestedQuestions={suggestedQuestions}
                      selectedModel={resolveSelectedModel()}
                      onModelChange={setSelectedModel}
                      modelOptions={models}
                      modelNameById={modelNameById}
                      isModelLocked={Boolean(conversationId)}
                      disabled={!conversationId || isLoading}
                    />
                  ),
                  transcript: (
                    <TranscriptViewer
                      transcript={transcript}
                      currentTime={currentTime}
                      topics={topics}
                      onSeek={handleSeek}
                      selectedLanguage={selectedLanguage}
                      translationCache={translationCache}
                      onRequestTranslation={handleRequestTranslation}
                      videoTitle={videoTitle}
                      onExplainSelection={handleExplainSelection}
                      onTakeNoteSelection={handleTakeNoteFromSelection}
                    />
                  ),
                  notes: (
                    <NotesPanel
                      notes={notes}
                      onDeleteNote={handleDeleteNote}
                      editingNote={editingNote}
                      onSaveNote={handleSaveNote}
                      onCancelEditing={handleCancelEditing}
                      onAddNote={handleAddNote}
                      currentTime={currentTime}
                      onTimestampClick={handleTimestampClick}
                      onEnhance={handleEnhanceNote}
                    />
                  ),
                }}
              </RightColumnTabs>
            ) : (
              <div className="analyze-right-loading">
                <div className="analyze-right-spinner" />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
