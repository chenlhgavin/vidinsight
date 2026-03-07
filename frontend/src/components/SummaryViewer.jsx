import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './SummaryViewer.css';

const TIMESTAMP_PATTERN = /(\d{1,2}):(\d{2})/g;

function formatTimestamp(minutes, seconds) {
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

function extractTimestamps(text) {
  const timestamps = [];
  let match;
  const regex = new RegExp(TIMESTAMP_PATTERN.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const totalSeconds = minutes * 60 + seconds;
    timestamps.push({
      display: formatTimestamp(minutes, seconds),
      seconds: totalSeconds,
    });
  }
  return timestamps;
}

function TakeawayCard({ takeaway, onTimestampClick }) {
  const { label, insight, timestamps: rawTimestamps } = takeaway;

  // Extract timestamps from the raw timestamps string, or from insight text as fallback
  const source = rawTimestamps || insight || '';
  const timestamps = extractTimestamps(source);

  return (
    <div className="takeaway-card">
      {label && <div className="takeaway-label">{label}</div>}
      {insight && (
        <div className="takeaway-insight">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {insight}
          </ReactMarkdown>
        </div>
      )}
      {timestamps.length > 0 && (
        <div className="takeaway-timestamps">
          {timestamps.map((ts, i) => (
            <button
              key={i}
              type="button"
              className="timestamp-link"
              onClick={() => onTimestampClick?.(ts.seconds)}
            >
              [{ts.display}]
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SummaryViewer({ takeaways, onTimestampClick }) {
  if (!takeaways || takeaways.length === 0) {
    return (
      <div className="summary-viewer summary-viewer-empty">
        <p className="summary-empty-text">No takeaways available.</p>
      </div>
    );
  }

  return (
    <div className="summary-viewer">
      {takeaways.map((takeaway, index) => (
        <TakeawayCard
          key={index}
          takeaway={takeaway}
          onTimestampClick={onTimestampClick}
        />
      ))}
    </div>
  );
}
