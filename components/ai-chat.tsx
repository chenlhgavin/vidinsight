'use client';

import { useEffect, useState } from 'react';
import { Send, Loader2, MessagesSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ChatMessageView } from '@/components/chat-message';
import { csrfFetch } from '@/lib/csrf-client';
import type { SelectionActionPayload } from '@/components/selection-actions';
import type {
  ChatMessage,
  Citation,
  TopQuote,
  Topic,
  TranscriptSegment,
  TranslationRequestHandler,
  VideoInfo,
} from '@/lib/types';

interface Props {
  transcript: TranscriptSegment[];
  topics: Topic[];
  videoInfo: VideoInfo | null;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  suggestedQuestions: string[];
  onSeek: (t: number) => void;
  onPlayCitation?: (citation: Citation) => void;
  onPlayCitations?: (citations: Citation[]) => void;
  onSaveSelectionNote?: (payload: SelectionActionPayload) => void;
  onAskSelection?: (payload: SelectionActionPayload) => void;
  draftSeed?: { id: number; text: string } | null;
  selectedLanguage?: string | null;
  onRequestTranslation?: TranslationRequestHandler;
  onTopQuotesGenerated?: (quotes: TopQuote[]) => void;
}

interface ChatApiResponse {
  answer: string;
  citations: Citation[];
}

interface TopQuotesApiResponse {
  quotes?: TopQuote[];
}

const TOP_QUOTES_PROMPT = 'What are the top quotes?';

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function isTopQuotesRequest(text: string) {
  return text.trim().toLowerCase() === TOP_QUOTES_PROMPT.toLowerCase();
}

function formatTopQuotes(quotes: TopQuote[]) {
  if (!quotes.length) return 'No standout quotes were returned for this video.';
  return quotes
    .map((quote, index) => {
      const timestamp = quote.timestamp ? ` [${quote.timestamp}]` : '';
      return `${index + 1}. **${quote.title}**${timestamp}\n\n> "${quote.quote}"`;
    })
    .join('\n\n');
}

