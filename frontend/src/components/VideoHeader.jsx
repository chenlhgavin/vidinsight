import { useNavigate } from 'react-router-dom';
import logoImg from '../assets/logo-header.png';
import UserMenu from './UserMenu';
import './VideoHeader.css';

export default function VideoHeader({ onBack }) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else {
      navigate('/');
    }
  };

  return (
    <div className="video-header">
      <button type="button" className="video-header-back" onClick={handleBack} aria-label="Back to home">
        <img src={logoImg} alt="VidInsight" className="video-header-logo" />
      </button>
      <UserMenu />
    </div>
  );
}
