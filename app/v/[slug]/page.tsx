import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ExternalLink, Quote } from 'lucide-react';
import { notFound, redirect } from 'next/navigation';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildVideoSlug, extractVideoIdFromSlug, resolveAppUrl } from '@/lib/utils';
import type { SummaryTakeaway, TopQuote, Topic, TranscriptSegment } from '@/lib/types';

interface VideoRow {
  id: string;
  youtube_id: string;
  slug: string | null;
  title: string;
  author: string | null;
  thumbnail_url: string | null;
  duration: number | null;
  transcript: TranscriptSegment[] | null;
  topics: Topic[] | null;
  summary: { takeaways?: SummaryTakeaway[]; content?: string } | string | null;
  top_quotes: { quotes?: TopQuote[] } | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function summaryText(summary: VideoRow['summary']) {
  if (!summary) return '';
  if (typeof summary === 'string') return summary;
  const content = summary.content;
  if (typeof content === 'string') return content;
  const takeaways = Array.isArray(summary.takeaways) ? summary.takeaways : [];
  return takeaways.map((t) => t.insight).join(' ');
}

async function resolveVideo(slug: string) {
  const admin = createServiceRoleClient();
  const videoIdFromSlug = extractVideoIdFromSlug(slug);

  if (videoIdFromSlug) {
    const { data } = await admin
      .from('video_analyses')
      .select('id, youtube_id, slug, title, author, thumbnail_url, duration, transcript, topics, summary, top_quotes, created_at, updated_at')
      .eq('youtube_id', videoIdFromSlug)
      .maybeSingle();
    if (data) {
      const row = data as VideoRow;
      return { video: row, canonicalSlug: buildVideoSlug(row.title, row.youtube_id) };
    }
  }

  const { data } = await admin
    .from('video_analyses')
    .select('id, youtube_id, slug, title, author, thumbnail_url, duration, transcript, topics, summary, top_quotes, created_at, updated_at')
    .eq('slug', slug)
    .maybeSingle();

  if (!data) return null;
  const row = data as VideoRow;
  return { video: row, canonicalSlug: buildVideoSlug(row.title, row.youtube_id) };
}

function isoDuration(seconds: number | null | undefined) {
  const total = Math.max(0, Math.floor(seconds ?? 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return `PT${hours ? `${hours}H` : ''}${minutes ? `${minutes}M` : ''}${secs || (!hours && !minutes) ? `${secs}S` : ''}`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const resolved = await resolveVideo(slug);
  if (!resolved) {
    return {
      title: 'Video Not Found - VidInsight',
      description: 'This video analysis could not be found.',
    };
  }

  const { video, canonicalSlug } = resolved;
  const base = resolveAppUrl() || 'https://vidinsight.app';
  const url = `${base}/v/${canonicalSlug}`;
  const description =
    summaryText(video.summary).slice(0, 155).trim() ||
    `${video.author ?? 'YouTube'} · AI highlights, transcript, and citation-grounded notes.`;
  const thumbnail = video.thumbnail_url || `https://i.ytimg.com/vi/${video.youtube_id}/maxresdefault.jpg`;

  return {
    title: `${video.title} - Transcript & Analysis | VidInsight`,
    description,
    openGraph: {
      title: video.title,
      description,
      type: 'video.other',
      images: [{ url: thumbnail, width: 1280, height: 720, alt: video.title }],
      url,
      siteName: 'VidInsight',
    },
    twitter: {
      card: 'summary_large_image',
      title: video.title,
      description,
      images: [thumbnail],
    },
    alternates: { canonical: url },
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        'max-video-preview': -1,
        'max-image-preview': 'large',
        'max-snippet': -1,
      },
    },
  };
}

export default async function VideoSharePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const resolved = await resolveVideo(slug);
  if (!resolved) {
    const fallbackVideoId = extractVideoIdFromSlug(slug);
    if (fallbackVideoId) redirect(`/analyze/${fallbackVideoId}`);
    notFound();
  }

  const { video, canonicalSlug } = resolved;
  if (canonicalSlug && canonicalSlug !== slug) redirect(`/v/${canonicalSlug}`);

  const base = resolveAppUrl() || 'https://vidinsight.app';
  const canonicalUrl = `${base}/v/${canonicalSlug}`;
  const transcript = Array.isArray(video.transcript) ? video.transcript : [];
  const topics = Array.isArray(video.topics) ? video.topics : [];
  const takeaways =
    video.summary && typeof video.summary !== 'string' && Array.isArray(video.summary.takeaways)
      ? video.summary.takeaways
      : [];
  const quotes = Array.isArray(video.top_quotes?.quotes) ? video.top_quotes.quotes : [];
  const thumbnail = video.thumbnail_url || `https://i.ytimg.com/vi/${video.youtube_id}/maxresdefault.jpg`;
  const description =
    summaryText(video.summary) || `Analysis, highlights, and transcript for ${video.title}`;
  const transcriptText = transcript.map((segment) => segment.text).join(' ').slice(0, 5000);

