import { useState, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';
import remarkGfm from 'remark-gfm';
import STRINGS from '../i18n';
import './MessageBubble.css';

const LONG_TEXT_THRESHOLD = 300;
const LONG_LINES_THRESHOLD = 8;

function isLongContent(text) {
  if (text.length > LONG_TEXT_THRESHOLD) return true;
  if (text.split('\n').length > LONG_LINES_THRESHOLD) return true;
  return false;
}

function getPreviewText(text) {
  const lines = text.split('\n').filter((l) => l.trim());
  return lines.slice(0, 3).join('\n');
}

function countLines(text) {
  return text.split('\n').length;
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <button className="copy-btn" onClick={handleCopy} title={STRINGS.message.copyCode}>
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
      <span>{copied ? STRINGS.message.copied : STRINGS.message.copy}</span>
    </button>
  );
}

function PastedContentCard({ content }) {
  const [expanded, setExpanded] = useState(false);
  const lines = countLines(content);
  const sizeKB = (new TextEncoder().encode(content).length / 1024).toFixed(1);

  return (
    <div className="pasted-card">
      <button
        className="pasted-card-header"
        onClick={() => setExpanded(!expanded)}
        type="button"
        aria-expanded={expanded}
      >
        <div className="pasted-card-icon">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </div>
        <div className="pasted-card-info">
          <div className="pasted-card-title">{STRINGS.message.pastedContent}</div>
          <div className="pasted-card-meta">{sizeKB} {STRINGS.message.kb} &middot; {lines} {STRINGS.message.lines}</div>
        </div>
        <div className={`pasted-card-arrow ${expanded ? 'expanded' : ''}`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </div>
      </button>
      {expanded && (
        <div className="pasted-card-body">
          <pre>{content}</pre>
        </div>
      )}
      {!expanded && (
        <div className="pasted-card-preview">
          <pre>{getPreviewText(content)}</pre>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ className, children, ...props }) {
  const match = /language-(\w+)/.exec(className || '');
  const codeText = String(children).replace(/\n$/, '');
  const language = match ? match[1] : '';

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span className="code-block-lang">{language || 'text'}</span>
        <CopyButton text={codeText} />
      </div>
      <SyntaxHighlighter
        style={oneLight}
        language={language || 'text'}
        PreTag="div"
        customStyle={{
          margin: 0,
          borderRadius: '0 0 8px 8px',
          fontSize: '13.5px',
          lineHeight: '1.6',
          padding: '14px 16px',
        }}
        {...props}
      >
        {codeText}
      </SyntaxHighlighter>
    </div>
  );
}

const markdownComponents = {
  code({ inline, className, children, ...props }) {
    if (!inline && (className || String(children).includes('\n'))) {
      return <CodeBlock className={className} {...props}>{children}</CodeBlock>;
    }
    return (
      <code className="inline-code" {...props}>
        {children}
      </code>
    );
  },
};

export default function MessageBubble({
  role,
  content,
  modelName = 'Assistant',
  images = [],
  contentType = 'text',
}) {
  const isUser = role === 'user';
  const showAsCard = isUser && isLongContent(content);
  const hasImages = Array.isArray(images) && images.length > 0;

  return (
    <div className={`message ${role}`}>
      <div className="message-avatar">
        {isUser ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        )}
      </div>
      <div className="message-content">
        <div className="message-role">{isUser ? STRINGS.message.you : modelName}</div>
        <div className="message-text">
          {showAsCard ? (
            <PastedContentCard content={content} />
          ) : (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          )}
          {hasImages && contentType === 'image_result' && (
            <div className="message-images">
              {images.map((image) => (
                <a
                  key={image.id}
                  href={image.url}
                  target="_blank"
                  rel="noreferrer"
                  className="message-image-link"
                >
                  <img
                    src={image.url}
                    alt={STRINGS.message.generatedImage}
                    className="message-image"
                    loading="lazy"
                  />
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
