import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import STRINGS from '../i18n';
import { listVideoConversations, listModels, analyzeVideo, checkVideoCache } from '../api';
import ModelDropdown from '../components/ModelDropdown';
import heroImg from '../assets/hero-illustration.png';
import emptyHistoryImg from '../assets/empty-history.png';
import loadingImg from '../assets/loading-analyze.png';
import UserMenu from '../components/UserMenu';
import './LandingPage.css';

function extractVideoId(url) {
  const match = url.match(
    /(?:youtube\.com\/(?:live\/|[^/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/(?:live\/)?)([^"&?/\s]{11})/,
  );
  return match ? match[1] : null;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [url, setUrl] = useState('');
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [recentAnalyses, setRecentAnalyses] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState('');
  const [analyzeError, setAnalyzeError] = useState('');

  const modelNameById = useMemo(() => models.reduce((acc, model) => {
    acc[model.id] = model.name;
    return acc;
  }, {}), [models]);

  const resolveSelectedModel = useCallback(() => {
    if (selectedModel) return selectedModel;
    const qwen = models.find((model) => model.id === 'qwen');
    return qwen?.id || models[0]?.id || 'qwen';
  }, [models, selectedModel]);

  useEffect(() => {
    Promise.allSettled([listVideoConversations(), listModels()])
      .then(([conversationsResult, modelsResult]) => {
        if (conversationsResult.status === 'fulfilled') {
          setRecentAnalyses(conversationsResult.value);
        }
        if (modelsResult.status === 'fulfilled') {
          setModels(modelsResult.value);
          const qwen = modelsResult.value.find((model) => model.id === 'qwen');
          setSelectedModel((prev) => prev || qwen?.id || modelsResult.value[0]?.id || 'qwen');
        }
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    const model = resolveSelectedModel();

    const videoId = extractVideoId(trimmed);
    if (!videoId) return;

    setAnalyzing(true);
    setAnalyzeError('');
    setLoadingPhase('cache');

    try {
      const cacheResult = await checkVideoCache(trimmed, model);
      if (cacheResult.cached) {
        navigate(`/analyze/${cacheResult.conversation_id}`);
        return;
      }

      await analyzeVideo(trimmed, {
        onStatus: (text) => setLoadingPhase(text),
        onDone: (conversationId) => {
          if (conversationId) {
            navigate(`/analyze/${conversationId}`);
            return;
          }
          navigate(`/analyze/${videoId}?url=${encodeURIComponent(trimmed)}&model=${encodeURIComponent(model)}`);
        },
        onError: (msg) => {
          setAnalyzing(false);
          setAnalyzeError(msg);
          setLoadingPhase('');
        },
        onVideoInfo: () => {},
        onTranscript: () => {},
        onAnalysisStart: () => {},
        onTopics: () => {},
        onAnalysis: () => {},
        onCached: (data) => {
          if (data?.conversation_id) {
            navigate(`/analyze/${data.conversation_id}`);
            return;
          }
          navigate(`/analyze/${videoId}?url=${encodeURIComponent(trimmed)}&model=${encodeURIComponent(model)}`);
        },
      }, '', model);
    } catch (err) {
      setAnalyzing(false);
      setAnalyzeError(err.message);
      setLoadingPhase('');
    }
  };

  const handleOpenHistory = (item) => {
    navigate(`/analyze/${item.id}`);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getLoadingText = () => {
    switch (loadingPhase) {
      case 'fetching': return STRINGS.analyze.stageFetching;
      case 'generating': return STRINGS.analyze.stageGenerating;
      case 'processing': return STRINGS.analyze.stageProcessing;
      case 'cache': return STRINGS.analyze.loadingCached;
      default: return STRINGS.analyze.analyzing;
    }
  };

  return (
    <div className="landing-page">
      <div className="landing-user-menu">
        <UserMenu />
      </div>

      {analyzing && (
        <div className="landing-analyzing-overlay">
          <div className="landing-analyzing-content">
            <img src={loadingImg} alt="" className="landing-loading-img" aria-hidden="true" />
            <p className="landing-analyzing-text">{STRINGS.landing.analyzingTitle}</p>
            <p className="landing-analyzing-phase">{getLoadingText()}</p>
          </div>
        </div>
      )}

      <div className="landing-center">
        <img src={heroImg} alt="" className="landing-hero-img" aria-hidden="true" />
        <h1 className="landing-heading">{STRINGS.landing.title}</h1>
        <p className="landing-subtitle">{STRINGS.landing.subtitle}</p>

        <form className="landing-input-card" onSubmit={handleSubmit}>
          <input
            type="url"
            className="landing-input"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder={STRINGS.landing.urlPlaceholder}
            disabled={analyzing}
          />
          <div className="landing-input-bottom">
            <ModelDropdown
              selectedModel={resolveSelectedModel()}
              onModelChange={setSelectedModel}
              modelOptions={models}
              modelNameById={modelNameById}
              disabled={analyzing}
            />
            <button type="submit" className="landing-submit-btn" disabled={!url.trim() || analyzing}>
              {STRINGS.landing.analyzeBtn}
            </button>
          </div>
        </form>

        {analyzeError && (
          <div className="landing-error">
            <p className="landing-error-text">{analyzeError}</p>
            <button
              type="button"
              className="landing-error-retry"
              onClick={handleSubmit}
            >
              {STRINGS.common.retry}
            </button>
          </div>
        )}

        <div className="landing-history-section">
          <h3 className="landing-history-title">{STRINGS.landing.recentTitle}</h3>
          {recentAnalyses.length > 0 ? (
            <ul className="landing-history-list">
              {recentAnalyses.map((item) => (
                <li key={item.id} className="landing-history-item">
                  <button
                    type="button"
                    className="landing-history-link"
                    onClick={() => handleOpenHistory(item)}
                  >
                    <span className="landing-history-title-text">
                      {item.title || 'Untitled'}
                    </span>
                    <span className="landing-history-date">
                      {formatDate(item.created_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="landing-empty-history">
              <img src={emptyHistoryImg} alt="" className="landing-empty-history-img" aria-hidden="true" />
              <p className="landing-empty-history-text">{STRINGS.landing.empty}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