  const videoStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description,
    thumbnailUrl: thumbnail,
    uploadDate: video.created_at,
    duration: isoDuration(video.duration),
    contentUrl: `https://www.youtube.com/watch?v=${video.youtube_id}`,
    embedUrl: `https://www.youtube.com/embed/${video.youtube_id}`,
    author: { '@type': 'Person', name: video.author ?? 'YouTube' },
    publisher: { '@type': 'Organization', name: 'VidInsight', url: base },
  };

  const articleStructuredData = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: `${video.title} - Transcript & Analysis`,
    description,
    image: thumbnail,
    datePublished: video.created_at,
    dateModified: video.updated_at,
    author: { '@type': 'Person', name: video.author ?? 'YouTube' },
    publisher: { '@type': 'Organization', name: 'VidInsight', url: base },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    articleBody: transcriptText,
  };

  return (
    <div className="mx-auto max-w-4xl space-y-10 px-5 py-12 sm:px-8 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoStructuredData) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleStructuredData) }}
      />

      <div className="sr-only">
        <h1>{video.title}</h1>
        <p>By {video.author}</p>
        <h2>Summary</h2>
        <p>{description}</p>
        <h2>Highlights</h2>
        <ul>{topics.slice(0, 10).map((topic) => <li key={topic.id}>{topic.title}</li>)}</ul>
        <h2>Transcript</h2>
        {transcript.map((segment, index) => <p key={index}>{segment.text}</p>)}
      </div>

      <header className="space-y-4">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          Shared workbench
        </span>
        <h1 className="font-display text-4xl leading-[1.05] tracking-tight text-foreground sm:text-6xl">
          {video.title}
        </h1>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {video.author ? <span className="font-medium text-foreground/80">{video.author}</span> : null}
          <span className="text-muted-foreground/40">·</span>
          <Link
            href={`https://youtube.com/watch?v=${video.youtube_id}`}
            target="_blank"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            <ExternalLink className="h-3 w-3" /> Open original
          </Link>
        </div>
      </header>

      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border bg-black">
        <Image src={thumbnail} alt="" fill className="object-cover" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-transparent" />
      </div>

      <Link
        href={`/analyze/${video.youtube_id}?cached=true&slug=${encodeURIComponent(canonicalSlug)}`}
        className="inline-flex items-center gap-1.5 rounded-full bg-lime px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_30px_hsl(var(--accent-lime)/0.18)] transition hover:brightness-110"
      >
        Open the full workbench <ArrowRight className="h-3.5 w-3.5" />
      </Link>

      {takeaways.length ? (
        <section className="space-y-4">
          <h2 className="font-display text-3xl text-foreground">Takeaways</h2>
          <ol className="space-y-3">
            {takeaways.map((takeaway, index) => (
              <li
                key={`${takeaway.label}-${index}`}
                className="flex gap-4 rounded-2xl border border-border bg-surface-2 p-5"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lime font-mono text-xs font-bold text-primary-foreground">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {takeaway.label}
                  </p>
                  <p className="text-sm text-foreground/90">{takeaway.insight}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {topics.length ? (
        <section className="space-y-4">
          <h2 className="font-display text-3xl text-foreground">Highlights</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {topics.map((topic) => (
              <li key={topic.id} className="rounded-2xl border border-border bg-surface-2 p-4">
                <p className="text-sm font-semibold text-foreground">{topic.title}</p>
                {topic.description ? <p className="mt-1 text-xs text-muted-foreground">{topic.description}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {quotes.length ? (
        <section className="space-y-4">
          <h2 className="flex items-center gap-2 font-display text-3xl text-foreground">
            <Quote className="h-5 w-5" /> Top quotes
          </h2>
          <ul className="space-y-3">
            {quotes.map((quote, index) => (
              <li key={`${quote.timestamp}-${index}`} className="rounded-2xl border border-border bg-surface-2 p-5">
                <blockquote className="border-l-2 border-orange pl-3 font-display text-lg italic leading-snug text-foreground">
                  &quot;{quote.quote}&quot;
                </blockquote>
                <span className="mt-2 inline-block font-mono text-[11px] text-muted-foreground">
                  {quote.timestamp}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export const revalidate = 86400;
