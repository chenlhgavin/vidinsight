'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { YouTubePlayer } from '@/components/youtube-player';
import { VideoProgressBar } from '@/components/video-progress-bar';
import { HighlightsPanel } from '@/components/highlights-panel';
import { RightColumnTabs } from '@/components/right-column-tabs';
import { VideoHeader } from '@/components/video-header';
import { LoadingTips } from '@/components/loading-tips';
import { LoadingContext } from '@/components/loading-context';
import type { SelectionActionPayload } from '@/components/selection-actions';
import { AuthModal, type AuthModalTrigger } from '@/components/auth-modal';
import type { PlaybackFocus } from '@/lib/playback-queue';
import { rememberPendingVideo, useAuth } from '@/contexts/auth-context';
import { AbortManager, backgroundOperation } from '@/lib/promise-utils';
import { csrfFetch } from '@/lib/csrf-client';
import { useTranslation } from '@/lib/hooks/use-translation';
import { useTranslationPreference } from '@/lib/hooks/use-translation-preference';
import {
  extractThemes,
  findCandidatesForTheme,
  hydrateTopicsWithTranscript,
  topicQuoteKey,
} from '@/lib/topic-utils';
import { buildVideoSlug } from '@/lib/utils';
import type {
  ChatMessage,
  Citation,
  Note,
  PlaybackCommand,
  QuickPreview,
  SummaryTakeaway,
  TopQuote,
  Topic,
  TopicCandidate,
  TranscriptSegment,
  TranslationScenario,
  VideoInfo,
} from '@/lib/types';

type PageState = 'IDLE' | 'ANALYZING_NEW' | 'LOADING_CACHED' | 'READY' | 'ERROR';
type Stage = 'fetching' | 'understanding' | 'generating' | 'processing';

interface CacheCheck {
  cached: boolean;
  video: { id: string; youtube_id: string; title?: string | null; slug?: string | null } | null;
  isFavorite?: boolean;
  slug?: string | null;
}

interface TopicsResult {
  topics: Topic[];
  topicCandidates?: TopicCandidate[];
  modelUsed?: string;
  modeUsed?: 'smart';
  generationStrategy?: 'single-pass' | 'local-fallback';
  videoDbId?: string;
  slug?: string | null;
}

interface SummaryResult {
  takeaways: SummaryTakeaway[];
}

interface SuggestedQuestionsResult {
  questions: string[];
}

interface QuickPreviewResult {
  preview: unknown;
}

interface FullAnalysis {
  id: string;
  youtube_id: string;
  slug?: string | null;
  title: string;
  author: string;
  duration: number | null;
  thumbnail_url: string | null;
  transcript: TranscriptSegment[] | null;
  topics: Topic[] | null;
  topic_candidates: TopicCandidate[] | null;
  summary: { takeaways: SummaryTakeaway[] } | null;
  top_quotes: { quotes: TopQuote[] } | null;
  suggested_questions: { questions: string[] } | null;
  quick_preview?: unknown;
  source_language: string | null;
  available_languages: string[] | null;
  model_used: string | null;
}

async function parseJsonResponse<T>(response: Response, action: string): Promise<T> {
  const data = (await response.json().catch(() => null)) as ({ error?: string } & T) | null;
  if (!response.ok) throw new Error(data?.error || `${action}_failed`);
  if (data && typeof data.error === 'string' && data.error) throw new Error(data.error);
  if (!data) throw new Error(`${action}_empty_response`);
  return data as T;
}

class AuthLimitError extends Error {
  constructor(public readonly redirectMessage?: string) {
    super('auth_required');
    this.name = 'AuthLimitError';
  }
}

async function maybeHandleAuthLimit(response: Response): Promise<{ handled: boolean; message?: string }> {
  if (response.status !== 401) return { handled: false };
  const body = (await response.clone().json().catch(() => null)) as
    | { redirectTo?: string; message?: string }
    | null;
  if (body?.redirectTo === '/?auth=limit') {
    return { handled: true, message: body.message };
  }
  return { handled: false };
}

async function postJson<T>(url: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await csrfFetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const limit = await maybeHandleAuthLimit(response);
  if (limit.handled) throw new AuthLimitError(limit.message);
  return parseJsonResponse<T>(response, url.split('/').pop() || 'request');
}

