// Permissive Database shape — keeps `createClient<Database>` happy without
// over-claiming column-level types. Replace with the generated, fully-typed
// schema once stable:
//   supabase gen types typescript --linked > lib/supabase/types.ts

type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type LooseRow = Record<string, unknown>;

type LooseTable = {
  Row: LooseRow;
  Insert: LooseRow;
  Update: LooseRow;
  Relationships: [];
};

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: '12';
  };
  public: {
    Tables: {
      profiles: LooseTable;
      video_analyses: LooseTable;
      user_videos: LooseTable;
      user_notes: LooseTable;
      rate_limits: LooseTable;
      audit_logs: LooseTable;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type { Json };
