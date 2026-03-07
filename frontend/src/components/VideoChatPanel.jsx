import { useState, useRef, useEffect } from 'react';
import STRINGS from '../i18n';
import MessageBubble from './MessageBubble';
import ModelDropdown from './ModelDropdown';
import './VideoChatPanel.css';

export default function VideoChatPanel({
  messages,
  onSend,
  isStreaming,
  streamingText,
  statusText,
  suggestedQuestions,
  selectedModel,
  onModelChange,
  modelOptions,
  modelNameById,
  isModelLocked,
  disabled,
}) {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef(null);
  const textareaRef = useRef(null);
  const hasModels = modelOptions.length > 0;

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingText]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isStreaming || disabled || !hasModels) return;
    onSend(input.trim());
    setInput('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleInput = (e) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 150)}px`;
  };

  const handleChipClick = (question) => {
    if (isStreaming || disabled) return;
    onSend(question);
  };

  const allMessages = [...messages];
  if (isStreaming && streamingText) {
    allMessages.push({ id: 'streaming-assistant', role: 'assistant', content: streamingText });
  }

  const showSuggestions = suggestedQuestions && suggestedQuestions.length > 0 && messages.length === 0;

  return (
    <div className="video-chat-panel">
      <div className="video-chat-header">
        <h3>{STRINGS.video.chatTitle}</h3>
      </div>

      <div className="video-chat-messages">
        {showSuggestions && (
          <div className="video-chat-suggestions">
            <p className="suggestion-label">{STRINGS.video.suggestedQuestions}</p>
            <div className="suggestion-chips">
              {suggestedQuestions.map((q, i) => (
                <button
                  key={i}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => handleChipClick(q)}
                  disabled={isStreaming || disabled}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {allMessages.map((msg, i) => (
          <MessageBubble
            key={msg.id || `${msg.role}-${i}`}
            role={msg.role}
            content={msg.content}
            contentType={msg.content_type || 'text'}
            modelName="AI"
          />
        ))}

        {isStreaming && !streamingText && (
          <div className="message assistant">
            <div className="message-avatar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
              </svg>
            </div>
            <div className="message-content">
              <div className="message-role">AI</div>
              {statusText ? (
                <div className="status-text">{statusText}</div>
              ) : (
                <div className="typing-indicator">
                  <span></span><span></span><span></span>
                </div>
              )}
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="video-chat-input-area">
        <form onSubmit={handleSubmit} className="video-chat-form">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? STRINGS.video.chatDisabled : hasModels ? STRINGS.video.chatPlaceholder : STRINGS.video.noModel}
            rows={1}
            disabled={isStreaming || disabled || !hasModels}
          />
          <div className="video-chat-form-bottom">
            <ModelDropdown
              selectedModel={selectedModel}
              onModelChange={onModelChange}
              modelOptions={modelOptions}
              modelNameById={modelNameById}
              disabled={isStreaming || disabled || isModelLocked}
            />
            <button type="submit" disabled={!input.trim() || isStreaming || disabled || !hasModels}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          </div>
        </form>
        {isModelLocked && <div className="video-chat-model-hint">{STRINGS.video.modelFixed}</div>}
      </div>
    </div>
  );
}
