import './StatusBanner.css';

export default function StatusBanner({
  variant = 'running',
  text,
  onRetry,
  retryText = 'Retry',
}) {
  if (!text) return null;

  return (
    <div className={`status-banner ${variant}`} role="status" aria-live="polite">
      <span>{text}</span>
      {variant === 'error' && onRetry && (
        <button type="button" onClick={onRetry}>
          {retryText}
        </button>
      )}
    </div>
  );
}
