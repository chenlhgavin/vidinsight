import { useRef } from 'react';
import { getTopicHSLColor } from '../utils/colorUtils';
import TopicCard from './TopicCard';
import './VideoProgressBar.css';

export default function VideoProgressBar({
  topics,
  currentTime,
  duration,
  activeTopic,
  onSeek,
  onTopicClick,
  videoId,
}) {
  const barRef = useRef(null);

  if (!duration || duration <= 0) return null;

  // Calculate heatmap density
  const buckets = 100;
  const bucketSize = duration / buckets;
  const rawDensity = new Array(buckets).fill(0);

  topics?.forEach((topic) => {
    (topic.segments || []).forEach((seg) => {
      const startBucket = Math.floor(seg.start / bucketSize);
      const endBucket = Math.min(Math.floor(seg.end / bucketSize), buckets - 1);
      for (let i = startBucket; i <= endBucket; i++) {
        rawDensity[i]++;
      }
    });
  });

  const maxDensity = Math.max(...rawDensity, 1);
  const density = rawDensity.map((d) => d / maxDensity);

  // Flatten all segments for rendering
  const allSegments = topics?.flatMap((topic, topicIndex) =>
    (topic.segments || []).map((seg, segIdx) => ({
      key: `${topicIndex}-${segIdx}`,
      topic,
      topicIndex,
      seg,
    }))
  ) || [];

  const handleBarClick = (e) => {
    if (!barRef.current) return;
    const rect = barRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    onSeek?.(ratio * duration);
  };

  const handleSegmentClick = (e, topic) => {
    e.stopPropagation();
    onTopicClick?.(topic);
  };

  const cursorPercent = (currentTime / duration) * 100;

  return (
    <div className="vpb-container">
      {/* Timeline bar */}
      <div className="vpb-bar" ref={barRef} onClick={handleBarClick}>
        {/* Heatmap background */}
        <div className="vpb-heatmap">
          {density.map((d, i) => (
            <div
              key={i}
              className="vpb-heatmap-bucket"
              style={{ opacity: d * 0.2 }}
            />
          ))}
        </div>

        {/* Topic segments */}
        {allSegments.map(({ key, topic, topicIndex, seg }) => {
          const isSelected = activeTopic === topic;
          const left = (seg.start / duration) * 100;
          const width = Math.max(((seg.end - seg.start) / duration) * 100, 1);
          const color = getTopicHSLColor(topicIndex, videoId);

          return (
            <div
              key={key}
              className={`vpb-segment${isSelected ? ' selected' : ''}`}
              style={{
                left: `${left}%`,
                width: `${width}%`,
                backgroundColor: `hsl(${color})`,
                opacity: isSelected ? 1 : 0.7,
              }}
              onClick={(e) => handleSegmentClick(e, topic)}
            />
          );
        })}

        {/* Current time indicator */}
        <div className="vpb-cursor" style={{ left: `${cursorPercent}%` }}>
          <div className="vpb-cursor-dot" />
        </div>
      </div>

      {/* Topic list */}
      <div className="vpb-topics">
        {topics?.map((topic, index) => (
          <TopicCard
            key={topic.title || index}
            topic={topic}
            index={index}
            isActive={activeTopic === topic}
            onClick={onTopicClick}
            videoId={videoId}
          />
        ))}
      </div>
    </div>
  );
}