export function AiChat({
  transcript,
  topics,
  videoInfo,
  messages,
  setMessages,
  suggestedQuestions,
  onSeek,
  onPlayCitation,
  onPlayCitations,
  onSaveSelectionNote,
  onAskSelection,
  draftSeed,
  selectedLanguage = null,
  onRequestTranslation,
  onTopQuotesGenerated,
}: Props) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [translatedSuggestedQuestions, setTranslatedSuggestedQuestions] = useState<string[]>([]);

  useEffect(() => {
    if (!draftSeed?.text) return;
    queueMicrotask(() => setDraft(draftSeed.text));
  }, [draftSeed]);

  useEffect(() => {
    let cancelled = false;
    const scope = videoInfo?.videoId || videoInfo?.title || 'video';

    void (async () => {
      await Promise.resolve();
      if (cancelled) return;

      if (!selectedLanguage || !onRequestTranslation || suggestedQuestions.length === 0) {
        setTranslatedSuggestedQuestions([]);
        return;
      }

      const translations = await Promise.all(
        suggestedQuestions.map(async (question, index) => {
          try {
            return await onRequestTranslation(
              question,
              `chat-suggested:${scope}:${selectedLanguage}:${index}:${question}`,
              'chat',
            );
          } catch {
            return question;
          }
        }),
      );
      if (!cancelled) setTranslatedSuggestedQuestions(translations);
    })();

    return () => {
      cancelled = true;
    };
  }, [onRequestTranslation, selectedLanguage, suggestedQuestions, videoInfo?.title, videoInfo?.videoId]);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? draft).trim();
    if (!text || sending) return;

    abortController?.abort();
    const ctrl = new AbortController();
    setAbortController(ctrl);

    const userMsg: ChatMessage = {
      id: makeId('u'),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };
    setMessages((m) => [...m, userMsg]);
    setDraft('');
    setSending(true);

    try {
      if (isTopQuotesRequest(text)) {
        const r = await csrfFetch('/api/top-quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcript,
            videoInfo,
            ...(selectedLanguage ? { targetLanguage: selectedLanguage } : {}),
          }),
          signal: ctrl.signal,
        });
        if (!r.ok) throw new Error(`top-quotes ${r.status}`);
        const data = (await r.json()) as TopQuotesApiResponse;
        const quotes = data.quotes ?? [];
        if (quotes.length) {
          onTopQuotesGenerated?.(quotes);
          if (videoInfo?.videoId) {
            void csrfFetch('/api/update-video-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                videoId: videoInfo.videoId,
                top_quotes: { quotes },
              }),
            }).catch((error) => {
              console.error('[top-quotes:update]', error);
            });
          }
        }
        const assistantMsg: ChatMessage = {
          id: makeId('a'),
          role: 'assistant',
          content: formatTopQuotes(quotes),
          timestamp: new Date(),
        };
        setMessages((m) => [...m, assistantMsg]);
        return;
      }

      const r = await csrfFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript,
          topics,
          message: text,
          videoInfo,
          conversationHistory: messages,
          ...(selectedLanguage ? { targetLanguage: selectedLanguage } : {}),
        }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new Error(`chat ${r.status}`);
      const data = (await r.json()) as ChatApiResponse;
      const assistantMsg: ChatMessage = {
        id: makeId('a'),
        role: 'assistant',
        content: data.answer,
        citations: data.citations,
        timestamp: new Date(),
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (err) {
      const aborted = (err as Error)?.name === 'AbortError';
      if (!aborted) {
        setMessages((m) => [
          ...m,
          {
            id: makeId('e'),
            role: 'assistant',
            content: 'Something went wrong. Please try again.',
            timestamp: new Date(),
          },
        ]);
      }
    } finally {
      setSending(false);
    }
  };

  const isEmpty = messages.length === 0;
  const displayedSuggestedQuestions =
    selectedLanguage && translatedSuggestedQuestions.length
      ? translatedSuggestedQuestions
      : suggestedQuestions;

  return (
    <div className="flex h-full min-h-[520px] flex-col">
      <ScrollArea className="min-h-0 flex-1 px-5 py-5">
        <div className="space-y-4">
          {isEmpty && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-dashed border-border bg-surface-3 p-5 text-center">
                <MessagesSquare className="mx-auto mb-2 h-5 w-5 text-lime" />
                <p className="font-display text-lg leading-tight text-foreground">
                  Ask anything about this video
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Answers cite the transcript — click any [n] to jump to it.
                </p>
              </div>
              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  Presets
                </p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => send(TOP_QUOTES_PROMPT)}
                    className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground/80 transition hover:border-orange/60 hover:bg-surface-3 hover:text-foreground"
                  >
                    Top quotes
                  </button>
                </div>
              </div>
              {displayedSuggestedQuestions.length > 0 && (
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                    Suggested
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {displayedSuggestedQuestions.slice(0, 4).map((q, i) => (
                      <button
                        key={i}
                        onClick={() => send(q)}
                        className="rounded-full border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground/80 transition hover:border-lime/40 hover:bg-surface-3 hover:text-foreground"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {messages.map((m) => (
            <ChatMessageView
              key={m.id}
              message={m}
              onSeek={onSeek}
              onPlayCitation={onPlayCitation}
              onPlayCitations={onPlayCitations}
              onSaveSelectionNote={onSaveSelectionNote}
              onAskSelection={onAskSelection}
            />
          ))}
          {sending && (
            <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin text-lime" />
              Thinking…
            </div>
          )}
        </div>
      </ScrollArea>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
        className="flex shrink-0 items-center gap-2 border-t border-border bg-surface-2 p-3"
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask anything about this video…"
          disabled={sending}
          className="h-11 flex-1 rounded-xl border border-border bg-surface-3 px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-transparent focus:ring-2 focus:ring-ring"
        />
        <Button
          type="submit"
          variant="accent"
          size="icon"
          disabled={sending || !draft.trim()}
          className="h-11 w-11"
        >
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
