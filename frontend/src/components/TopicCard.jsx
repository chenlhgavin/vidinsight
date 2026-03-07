import { getTopicHSLColor } from '../utils/colorUtils';
import './TopicCard.css';

export default function TopicCard({ topic, index, isActive, onClick, videoId }) {
  const color = getTopicHSLColor(index, videoId);

  return (
    <button
      className={`topic-card${isActive ? ' active' : ''}`}
      style={{
        borderLeftColor: `hsl(${color})`,
      }}
      onClick={() => onClick(topic)}
    >
      <div className="topic-card-left">
        <span
          className={`topic-dot${isActive ? ' dot-active' : ''}`}
          style={{ backgroundColor: `hsl(${color})` }}
        />
        <span className="topic-title">{topic.title}</span>
      </div>
      {topic.duration != null && (
        <span className="topic-duration">
          {topic.duration >= 60
            ? `${Math.round(topic.duration / 60)} min`
            : `${Math.round(topic.duration)}s`}
        </span>
      )}
    </button>
  );
}
