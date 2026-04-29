export default function PrivacyPage() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-10 prose prose-sm dark:prose-invert">
      <h1>Privacy Policy</h1>
      <p>
        VidInsight processes the YouTube videos you submit, the transcripts we fetch, and the
        notes / chat messages you create while signed in.
      </p>
      <h2>What we store</h2>
      <ul>
        <li>Your account email + auth provider profile (Supabase Auth)</li>
        <li>Cached video analyses (transcript, AI-generated highlights, summary, quotes)</li>
        <li>Your saved notes and favorites</li>
        <li>Hashed IP address (SHA-256, truncated) for rate limiting only</li>
        <li>Audit logs of security-relevant events</li>
      </ul>
      <h2>Third parties</h2>
      <p>
        Transcripts are fetched from YouTube (InnerTube) or Supadata; AI generation is performed
        by MiniMax. Hosting and CDN are provided by Vercel.
      </p>
      <h2>Your data</h2>
      <p>
        Email <code>privacy@vidinsight.app</code> to request deletion of your account and all
        associated data.
      </p>
    </article>
  );
}
