function parseHost(url: string | undefined) {
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

export function buildCSP(): string {
  const supabaseHost = parseHost(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseConnect = supabaseHost
    ? [`https://${supabaseHost}`, `wss://${supabaseHost}`]
    : [];

  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com https://*.googleapis.com https://va.vercel-scripts.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://i.ytimg.com https://img.youtube.com https://*.ytimg.com https://lh3.googleusercontent.com",
    "font-src 'self' data:",
    [
      "connect-src 'self'",
      'https://*.supabase.co',
      'https://*.supabase.in',
      'https://*.supabase.net',
      'wss://*.supabase.co',
      'https://*.googleapis.com',
      'https://www.youtube.com',
      'https://api.minimax.chat',
      'https://api.supadata.ai',
      'https://vitals.vercel-insights.com',
      'https://va.vercel-scripts.com',
      ...supabaseConnect,
    ].join(' '),
    "media-src 'self' blob: https://www.youtube.com",
    "object-src 'none'",
    'frame-src https://www.youtube.com https://youtube.com',
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ];

  // Only force HTTPS in production. In dev (where the server is plain HTTP),
  // emitting this directive causes browsers to upgrade subresource requests
  // to HTTPS, which fail and break all styles/scripts when accessed remotely
  // by IP rather than localhost.
  if (process.env.NODE_ENV === 'production') {
    directives.push('upgrade-insecure-requests');
  }

  return directives.join('; ');
}