function requireTopics(result: TopicsResult): TopicsResult {
  if (!Array.isArray(result.topics) || result.topics.length === 0) {
    throw new Error('No highlights were returned by the model.');
  }
  return { ...result, topics: result.topics, topicCandidates: result.topicCandidates ?? [] };
}

function normalizeQuickPreview(value: unknown, depth = 0): QuickPreview | null {
  if (depth > 2) return null;
  if (typeof value === 'string') {
    const summary = value.trim();
    return summary ? { title: 'Quick preview', summary, glance: [] } : null;
  }
  if (!value || typeof value !== 'object') return null;
  const data = value as {
    preview?: unknown;
    overview?: unknown;
    title?: unknown;
    summary?: unknown;
    glance?: unknown;
  };
  if ('preview' in data) {
    const nested = normalizeQuickPreview(data.preview, depth + 1);
    if (nested) return nested;
  }
  if (typeof data.overview === 'string') {
    return normalizeQuickPreview(data.overview, depth + 1);
  }

  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  if (Array.isArray(data.glance)) {
    const bullets = data.glance
      .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, 5);
    if (title || summary || bullets.length) {
      return {
        title: title || 'Quick preview',
        summary: summary || bullets.join(' ') || title,
        glance: bullets,
      };
    }
  }
  if (title || summary) {
    return {
      title: title || 'Quick preview',
      summary: summary || title,
      glance: [],
    };
  }
  return null;
}

