import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LandingPage from './LandingPage';
import { AuthProvider } from '../contexts/AuthContext';

const navigateMock = vi.fn();
const listVideoConversationsMock = vi.fn();
const listModelsMock = vi.fn();
const analyzeVideoMock = vi.fn();
const checkVideoCacheMock = vi.fn();
const getVideoConversationMock = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => navigateMock,
}));

vi.mock('../api', async () => {
  const actual = await vi.importActual('../api');
  return {
    ...actual,
    listVideoConversations: (...args) => listVideoConversationsMock(...args),
    listModels: (...args) => listModelsMock(...args),
    analyzeVideo: (...args) => analyzeVideoMock(...args),
    checkVideoCache: (...args) => checkVideoCacheMock(...args),
    getVideoConversation: (...args) => getVideoConversationMock(...args),
    subscribeToUnauthorized: vi.fn(() => () => {}),
  };
});

describe('LandingPage', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    navigateMock.mockReset();
    listVideoConversationsMock.mockReset();
    listModelsMock.mockReset();
    analyzeVideoMock.mockReset();
    checkVideoCacheMock.mockReset();
    getVideoConversationMock.mockReset();

    listVideoConversationsMock.mockResolvedValue([]);
    listModelsMock.mockResolvedValue([
      { id: 'qwen', name: 'Qwen', description: 'Fast' },
      { id: 'deepseek', name: 'DeepSeek', description: 'Thoughtful' },
    ]);
    checkVideoCacheMock.mockResolvedValue({ cached: false });
    analyzeVideoMock.mockImplementation(async (_url, callbacks) => {
      callbacks.onDone?.('conv-123');
    });
  });

  it('submits the selected model for video analysis', async () => {
    const user = userEvent.setup();

    render(
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(listModelsMock).toHaveBeenCalled();
    });

    await user.click(screen.getByRole('button', { name: /qwen/i }));
    await user.click(screen.getByText('DeepSeek'));
    await user.type(screen.getByPlaceholderText(/paste a youtube video url/i), 'https://youtu.be/dQw4w9WgXcQ');
    await user.click(screen.getByRole('button', { name: /analyze/i }));

    await waitFor(() => {
      expect(checkVideoCacheMock).toHaveBeenCalledWith('https://youtu.be/dQw4w9WgXcQ', 'deepseek');
      expect(analyzeVideoMock).toHaveBeenCalledWith(
        'https://youtu.be/dQw4w9WgXcQ',
        expect.any(Object),
        '',
        'deepseek',
      );
      expect(navigateMock).toHaveBeenCalledWith('/analyze/conv-123');
    });
  });

  it('shows the VidInsight brand and full product name', async () => {
    render(
      <AuthProvider>
        <LandingPage />
      </AuthProvider>
    );

    expect(await screen.findByRole('heading', { name: 'VidInsight' })).toBeInTheDocument();
    expect(screen.getByText('Video Insight - AI驱动的YouTube视频分析工具')).toBeInTheDocument();
  });
});
