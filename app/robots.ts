import type { MetadataRoute } from 'next';
import { resolveAppUrl } from '@/lib/utils';

export default function robots(): MetadataRoute.Robots {
  const base = resolveAppUrl() || 'https://vidinsight.app';
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/v/'],
        disallow: ['/api/', '/my-videos', '/all-notes', '/settings'],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