function AnalyzePageInner() {
  const params = useParams<{ videoId: string }>();
  const videoId = params.videoId;
  const abortMgrRef = useRef(new AbortManager());
  const { user } = useAuth();
  const { target: preferredTargetLanguage } = useTranslationPreference();
  const { selectedLanguage, handleRequestTranslation, handleLanguageChange } = useTranslation();

  const [state, setState] = useState<PageState>('IDLE');
  const [stage, setStage] = useState<Stage>('fetching');
  const [error, setError] = useState<string | null>(null);

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [baseTopics, setBaseTopics] = useState<Topic[]>([]);
  const [candidates, setCandidates] = useState<TopicCandidate[]>([]);
  const [takeaways, setTakeaways] = useState<SummaryTakeaway[]>([]);
  const [topQuotes, setTopQuotes] = useState<TopQuote[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [quickPreview, setQuickPreview] = useState<QuickPreview | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [videoDbId, setVideoDbId] = useState<string | null>(null);
  const [shareSlug, setShareSlug] = useState<string | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const [highlightsLoading, setHighlightsLoading] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [citationHighlight, setCitationHighlight] = useState<Citation | null>(null);
  const [queuePlaying, setQueuePlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [command, setCommand] = useState<PlaybackCommand | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [pendingNoteDraft, setPendingNoteDraft] = useState<SelectionActionPayload | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTrigger, setAuthModalTrigger] = useState<AuthModalTrigger>('manual');
  const router = useRouter();
  const hasRedirectedForLimit = useRef(false);

  const redirectToAuthForLimit = useCallback(
    (message?: string) => {
      if (hasRedirectedForLimit.current) return;
      hasRedirectedForLimit.current = true;
      rememberPendingVideo(videoId);
      const msg =
        message?.trim() || "You've used your free preview. Sign in to keep going.";
      try {
        sessionStorage.setItem('vidinsight:limitRedirectMessage', msg);
      } catch {
        // ignore
      }
      router.push('/?auth=limit');
    },
    [router, videoId],
  );

  const checkGenerationLimit = useCallback(async (): Promise<boolean> => {
    if (user) return true;
    try {
      const r = await fetch('/api/check-limit');
      const data = (await r.json()) as { usage?: { totalRemaining?: number | null } } | null;
      const remaining = data?.usage?.totalRemaining;
      if (typeof remaining === 'number' && remaining <= 0) {
        redirectToAuthForLimit();
        return false;
      }
      return true;
    } catch {
      return true;
    }
  }, [redirectToAuthForLimit, user]);

  const dispatch = useCallback((cmd: PlaybackCommand) => {
    setCommand({ ...cmd });
  }, []);

  const clearCommand = useCallback(() => {
    setCommand(null);
  }, []);

  const translateWithContext = useCallback(
    (
      text: string,
      cacheKey: string,
      scenario?: TranslationScenario,
      targetLanguage?: string,
    ) => handleRequestTranslation(text, cacheKey, scenario, videoInfo, targetLanguage),
    [handleRequestTranslation, videoInfo],
  );

  useEffect(() => {
    const mgr = abortMgrRef.current;
    return () => {
      mgr.cleanup();
    };
  }, []);

  useEffect(() => {
    if (!shareSlug || typeof window === 'undefined') return;
    if (!window.location.pathname.startsWith('/analyze/')) return;
    window.history.replaceState(window.history.state, '', `/v/${shareSlug}${window.location.search}`);
  }, [shareSlug]);

  useEffect(() => {
    if (!user || !videoId) return;
    let cancelled = false;
    void csrfFetch(`/api/verify-video-link?youtubeId=${encodeURIComponent(videoId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { linked?: boolean; isFavorite?: boolean; videoDbId?: string } | null) => {
        if (cancelled || !data) return;
        if (data.videoDbId) setVideoDbId(data.videoDbId);
        setIsFavorite(Boolean(data.isFavorite));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, videoId]);

  // Reset state when videoId changes (must run during render, not in effect)
  const [prevVideoId, setPrevVideoId] = useState(videoId);
  if (prevVideoId !== videoId) {
    setPrevVideoId(videoId);
    setState('IDLE');
    setError(null);
    setHighlightsLoading(false);
    setSelectedTopic(null);
    setCitationHighlight(null);
    setQueuePlaying(false);
    setCommand(null);
    setVideoInfo(null);
    setTranscript([]);
    setTopics([]);
    setBaseTopics([]);
    setCandidates([]);
    setTakeaways([]);
    setTopQuotes([]);
    setQuestions([]);
    setQuickPreview(null);
    setSummaryLoading(false);
    setVideoDbId(null);
    setShareSlug(null);
    setIsFavorite(false);
    setNotes([]);
  }

  // Main load effect
  useEffect(() => {
    if (!videoId) return;
    const mgr = abortMgrRef.current;
    mgr.cleanup();

    const run = async () => {
      try {
        setStage('fetching');
        const cacheRes = await csrfFetch('/api/check-video-cache', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ youtubeId: videoId }),
        });
        const cache = await parseJsonResponse<CacheCheck>(cacheRes, 'check_cache');

        if (cache.cached && cache.video) {
          setIsFavorite(Boolean(cache.isFavorite));
          setShareSlug(
            cache.slug ??
              cache.video.slug ??
              buildVideoSlug(cache.video.title ?? null, cache.video.youtube_id),
          );
          setState('LOADING_CACHED');
          await loadCached(cache.video.youtube_id);
          return;
        }

        if (!(await checkGenerationLimit())) return;

        setState('ANALYZING_NEW');
        await analyzeFresh();
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        if (err instanceof AuthLimitError) {
          redirectToAuthForLimit(err.redirectMessage);
          return;
        }
        console.error(err);
        setError((err as Error).message);
        setState('ERROR');
      }
    };

    const loadCached = async (youtubeId: string) => {
      const r = await fetch(`/api/video-analysis?youtubeId=${youtubeId}`);
      const { analysis } = await parseJsonResponse<{ analysis: FullAnalysis }>(r, 'load_analysis');
      const cachedVideoInfo = {
        videoId: analysis.youtube_id,
        title: analysis.title ?? `YouTube ${analysis.youtube_id}`,
        author: analysis.author ?? '',
        thumbnail: analysis.thumbnail_url ?? '',
        duration: analysis.duration,
        language: analysis.source_language ?? undefined,
        availableLanguages: analysis.available_languages ?? undefined,
      };
      const cachedTranscript = analysis.transcript ?? [];
      setVideoInfo(cachedVideoInfo);
      setTranscript(cachedTranscript);
      const ts = hydrateTopicsWithTranscript(analysis.topics ?? [], cachedTranscript);
      setBaseTopics(ts);
      setTopics(ts);
      setCandidates(analysis.topic_candidates ?? []);
      setTakeaways(analysis.summary?.takeaways ?? []);
      setTopQuotes(analysis.top_quotes?.quotes ?? []);
      setQuestions(analysis.suggested_questions?.questions ?? []);
      setQuickPreview(normalizeQuickPreview(analysis.quick_preview));
      setSummaryLoading(false);
      setVideoDbId(analysis.id);
      setShareSlug(
        analysis.slug ?? buildVideoSlug(analysis.title, analysis.youtube_id),
      );
      setState('READY');

      if (!ts.length && cachedTranscript.length) {
        void backgroundOperation('regenerate-cached-topics', async () => {
          setHighlightsLoading(true);
          try {
            const topicsCtl = mgr.createController('cached-topics');
            const generated = requireTopics(
              await postJson<TopicsResult>(
                '/api/video-analysis',
                {
                  videoId: youtubeId,
                  transcript: cachedTranscript,
                  videoInfo: cachedVideoInfo,
                  includeCandidatePool: true,
                  forceRegenerate: true,
                },
                topicsCtl.signal,
              ),
            );

            const hydratedTopics = hydrateTopicsWithTranscript(generated.topics, cachedTranscript);
            setBaseTopics(hydratedTopics);
            setTopics(hydratedTopics);
            setCandidates(generated.topicCandidates ?? []);
            if (generated.videoDbId) setVideoDbId(generated.videoDbId);
            if (generated.slug) setShareSlug(generated.slug);

            await postJson('/api/update-video-analysis', {
              videoId: youtubeId,
              topics: hydratedTopics,
              topic_candidates: generated.topicCandidates ?? [],
              model_used: generated.modelUsed ?? 'minimax:default',
            });
            toast.success('Highlights generated');
          } catch (err) {
            if ((err as Error).name !== 'AbortError') {
              toast.error(`Highlights failed: ${(err as Error).message}`);
            }
            throw err;
          } finally {
            setHighlightsLoading(false);
          }
        });
      }

      if (!normalizeQuickPreview(analysis.quick_preview) && cachedTranscript.length) {
        void backgroundOperation('generate-cached-preview', async () => {
          const ctl = mgr.createController('cached-preview');
          const data = await postJson<QuickPreviewResult>(
            '/api/quick-preview',
            { transcript: cachedTranscript, videoInfo: cachedVideoInfo },
            ctl.signal,
          );
          const preview = normalizeQuickPreview(data.preview);
          if (preview) {
            setQuickPreview(preview);
            await postJson('/api/update-video-analysis', {
              videoId: youtubeId,
              quick_preview: { preview },
            });
          }
          return preview;
        });
      }
    };

    const analyzeFresh = async () => {
      const transcriptCtl = mgr.createController('transcript');
      const infoCtl = mgr.createController('video-info');

      const [tResp, vResp] = await Promise.all([
        csrfFetch('/api/transcript', {
          method: 'POST',
          signal: transcriptCtl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId }),
        }),
        fetch(`/api/video-info?videoId=${videoId}`, { signal: infoCtl.signal }),
      ]);

      if (!tResp.ok) throw new Error('transcript_failed');
      const tData = (await tResp.json()) as {
        transcript: TranscriptSegment[];
        language?: string;
        availableLanguages?: string[];
      };
      const vData = vResp.ok
        ? ((await vResp.json()) as VideoInfo)
        : ({
            videoId,
            title: `YouTube ${videoId}`,
            author: '',
            thumbnail: '',
            duration: null,
          } as VideoInfo);
      const hydratedVideoInfo = {
        ...vData,
        videoId,
        language: tData.language,
        availableLanguages: tData.availableLanguages,
      };

      setTranscript(tData.transcript);
      setVideoInfo(hydratedVideoInfo);

      setStage('understanding');
      const baseBody = {
        transcript: tData.transcript,
        videoInfo: hydratedVideoInfo,
      };

      const baseSavePromise = postJson<{ video: { id: string; slug?: string | null }; slug?: string | null }>(
        '/api/save-analysis',
        {
          videoId,
          title: hydratedVideoInfo.title,
          author: hydratedVideoInfo.author,
          duration: hydratedVideoInfo.duration ?? null,
          thumbnailUrl: hydratedVideoInfo.thumbnail,
          transcript: tData.transcript,
          sourceLanguage: tData.language,
          availableLanguages: tData.availableLanguages,
        },
      )
        .then((data) => {
          setVideoDbId(data.video.id);
          setShareSlug(data.slug ?? data.video.slug ?? buildVideoSlug(hydratedVideoInfo.title, videoId));
          return data;
        })
        .catch((err) => {
          console.error('[base-save]', err);
          return null;
        });

      const previewCtl = mgr.createController('quick-preview');
      void backgroundOperation('quick-preview', async () => {
        const data = await postJson<QuickPreviewResult>(
          '/api/quick-preview',
          {
            ...baseBody,
            videoTitle: hydratedVideoInfo.title,
            videoDescription: hydratedVideoInfo.description,
            channelName: hydratedVideoInfo.author,
            tags: hydratedVideoInfo.tags,
            language: hydratedVideoInfo.language,
          },
          previewCtl.signal,
        );
        const preview = normalizeQuickPreview(data.preview);
        if (preview) {
          setQuickPreview(preview);
          await baseSavePromise;
          await postJson('/api/update-video-analysis', {
            videoId,
            quick_preview: { preview },
          });
        }
        return preview;
      });

      const summaryCtl = mgr.createController('summary');
      setSummaryLoading(true);
      void backgroundOperation(
        'generate-summary',
        async () => {
          const summary = await postJson<SummaryResult>('/api/generate-summary', baseBody, summaryCtl.signal);
          if (summary.takeaways?.length) {
            setTakeaways(summary.takeaways);
            await baseSavePromise;
            await postJson('/api/update-video-analysis', {
              videoId,
              summary: { takeaways: summary.takeaways },
            });
          }
          return summary;
        },
        (err) => {
          console.error('[generate-summary]', err);
        },
      ).finally(() => {
        setSummaryLoading(false);
      });

      setStage('generating');
      setHighlightsLoading(true);
      const topicsCtl = mgr.createController('topics');
      let generatedTopics: TopicsResult;
      try {
        generatedTopics = requireTopics(
          await postJson<TopicsResult>(
            '/api/video-analysis',
            {
              videoId,
              ...baseBody,
              includeCandidatePool: true,
              forceRegenerate: false,
            },
            topicsCtl.signal,
          ),
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : 'unknown error';
        toast.error(`Highlights failed: ${message}`);
        throw err;
      } finally {
        setHighlightsLoading(false);
      }

      const ts = hydrateTopicsWithTranscript(generatedTopics.topics, tData.transcript);
      const cands = generatedTopics.topicCandidates ?? [];
      setBaseTopics(ts);
      setTopics(ts);
      setCandidates(cands);
      if (generatedTopics.videoDbId) setVideoDbId(generatedTopics.videoDbId);
      if (generatedTopics.slug) setShareSlug(generatedTopics.slug);

      setStage('processing');
      setState('READY');

      void backgroundOperation('generate-questions', async () => {
        const questionsCtl = mgr.createController('questions');
        const data = await postJson<SuggestedQuestionsResult>(
          '/api/suggested-questions',
          { ...baseBody, topics: ts, count: 5 },
          questionsCtl.signal,
        );
        if (data.questions?.length) {
          setQuestions(data.questions);
          await postJson('/api/update-video-analysis', {
            videoId,
            suggested_questions: { questions: data.questions },
          });
        }
        return data;
      });
    };

    void run();
  }, [videoId, redirectToAuthForLimit, checkGenerationLimit]);

  const themes = useMemo(() => extractThemes(candidates), [candidates]);

  const handleSelectTheme = useCallback(
    async (theme: string | null) => {
      setSelectedTheme(theme);
      if (!theme) {
        setTopics(baseTopics);
        setSelectedTopic(null);
        setCitationHighlight(null);
        setQueuePlaying(false);
        return;
      }
      const matched = findCandidatesForTheme(theme, candidates);
      if (!matched.length) {
        toast.message('No candidates match this theme yet.');
        return;
      }
      if (!(await checkGenerationLimit())) return;
      setThemeLoading(true);
      try {
        const data = requireTopics(
          await postJson<TopicsResult>('/api/generate-topics', {
            transcript,
            videoInfo,
            includeCandidatePool: false,
            excludeTopicKeys: baseTopics
              .map((topic) => topicQuoteKey(topic))
              .filter((key): key is string => Boolean(key)),
          }),
        );
        setTopics(hydrateTopicsWithTranscript(data.topics, transcript));
        setSelectedTopic(null);
        setCitationHighlight(null);
        setQueuePlaying(false);
      } catch (err) {
        if (err instanceof AuthLimitError) {
          redirectToAuthForLimit(err.redirectMessage);
          return;
        }
        toast.error(`Highlights failed: ${(err as Error).message}`);
      } finally {
        setThemeLoading(false);
      }
    },
    [baseTopics, candidates, checkGenerationLimit, redirectToAuthForLimit, transcript, videoInfo],
  );

  const handlePlayTopic = useCallback(
    (topic: Topic) => {
      setSelectedTopic(topic);
      setCitationHighlight(null);
      setQueuePlaying(true);
      dispatch({ type: 'PLAY_TOPIC', topic, autoPlay: true });
    },
    [dispatch],
  );

  const handlePlayAll = useCallback(() => {
    if (!topics.length) return;
    setSelectedTopic(null);
    setCitationHighlight(null);
    setQueuePlaying(true);
    dispatch({ type: 'PLAY_ALL', topics, autoPlay: true });
  }, [topics, dispatch]);

  const handleStopPlayback = useCallback(() => {
    setSelectedTopic(null);
    setCitationHighlight(null);
    setQueuePlaying(false);
    dispatch({ type: 'PAUSE' });
  }, [dispatch]);

  const handlePlaybackEnd = useCallback(() => {
    setQueuePlaying(false);
  }, []);

  const handlePlaybackFocusChange = useCallback((focus: PlaybackFocus) => {
    if (focus.kind === 'topic') {
      setSelectedTopic(focus.topic);
      setCitationHighlight(null);
      setQueuePlaying(true);
      return;
    }
    if (focus.kind === 'citation') {
      setSelectedTopic(null);
      setCitationHighlight(focus.citation);
      setQueuePlaying(true);
      return;
    }
    if (focus.kind === 'none') {
      setSelectedTopic(null);
      setCitationHighlight(null);
      setQueuePlaying(false);
    }
  }, []);

  const handleSeek = useCallback(
    (t: number) => {
      setSelectedTopic(null);
      setCitationHighlight(null);
      setQueuePlaying(false);
      dispatch({ type: 'SEEK', time: t, autoPlay: true });
    },
    [dispatch],
  );

  const handlePlayCitation = useCallback(
    (citation: Citation) => {
      setSelectedTopic(null);
      setCitationHighlight(citation);
      setQueuePlaying(true);
      dispatch({
        type: 'PLAY_SEGMENT',
        segment: {
          start: citation.start,
          end: citation.end,
          text: citation.text,
          startSegmentIdx: citation.startSegmentIdx,
          endSegmentIdx: citation.endSegmentIdx,
          startCharOffset: citation.startCharOffset,
          endCharOffset: citation.endCharOffset,
        },
        citation,
        autoPlay: true,
      });
    },
    [dispatch],
  );

  const handlePlayCitations = useCallback(
    (citations: Citation[]) => {
      if (!citations.length) return;
      setSelectedTopic(null);
      setCitationHighlight(citations[0]);
      setQueuePlaying(true);
      dispatch({ type: 'PLAY_CITATIONS', citations, autoPlay: true });
    },
    [dispatch],
  );

  const handleSelectionNoteDraft = useCallback((payload: SelectionActionPayload) => {
    setPendingNoteDraft(payload);
  }, []);

  const handleRequestSignIn = useCallback(
    (trigger: AuthModalTrigger = 'manual') => {
      rememberPendingVideo(videoId);
      setAuthModalTrigger(trigger);
      setAuthModalOpen(true);
    },
    [videoId],
  );

  const handleToggleFavorite = useCallback(async () => {
    if (!user) {
      handleRequestSignIn('save-video');
      return;
    }

    const next = !isFavorite;
    try {
      const r = await csrfFetch('/api/toggle-favorite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId, isFavorite: next }),
      });
      const data = (await r.json().catch(() => null)) as { isFavorite?: boolean; favorite?: boolean; error?: string } | null;
      if (!r.ok) throw new Error(data?.error || 'favorite_failed');
      setIsFavorite(Boolean(data?.isFavorite ?? data?.favorite));
      toast.success(next ? 'Saved to your library' : 'Removed from favorites');
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [handleRequestSignIn, isFavorite, user, videoId]);

  const handleSaveTakeawayNote = useCallback(
    async (t: SummaryTakeaway) => {
      if (!user) {
        handleRequestSignIn('save-note');
        return;
      }
      if (!videoDbId) {
        toast.error('Video not yet saved. Try again in a moment.');
        return;
      }
      try {
        const note = await (await import('@/lib/notes-client')).saveNote({
          youtubeId: videoId,
          videoId: videoDbId,
          source: 'takeaways',
          text: t.insight,
          metadata: { takeaway: { label: t.label } },
        });
        setNotes((prev) => [note, ...prev]);
        toast.success('Note saved');
      } catch (err) {
        toast.error((err as Error).message);
      }
    },
    [handleRequestSignIn, user, videoDbId, videoId],
  );

  if (state !== 'READY' && state !== 'ERROR') {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10">
        <LoadingContext videoId={videoId} videoInfo={videoInfo} preview={quickPreview} />
        <LoadingTips stage={stage} />
      </div>
    );
  }

  if (state === 'ERROR') {
    return (
      <div className="mx-auto max-w-2xl px-5 py-24 text-center">
        <p className="font-display text-3xl text-foreground">Couldn&apos;t analyze that video.</p>
        <p className="mt-3 text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-[1840px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 2xl:px-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-96 bg-[radial-gradient(ellipse_60%_60%_at_50%_0%,hsl(var(--accent-lime)/0.06),transparent_70%)]"
      />
      <VideoHeader
        videoInfo={videoInfo}
        isFavorite={isFavorite}
        onToggleFavorite={handleToggleFavorite}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(360px,0.85fr)] xl:grid-cols-[minmax(0,1.9fr)_minmax(420px,0.85fr)] 2xl:grid-cols-[minmax(0,2.05fr)_minmax(500px,0.85fr)]">
        <div className="min-w-0 space-y-3">
          <YouTubePlayer
            videoId={videoId}
            command={command}
            onTime={setCurrentTime}
            onSegmentEnd={handlePlaybackEnd}
            onPlaybackFocusChange={handlePlaybackFocusChange}
            onCommandExecuted={clearCommand}
          />
          <VideoProgressBar
            duration={videoInfo?.duration ?? 0}
            currentTime={currentTime}
            topics={topics}
            onSeek={handleSeek}
            selectedTopic={selectedTopic}
            onPlayTopic={handlePlayTopic}
          />
          <HighlightsPanel
            topics={topics}
            themes={themes}
            selectedTheme={selectedTheme}
            loadingTheme={themeLoading || highlightsLoading}
            activeTopicId={selectedTopic?.id ?? null}
            playingAll={queuePlaying && !citationHighlight}
            onSelectTheme={handleSelectTheme}
            onPlayTopic={handlePlayTopic}
            onPlayAll={handlePlayAll}
            onStop={handleStopPlayback}
            selectedLanguage={selectedLanguage}
            onRequestTranslation={translateWithContext}
          />
        </div>
        <aside className="min-w-0 lg:sticky lg:top-20 lg:h-[calc(100vh-6rem)] lg:min-h-[680px]">
          <RightColumnTabs
            takeaways={takeaways}
            takeawaysLoading={summaryLoading && !takeaways.length}
            topQuotes={topQuotes}
            transcript={transcript}
            topics={topics}
            videoInfo={videoInfo}
            videoDbId={videoDbId}
            youtubeId={videoId}
            currentTime={currentTime}
            selectedTopic={selectedTopic}
            citationHighlight={citationHighlight}
            notes={notes}
            onSeek={handleSeek}
            onPlayCitation={handlePlayCitation}
            onPlayCitations={handlePlayCitations}
            onSaveTakeawayNote={handleSaveTakeawayNote}
            onTranscriptSelection={handleSelectionNoteDraft}
            pendingNoteDraft={pendingNoteDraft}
            onDraftConsumed={() => setPendingNoteDraft(null)}
            onNotesChange={setNotes}
            chatMessages={chatMessages}
            setChatMessages={setChatMessages}
            suggestedQuestions={questions}
            selectedLanguage={selectedLanguage}
            preferredLanguage={preferredTargetLanguage}
            isAuthenticated={!!user}
            onRequestSignIn={handleRequestSignIn}
            onLanguageChange={handleLanguageChange}
            onRequestTranslation={translateWithContext}
            onTopQuotesGenerated={setTopQuotes}
          />
        </aside>
      </div>
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        redirectPath={`/analyze/${videoId}`}
        currentVideoId={videoId}
        trigger={authModalTrigger}
      />
    </div>
  );
}

export default function AnalyzePage() {
  return <AnalyzePageInner />;
}
