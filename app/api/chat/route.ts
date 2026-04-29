import { NextResponse } from 'next/server';
import { generateChat } from '@/lib/ai-processing';
import { buildTranscriptIndex, findTextInTranscript, matchQuote } from '@/lib/quote-matcher';
import { parseTimestamp } from '@/lib/timestamp-utils';
import type { Citation, TranscriptSegment } from '@/lib/types';
import { withSecurity, SECURITY_PRESETS } from '@/lib/security-middleware';
import { gateGuestForGeneration, finalizeGuestResponse } from '@/lib/guest-gate';

export const runtime = 'nodejs';
export const maxDuration = 60;

function findClosestSegmentIndex(transcript: TranscriptSegment[], seconds: number): number {
  if (!transcript.length || !Number.isFinite(seconds)) return -1;
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  for (let i = 0; i < transcript.length; i++) {
    const segment = transcript[i];
    const end = segment.start + segment.duration;
    if (seconds >= segment.start && seconds <= end) return i;
    const distance = Math.min(Math.abs(segment.start - seconds), Math.abs(end - seconds));
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

interface CitationMatch {
  startSegmentIdx: number;
  endSegmentIdx: number;
  startCharOffset: number;
  endCharOffset: number;
  confidence: number;
}

function citationFromMatch(
  number: number,
  text: string,
  transcript: TranscriptSegment[],
  match: CitationMatch,
): Citation {
  const startSeg = transcript[match.startSegmentIdx];
  const endSeg = transcript[match.endSegmentIdx];
  return {
    number,
    text,
    start: startSeg.start,
    end: endSeg.start + endSeg.duration,
    startSegmentIdx: match.startSegmentIdx,
    endSegmentIdx: match.endSegmentIdx,
    startCharOffset: match.startCharOffset,
    endCharOffset: match.endCharOffset,
    confidence: match.confidence,
  };
}

export const POST = withSecurity(SECURITY_PRESETS.AI_GENERATION, async (request, ctx) => {
  const gate = await gateGuestForGeneration(request, ctx, { isPrimaryAnalysis: false });
  if (!gate.ok) return gate.response;

  const body = ctx.parsedBody as Record<string, unknown> | null;
  if (!body || !body.transcript || !body.message) {
    return NextResponse.json({ error: 'missing transcript or message' }, { status: 400 });
  }

  const transcript = body.transcript as TranscriptSegment[];
  const index = buildTranscriptIndex(transcript);

  let result;
  try {
    result = await generateChat({
      transcript,
      topics: body.topics as never,
      message: body.message as string,
      conversationHistory: body.conversationHistory as never,
      videoInfo: body.videoInfo as never,
      language: (body.targetLanguage as string) || (body.language as string),
      signal: request.signal,
    });
  } catch (err) {
    console.error('[chat]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }

  const enriched: Citation[] = result.citations.map((c) => {
    const m = matchQuote(index, c.text);
    if (!m) {
      const fallbackTime = parseTimestamp(c.timestamp) ?? 0;
      const closestIndex = findClosestSegmentIndex(transcript, fallbackTime);

      if (closestIndex >= 0 && c.text?.trim()) {
        const rangeMatch = findTextInTranscript(transcript, c.text, index, {
          startIdx: Math.max(0, closestIndex - 2),
          strategy: 'all',
          minSimilarity: 0.75,
          maxSegmentWindow: 12,
        });
        if (rangeMatch && rangeMatch.startSegmentIdx <= closestIndex + 6) {
          return citationFromMatch(c.number, c.text, transcript, {
            startSegmentIdx: rangeMatch.startSegmentIdx,
            endSegmentIdx: rangeMatch.endSegmentIdx,
            startCharOffset: rangeMatch.startCharOffset,
            endCharOffset: rangeMatch.endCharOffset,
            confidence: rangeMatch.confidence,
          });
        }
      }

      const fallbackSeg = closestIndex >= 0 ? transcript[closestIndex] : null;
      return {
        number: c.number,
        text: fallbackSeg?.text || c.text,
        start: fallbackSeg?.start ?? fallbackTime,
        end: fallbackSeg ? fallbackSeg.start + fallbackSeg.duration : fallbackTime,
        startSegmentIdx: Math.max(0, closestIndex),
        endSegmentIdx: Math.max(0, closestIndex),
        startCharOffset: 0,
        endCharOffset: fallbackSeg?.text.length ?? 0,
        confidence: fallbackSeg ? 0.5 : 0,
      };
    }
    return citationFromMatch(c.number, c.text, transcript, m);
  });

  return finalizeGuestResponse(
    NextResponse.json({ answer: result.answer, citations: enriched }),
    gate.guestState,
    { consumed: false },
  );
});
