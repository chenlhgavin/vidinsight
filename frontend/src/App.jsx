import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LandingPage from './pages/LandingPage';
import AnalyzePage from './pages/AnalyzePage';
import LoginPage from './pages/LoginPage';
import './App.css';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<RequireAuth><LandingPage /></RequireAuth>} />
      <Route path="/analyze/:videoId" element={<RequireAuth><AnalyzePage /></RequireAuth>} />
    </Routes>
  );
}
