import { config } from 'dotenv';
config({ path: '.env.local' });

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'DEEPSEEK_API_KEY',
  'SUPADATA_API_KEY',
];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('Missing required env vars:');
  missing.forEach((k) => console.error('  -', k));
  console.error('\nCopy .env.local.example to .env.local and fill in the values.');
  process.exit(1);
}
console.log('Environment OK');
