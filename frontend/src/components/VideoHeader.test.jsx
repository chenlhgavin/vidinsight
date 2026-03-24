import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoHeader from './VideoHeader';
import { AuthProvider } from '../contexts/AuthContext';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('VideoHeader', () => {
  it('uses the VidInsight brand for the logo alt text', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    render(
      <AuthProvider>
        <VideoHeader />
      </AuthProvider>
    );

    expect(screen.getByAltText('VidInsight')).toBeInTheDocument();
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });
  });
});
