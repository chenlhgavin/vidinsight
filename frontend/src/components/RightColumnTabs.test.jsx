import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RightColumnTabs from './RightColumnTabs';

describe('RightColumnTabs', () => {
  it('renders tab buttons and switches content', () => {
    const onTabChange = vi.fn();
    render(
      <RightColumnTabs activeTab="summary" onTabChange={onTabChange}>
        {{
          summary: <div>Summary Content</div>,
          chat: <div>Chat Content</div>,
          transcript: <div>Transcript Content</div>,
          notes: <div>Notes Content</div>,
        }}
      </RightColumnTabs>,
    );

    expect(screen.getByText('Summary')).toBeTruthy();
    expect(screen.getByText('Chat')).toBeTruthy();
    expect(screen.getByText('Transcript')).toBeTruthy();
    expect(screen.getByText('Notes')).toBeTruthy();
    expect(screen.getByText('Summary Content')).toBeTruthy();

    fireEvent.click(screen.getByText('Chat'));
    expect(onTabChange).toHaveBeenCalledWith('chat');
  });
});
