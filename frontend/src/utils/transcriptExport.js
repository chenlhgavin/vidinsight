/**
 * Transcript export utilities.
 * Supports TXT, SRT, and CSV formats.
 */

function formatClockTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatSrtTimestamp(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.round((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function sanitizeText(text) {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function escapeCsvValue(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function generateTxtContent(segments, options) {
  const lines = [];
  for (const seg of segments) {
    const text = sanitizeText(seg.text);
    if (!text) continue;
    if (options.includeTimestamps) {
      lines.push(`[${formatClockTime(seg.start)}] ${text}`);
    } else {
      lines.push(text);
    }
  }
  return lines.join('\n');
}

function generateSrtContent(segments) {
  const lines = [];
  let index = 1;
  for (const seg of segments) {
    const text = sanitizeText(seg.text);
    if (!text) continue;
    const start = formatSrtTimestamp(seg.start);
    const end = formatSrtTimestamp(seg.start + (seg.duration || 0));
    lines.push(`${index}`);
    lines.push(`${start} --> ${end}`);
    lines.push(text);
    lines.push('');
    index++;
  }
  return lines.join('\n');
}

function generateCsvContent(segments, options) {
  const headers = [];
  if (options.includeTimestamps) {
    headers.push('start_time', 'end_time');
  }
  headers.push('text');

  const rows = [headers.join(',')];
  for (const seg of segments) {
    const text = sanitizeText(seg.text);
    if (!text) continue;
    const values = [];
    if (options.includeTimestamps) {
      values.push(formatClockTime(seg.start));
      values.push(formatClockTime(seg.start + (seg.duration || 0)));
    }
    values.push(escapeCsvValue(text));
    rows.push(values.join(','));
  }
  return rows.join('\n');
}

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 40)
    .replace(/-+$/, '');
}

const MIME_TYPES = {
  txt: 'text/plain',
  srt: 'application/x-subrip',
  csv: 'text/csv',
};

export function createTranscriptExport(segments, options) {
  const { format, includeTimestamps = true, videoTitle } = options;

  let content;
  switch (format) {
    case 'srt':
      content = generateSrtContent(segments);
      break;
    case 'csv':
      content = generateCsvContent(segments, { includeTimestamps });
      break;
    default:
      content = generateTxtContent(segments, { includeTimestamps });
      break;
  }

  const blob = new Blob([content], { type: MIME_TYPES[format] || 'text/plain' });
  const titleSlug = videoTitle ? `-${slugify(videoTitle)}` : '';
  const filename = `transcript${titleSlug}.${format}`;

  return { blob, filename };
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
