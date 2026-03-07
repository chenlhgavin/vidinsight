import { useState } from 'react';
import { changePassword } from '../api';
import './ChangePasswordModal.css';

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      setSuccess(true);
      setTimeout(() => onClose(), 1500);
    } catch (err) {
      setError(err.message || 'Failed to change password');
    } finally {
      setSubmitting(false);
    }
  }

  function handleBackdropClick(e) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  return (
    <div className="cpw-overlay" onMouseDown={handleBackdropClick}>
      <div className="cpw-modal">
        <div className="cpw-header">
          <h2 className="cpw-title">Change Password</h2>
          <button type="button" className="cpw-close" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {success ? (
          <div className="cpw-success">Password changed successfully</div>
        ) : (
          <form onSubmit={handleSubmit} className="cpw-form">
            {error && <div className="cpw-error">{error}</div>}

            <div className="cpw-field">
              <label htmlFor="cpw-current">Current Password</label>
              <input
                id="cpw-current"
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
                required
              />
            </div>

            <div className="cpw-field">
              <label htmlFor="cpw-new">New Password</label>
              <input
                id="cpw-new"
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <span className="cpw-hint">Minimum 8 characters</span>
            </div>

            <div className="cpw-field">
              <label htmlFor="cpw-confirm">Confirm New Password</label>
              <input
                id="cpw-confirm"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>

            <div className="cpw-actions">
              <button type="button" className="cpw-btn cpw-btn--cancel" onClick={onClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="cpw-btn cpw-btn--submit"
                disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
              >
                {submitting ? 'Saving...' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
