import { z } from 'zod';
import { STRICT_TIMESTAMP_RANGE_REGEX } from '@/lib/timestamp-utils';

function parseSeconds(input: unknown): unknown {
  if (typeof input === 'number') return input;
  if (typeof input !== 'string') return input;
  const trimmed = input.trim();
  if (!trimmed) return input;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  const m = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?(?:\.(\d+))?$/);
  if (!m) return input;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = m[3] !== undefined ? Number(m[3]) : undefined;
  const frac = m[4] !== undefined ? Number(`0.${m[4]}`) : 0;
  const total = c !== undefined ? a * 3600 + b * 60 + c : a * 60 + b;
  return total + frac;
}

const secondsSchema = z.preprocess(parseSeconds, z.number().nonnegative());

const topicSegmentSchema = z.object({
  start: secondsSchema,
  end: secondsSchema,
  text: z.string().min(1),
});

const topicSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  duration: secondsSchema,
  segments: z.array(topicSegmentSchema).min(1),
  keywords: z.array(z.string()).optional(),
  quote: z
    .object({ timestamp: z.string(), text: z.string() })
    .optional(),
});

export const topicsSchema = z.object({
  topics: z.array(topicSchema),
  topicCandidates: z
    .array(
      z.object({
        key: z.string(),
        title: z.string(),
        quote: z.object({ timestamp: z.string(), text: z.string() }),
      }),
    )
    .optional(),
});

export const quoteTopicSchema = z.object({
  title: z.string().min(1).max(120),
  quote: z.object({
    timestamp: z.string().regex(STRICT_TIMESTAMP_RANGE_REGEX),
    text: z.string().min(1).max(20_000),
  }),
});

export const quoteTopicsPayloadSchema = z.object({
  topics: z.array(quoteTopicSchema).max(10),
});

export const summaryTakeawaysSchema = z.object({
  takeaways: z.array(
    z.object({
      label: z.string(),
      insight: z.string(),
      timestamps: z
        .array(z.object({ label: z.string().optional(), time: secondsSchema }))
        .optional(),
    }),
  ),
});

export const topQuotesSchema = z.object({
  quotes: z.array(
    z.object({
      title: z.string().min(1),
      quote: z.string().min(1),
      timestamp: z.string(),
    }),
  ),
});

export const suggestedQuestionsSchema = z.object({
  questions: z.array(z.string().min(2)).max(8),
});

export const quickPreviewSchema = z.object({
  preview: z.object({
    title: z.string().min(1).max(120),
    summary: z.string().min(1).max(1_000),
    glance: z.array(z.string().min(1).max(160)).min(1).max(5),
  }),
});

export const chatResponseSchema = z.object({
  answer: z.string(),
  citations: z.array(
    z.object({
      number: z.number().int().min(1),
      text: z.string(),
      timestamp: z.string().regex(/^\d{1,2}:\d{2}(:\d{2})?$/),
    }),
  ),
});

export const translateResponseSchema = z.object({
  translations: z.array(z.string()),
});
