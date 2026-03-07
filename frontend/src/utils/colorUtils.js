// Muted, desaturated topic colors for LongCut-style design
const TOPIC_COLORS = [
  '214 25% 72%',  // Soft Blue (muted)
  '267 22% 76%',  // Lavender (muted)
  '158 18% 72%',  // Mint Green (muted)
  '15 45% 78%',   // Coral (muted)
  '43 50% 78%',   // Soft Yellow (muted)
  '320 25% 82%',  // Rose Pink (muted)
  '192 25% 76%',  // Sky Blue (muted)
];

function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function seededShuffle(array, seed) {
  const shuffled = [...array];
  const hashValue = simpleHash(seed);
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom(hashValue + i) * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function getTopicHSLColor(index, videoId) {
  const colors = videoId ? seededShuffle(TOPIC_COLORS, videoId) : TOPIC_COLORS;
  return colors[index % colors.length];
}

export function formatDuration(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
