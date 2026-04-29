import { csrfFetch } from '@/lib/csrf-client';
import type { Note, NoteMetadata, NoteSource, NoteWithVideo } from '@/lib/types';

export async function fetchNotes(youtubeId: string): Promise<Note[]> {
  const r = await csrfFetch(`/api/notes?youtubeId=${encodeURIComponent(youtubeId)}`);
  if (!r.ok) throw new Error(`fetchNotes ${r.status}`);
  const data = (await r.json()) as { notes: Note[] };
  return data.notes;
}

export async function fetchAllNotes(): Promise<NoteWithVideo[]> {
  const r = await csrfFetch('/api/notes/all');
  if (!r.ok) throw new Error(`fetchAllNotes ${r.status}`);
  const data = (await r.json()) as { notes: NoteWithVideo[] };
  return data.notes;
}

interface SaveArgs {
  youtubeId: string;
  videoId: string;
  source: NoteSource;
  sourceId?: string;
  text: string;
  metadata?: NoteMetadata;
}

export async function saveNote(args: SaveArgs): Promise<Note> {
  const r = await csrfFetch('/api/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  if (!r.ok) {
    const data = await r.json().catch(() => ({}));
    throw new Error(data.error || `saveNote ${r.status}`);
  }
  const data = (await r.json()) as { note: Note };
  return data.note;
}

export async function deleteNote(id: string): Promise<void> {
  const r = await csrfFetch(`/api/notes?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  if (!r.ok) throw new Error(`deleteNote ${r.status}`);
}

export function enhanceNoteQuote(text: string): string {
  return text
    .trim()
    .replace(/^["“”]+|["“”]+$/g, '')
    .replace(/\s+/g, ' ');
}
