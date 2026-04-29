import type { Citation, PlaybackCommand, PlaybackSegment, Topic } from '@/lib/types';

export type PlaybackFocus =
  | { kind: 'none' }
  | { kind: 'topic'; topic: Topic; segment: PlaybackSegment; segmentIndex: number }
  | { kind: 'citation'; citation: Citation; segment: PlaybackSegment; citationIndex: number }
  | { kind: 'segment'; segment: PlaybackSegment };

export interface PlaybackQueueItem {
  kind: 'topic' | 'citation' | 'segment';
  start: number;
  end: number;
  text?: string;
  topic?: Topic;
  topicIndex?: number;
  segmentIndex?: number;
  citation?: Citation;
  citationIndex?: number;
  startSegmentIdx?: number;
  endSegmentIdx?: number;
  startCharOffset?: number;
  endCharOffset?: number;
}

function isValidRange(start: unknown, end: unknown): start is number {
  return (
    typeof start === 'number' &&
    typeof end === 'number' &&
    Number.isFinite(start) &&
    Number.isFinite(end) &&
    end > start
  );
}

function segmentItem(
  segment: PlaybackSegment | undefined,
  extra?: Omit<PlaybackQueueItem, 'kind' | 'start' | 'end'> & { kind?: PlaybackQueueItem['kind'] },
): PlaybackQueueItem | null {
  if (!segment || !isValidRange(segment.start, segment.end)) return null;
  return {
    kind: extra?.kind ?? 'segment',
    start: segment.start,
    end: segment.end,
    text: segment.text,
    startSegmentIdx: segment.startSegmentIdx,
    endSegmentIdx: segment.endSegmentIdx,
    startCharOffset: segment.startCharOffset,
    endCharOffset: segment.endCharOffset,
    ...extra,
  };
}

function citationItem(citation: Citation, citationIndex: number): PlaybackQueueItem | null {
  if (!isValidRange(citation.start, citation.end)) return null;
  return {
    kind: 'citation',
    start: citation.start,
    end: citation.end,
    text: citation.text,
    citation,
    citationIndex,
    startSegmentIdx: citation.startSegmentIdx,
    endSegmentIdx: citation.endSegmentIdx,
    startCharOffset: citation.startCharOffset,
    endCharOffset: citation.endCharOffset,
  };
}

function topicItems(topic: Topic, topicIndex: number): PlaybackQueueItem[] {
  return topic.segments
    .map((segment, segmentIndex) =>
      segmentItem(segment, {
        kind: 'topic',
        topic,
        topicIndex,
        segmentIndex,
      }),
    )
    .filter((item): item is PlaybackQueueItem => item !== null);
}

export function buildPlaybackQueue(command: PlaybackCommand): PlaybackQueueItem[] {
  switch (command.type) {
    case 'PLAY_SEGMENT':
      if (command.citation) {
        return citationItem(command.citation, 0) ? [citationItem(command.citation, 0)!] : [];
      }
      return segmentItem(command.segment) ? [segmentItem(command.segment)!] : [];

    case 'PLAY_TOPIC':
      return command.topic ? topicItems(command.topic, 0) : [];

    case 'PLAY_ALL':
      return (command.topics ?? (command.topic ? [command.topic] : [])).flatMap((topic, index) =>
        topicItems(topic, index),
      );

    case 'PLAY_CITATIONS':
      return (command.citations ?? [])
        .map((citation, index) => citationItem(citation, index))
        .filter((item): item is PlaybackQueueItem => item !== null);

    default:
      return [];
  }
}

export function focusForQueueItem(item: PlaybackQueueItem | null | undefined): PlaybackFocus {
  if (!item) return { kind: 'none' };

  const segment: PlaybackSegment = {
    start: item.start,
    end: item.end,
    text: item.text,
    startSegmentIdx: item.startSegmentIdx,
    endSegmentIdx: item.endSegmentIdx,
    startCharOffset: item.startCharOffset,
    endCharOffset: item.endCharOffset,
  };

  if (item.kind === 'topic' && item.topic) {
    return { kind: 'topic', topic: item.topic, segment, segmentIndex: item.segmentIndex ?? 0 };
  }
  if (item.kind === 'citation' && item.citation) {
    return { kind: 'citation', citation: item.citation, segment, citationIndex: item.citationIndex ?? 0 };
  }
  return { kind: 'segment', segment };
}
