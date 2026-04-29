import type { MetadataRoute } from 'next';
import { createServiceRoleClient } from '@/lib/supabase/admin';
import { buildVideoSlug, resolveAppUrl } from '@/lib/utils';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = resolveAppUrl() || 'https://vidinsight.app';
  const staticPages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.3 },
  ];

  const admin = createServiceRoleClient();
  const { data } = await admin
    .from('video_analyses')
    .select('slug, updated_at, youtube_id, title')
    .order('updated_at', { ascending: false })
    .limit(50_000);

  const videoPages: MetadataRoute.Sitemap = ((data as Array<{
    slug: string | null;
    updated_at: string | null;
    youtube_id: string | null;
    title: string | null;
  }> | null) ?? [])
    .map((video) => {
      const slug = video.slug || buildVideoSlug(video.title, video.youtube_id);
      if (!slug) return null;
      return {
        url: `${base}/v/${slug}`,
        lastModified: video.updated_at ? new Date(video.updated_at) : new Date(),
        changeFrequency: 'monthly' as const,
        priority: 0.8,
      };
    })
    .filter(Boolean) as MetadataRoute.Sitemap;

  return [...staticPages, ...videoPages];
}

export const revalidate = 3600;
