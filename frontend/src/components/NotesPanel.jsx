import STRINGS from '../i18n';
import NoteEditor from './NoteEditor';
import emptyNotesImg from '../assets/empty-notes.png';
import './NotesPanel.css';

const SOURCE_LABELS = {
  transcript: STRINGS.notes.sourceTranscript,
  chat: STRINGS.notes.sourceChat,
  summary: STRINGS.notes.sourceSummary,
  custom: STRINGS.notes.sourceCustom,
};

const SOURCE_ORDER = ['transcript', 'summary', 'chat', 'custom'];

function formatTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function parseMeta(note) {
  if (!note.metadata) return null;
  try {
    return typeof note.metadata === 'string' ? JSON.parse(note.metadata) : note.metadata;
  } catch {
    return null;
  }
}

function groupBySource(notes) {
  const groups = {};
  for (const note of notes) {
    const src = note.source || 'custom';
    if (!groups[src]) groups[src] = [];
    groups[src].push(note);
  }
  return SOURCE_ORDER
    .filter((s) => groups[s]?.length)
    .map((s) => ({ source: s, notes: groups[s] }));
}

export default function NotesPanel({
  notes,
  onDeleteNote,
  editingNote,
  onSaveNote,
  onCancelEditing,
  onAddNote,
  currentTime,
  onTimestampClick,
  onEnhance,
}) {
  if (!notes.length && !editingNote) {
    return (
      <div className="notes-panel">
        <div className="notes-empty">
          <img src={emptyNotesImg} alt="" className="notes-empty-img" aria-hidden="true" />
          <span className="notes-empty-text">{STRINGS.notes.emptyState}</span>
          <button type="button" className="notes-add-btn" onClick={onAddNote}>
            {STRINGS.notes.addNote}
          </button>
        </div>
      </div>
    );
  }

  const groups = groupBySource(notes);

  return (
    <div className="notes-panel">
      <div className="notes-panel-header">
        {!editingNote && (
          <button type="button" className="notes-add-btn" onClick={onAddNote}>
            {STRINGS.notes.addNote}
          </button>
        )}
      </div>

      {editingNote && (
        <NoteEditor
          selectedText={editingNote.selectedText}
          metadata={editingNote.metadata}
          currentTime={currentTime}
          onSave={onSaveNote}
          onCancel={onCancelEditing}
          onEnhance={onEnhance}
        />
      )}

      {groups.map(({ source, notes: groupNotes }) => (
        <div key={source}>
          <div className="notes-group-header">{SOURCE_LABELS[source] || source}</div>
          {groupNotes.map((note) => {
            const meta = parseMeta(note);
            return (
              <div key={note.id} className="note-card">
                {meta?.selectedText && (
                  <p className="note-card-quote">{meta.selectedText}</p>
                )}
                <div className="note-card-text">{note.text}</div>
                <div className="note-card-footer">
                  {meta?.timestamp != null && (
                    <button
                      type="button"
                      className="note-card-timestamp"
                      onClick={() => onTimestampClick(meta.timestamp)}
                    >
                      {formatTime(meta.timestamp)}
                    </button>
                  )}
                  <button
                    type="button"
                    className="note-card-delete"
                    onClick={() => onDeleteNote(note.id)}
                  >
                    &times;
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
