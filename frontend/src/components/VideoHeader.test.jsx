import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import VideoHeader from './VideoHeader';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

describe('VideoHeader', () => {
  it('uses the VidInsight brand for the logo alt text', () => {
    render(<VideoHeader />);

    expect(screen.getByAltText('VidInsight')).toBeInTheDocument();
  });
});
