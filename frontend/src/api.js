const API_BASE = '/api';

function getCsrfToken() {
  const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
  return match ? match[1] : '';
}

function handleUnauthorized(res) {
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
}

async function readErrorMessage(res) {
  const contentType = res.headers.get('content-type') || '';

  if (contentType.includes('application/json')) {
    const data = await res.json();
    const error = data?.error;
    if (error?.code && error?.message) {
      return `[${error.code}] ${error.message}`;
    }
    if (error?.message) {
      return error.message;
    }
    if (typeof data?.detail === 'string') {
      return data.detail;
    }
  } else {
    const text = await res.text();
    if (text.trim()) {
      return text.trim();
    }
  }

  return `Request failed with status ${res.status}`;
}

async function requestJson(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const requestOptions = { ...options };
  if (method === 'GET' && requestOptions.cache === undefined) {
    requestOptions.cache = 'no-store';
  }

  if (method !== 'GET') {
    requestOptions.headers = {
      ...requestOptions.headers,
      'X-CSRF-Token': getCsrfToken(),
    };
  }

  const res = await fetch(`${API_BASE}${path}`, requestOptions);
  if (!res.ok) {
    handleUnauthorized(res);
    throw new Error(await readErrorMessage(res));
  }
  return res.json();
}

export async function listModels() {
  return requestJson('/models');
}

export async function checkVideoCache(url, textModel = 'qwen') {
  return requestJson('/video/check-cache', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, text_model: textModel }),
  });
}

export async function listVideoConversations() {
  return requestJson('/video/conversations');
}

export async function createVideoConversation(title = '', model = 'qwen') {
  return requestJson('/video/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, model }),
  });
}

export async function getVideoConversation(id) {
  return requestJson(`/video/conversations/${id}`);
}

export async function deleteVideoConversation(id) {
  return requestJson(`/video/conversations/${id}`, {
    method: 'DELETE',
  });
}

function processSSELine(line, callbacks) {
  if (!line.startsWith('data: ')) return;
  try {
    const data = JSON.parse(line.slice(6));
    if (data.type === 'status') {
      callbacks.onStatus?.(data.text || '');
    } else if (data.type === 'video_info') {
      callbacks.onVideoInfo?.(data.video_info);
    } else if (data.type === 'transcript') {
      callbacks.onTranscript?.(data.transcript);
    } else if (data.type === 'analysis_start') {
      callbacks.onAnalysisStart?.(data);
    } else if (data.type === 'topics') {
      callbacks.onTopics?.(data.topics);
    } else if (data.type === 'text') {
      callbacks.onText?.(data.text);
    } else if (data.type === 'analysis') {
      callbacks.onAnalysis?.(data.analysis, data.conversation_id);
    } else if (data.type === 'cached') {
      callbacks.onCached?.(data);
    } else if (data.type === 'exploration') {
      callbacks.onExploration?.(data.exploration);
    } else if (data.type === 'done') {
      callbacks.onDone?.(data.conversation_id);
    } else if (data.type === 'error') {
      const message = data?.error?.message || data.message || 'Request failed';
      callbacks.onError?.(message);
    }
  } catch (e) {
    console.warn('Failed to parse SSE line:', line, e);
  }
}

async function streamSSE(url, body, callbacks) {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    handleUnauthorized(res);
    throw new Error(await readErrorMessage(res));
  }

  if (!res.body) {
    throw new Error('Streaming response body is empty');
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      processSSELine(line, callbacks);
    }
  }

  if (buffer.trim()) {
    processSSELine(buffer.trim(), callbacks);
  }
}

export async function translateTexts(texts, targetLanguage, context = '') {
  return requestJson('/video/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ texts, target_language: targetLanguage, context }),
  });
}

export async function fetchNotes(conversationId) {
  return requestJson(`/video/notes?conversation_id=${encodeURIComponent(conversationId)}`);
}

export async function createNote({ conversationId, source, text, sourceId, metadata }) {
  return requestJson('/video/notes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversation_id: conversationId,
      source,
      text,
      source_id: sourceId || null,
      metadata: metadata ? JSON.stringify(metadata) : null,
    }),
  });
}

export async function deleteNote(noteId) {
  return requestJson(`/video/notes/${noteId}`, {
    method: 'DELETE',
  });
}

export async function analyzeVideo(url, callbacks, conversationId = '', textModel = 'qwen') {
  return streamSSE('/video/analyze', {
    url,
    conversation_id: conversationId,
    text_model: textModel,
  }, callbacks);
}

export async function sendVideoChat(conversationId, message, callbacks) {
  return streamSSE('/video/chat', {
    conversation_id: conversationId,
    message,
  }, callbacks);
}

export async function exploreVideoTheme(conversationId, theme, callbacks) {
  return streamSSE('/video/explore-theme', {
    conversation_id: conversationId,
    theme,
  }, callbacks);
}

export async function changePassword(currentPassword, newPassword) {
  const res = await fetch(`${API_BASE}/auth/change-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': getCsrfToken(),
    },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!res.ok) {
    const msg = await readErrorMessage(res);
    throw new Error(msg);
  }
  return res.json();
}
