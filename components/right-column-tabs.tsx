'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, MessagesSquare, ScrollText, NotebookPen } from 'lucide-react';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { SummaryViewer } from '@/components/summary-viewer';
import { TranscriptViewer } from '@/components/transcript-viewer';
import { AiChat } from '@/components/ai-chat';
import { NotesPanel } from '@/components/notes-panel';
import { LanguageSelector } from '@/components/language-selector';
import type { SelectionActionPayload } from '@/components/selection-actions';
import { cn } from '@/lib/utils';
import type {
  ChatMessage,
  Citation,
  Note,
  SummaryTakeaway,
  TopQuote,
  Topic,
  TranscriptSegment,
  TranslationRequestHandler,
  VideoInfo,
} from '@/lib/types';

interface Props {
  takeaways: SummaryTakeaway[];
  takeawaysLoading: boolean;
  topQuotes: TopQuote[];
  transcript: TranscriptSegment[];
  topics: Topic[];
  videoInfo: VideoInfo | null;
  videoDbId: string | null;
  youtubeId: string;
  currentTime: number;
  selectedTopic?: Topic | null;
  citationHighlight?: Citation | null;
  notes: Note[];
  onSeek: (t: number) => void;
  onPlayCitation: (citation: Citation) => void;
  onPlayCitations: (citations: Citation[]) => void;
  onSaveTakeawayNote: (t: SummaryTakeaway) => void;
  onTranscriptSelection: (payload: SelectionActionPayload) => void;
  pendingNoteDraft?: SelectionActionPayload | null;
  onDraftConsumed?: () => void;
  onNotesChange: (notes: Note[]) => void;
  chatMessages: ChatMessage[];
  setChatMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  suggestedQuestions: string[];
  selectedLanguage?: string | null;
  preferredLanguage?: string;
  isAuthenticated?: boolean;
  onRequestSignIn?: () => void;
  onLanguageChange?: (languageCode: string | null) => void;
  onRequestTranslation?: TranslationRequestHandler;
  onTopQuotesGenerated?: (quotes: TopQuote[]) => void;
}

const TABS = [
  { value: 'summary', label: 'Summary', icon: Sparkles },
  { value: 'chat', label: 'Chat', icon: MessagesSquare },
  { value: 'transcript', label: 'Transcript', icon: ScrollText },
  { value: 'notes', label: 'Notes', icon: NotebookPen },
] as const;

export function RightColumnTabs(props: Props) {
  const [active, setActive] = React.useState<string>('transcript');
  const [chatDraftSeed, setChatDraftSeed] = React.useState<{ id: number; text: string } | null>(null);

  const handleSaveSelection = React.useCallback(
    (payload: SelectionActionPayload) => {
      props.onTranscriptSelection(payload);
      setActive('notes');
    },
    [props],
  );

  const handleAskSelection = React.useCallback((payload: SelectionActionPayload) => {
    setChatDraftSeed({ id: Date.now(), text: `Explain this passage: "${payload.text}"` });
    setActive('chat');
  }, []);

  return (
    <TabsPrimitive.Root
      value={active}
      onValueChange={setActive}
      className="flex h-full min-h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-surface-2 surface-inner"
    >
      <TabsPrimitive.List className="relative flex shrink-0 items-center gap-0.5 border-b border-border bg-surface-2 px-2">
        {TABS.map((t) => (
          <TabsPrimitive.Trigger
            key={t.value}
            value={t.value}
            className={cn(
              'relative inline-flex items-center gap-1.5 px-3 py-3.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors',
              active === t.value ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <t.icon className="h-3.5 w-3.5" />
            {t.label}
            {active === t.value && (
              <motion.span
                layoutId="rightcol-tab-underline"
                className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-lime"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {props.onLanguageChange && props.onRequestSignIn && (
        <LanguageSelector
          selectedLanguage={props.selectedLanguage ?? null}
          preferredLanguage={props.preferredLanguage}
          currentSourceLanguage={props.videoInfo?.language}
          isAuthenticated={props.isAuthenticated ?? false}
          onLanguageChange={(languageCode) => {
            props.onLanguageChange?.(languageCode);
            if (languageCode) setActive('transcript');
          }}
          onRequestSignIn={props.onRequestSignIn}
        />
      )}

      <div className="relative min-h-0 flex-1">
        <div className={cn('absolute inset-0 flex flex-col overflow-hidden', active !== 'summary' && 'hidden')}>
          <div className="min-h-0 flex-1 overflow-auto">
                <SummaryViewer
                  takeaways={props.takeaways}
                  loading={props.takeawaysLoading}
                  onSeek={props.onSeek}
                  onSaveNote={props.onSaveTakeawayNote}
                />
                {props.topQuotes.length > 0 && (
                  <section className="space-y-3 px-5 pb-6 pt-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Top quotes
                    </h3>
                    <ul className="space-y-3">
                      {props.topQuotes.map((q, i) => (
                        <li
                          key={i}
                          className="rounded-xl border border-border bg-surface-3 p-4"
                        >
                          {q.title && (
                            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {q.title}
                            </p>
                          )}
                          <blockquote className="border-l-2 border-orange pl-3 font-display text-base italic leading-snug text-foreground">
                            “{q.quote}”
                          </blockquote>
                          {q.timestamp && (
                            <p className="mt-2 font-mono text-[11px] text-muted-foreground">{q.timestamp}</p>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
          </div>
        </div>
        <div className={cn('absolute inset-0 flex flex-col overflow-hidden', active !== 'chat' && 'hidden')}>
          <AiChat
            transcript={props.transcript}
            topics={props.topics}
            videoInfo={props.videoInfo}
            messages={props.chatMessages}
            setMessages={props.setChatMessages}
            suggestedQuestions={props.suggestedQuestions}
            onSeek={props.onSeek}
            onPlayCitation={props.onPlayCitation}
            onPlayCitations={props.onPlayCitations}
            onSaveSelectionNote={handleSaveSelection}
            onAskSelection={handleAskSelection}
            draftSeed={chatDraftSeed}
            selectedLanguage={props.selectedLanguage ?? null}
            onRequestTranslation={props.onRequestTranslation}
            onTopQuotesGenerated={props.onTopQuotesGenerated}
          />
        </div>
        <div className={cn('absolute inset-0 flex flex-col overflow-hidden', active !== 'transcript' && 'hidden')}>
          <TranscriptViewer
            segments={props.transcript}
            currentTime={props.currentTime}
            onSeek={props.onSeek}
            onSelection={handleSaveSelection}
            onAskSelection={handleAskSelection}
            selectedTopic={props.selectedTopic}
            citationHighlight={props.citationHighlight}
            topics={props.topics}
            selectedLanguage={props.selectedLanguage ?? null}
            videoInfo={props.videoInfo}
            onRequestTranslation={props.onRequestTranslation}
          />
        </div>
        <div className={cn('absolute inset-0 flex flex-col overflow-hidden p-4', active !== 'notes' && 'hidden')}>
          <NotesPanel
            videoDbId={props.videoDbId}
            youtubeId={props.youtubeId}
            notes={props.notes}
            onChange={props.onNotesChange}
            onSeek={props.onSeek}
            pendingDraft={props.pendingNoteDraft}
            onDraftConsumed={props.onDraftConsumed}
            onRequestSignIn={props.onRequestSignIn}
          />
        </div>
      </div>
    </TabsPrimitive.Root>
  );
}
