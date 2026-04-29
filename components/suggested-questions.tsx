'use client';

interface Props {
  questions: string[];
  onPick: (q: string) => void;
}

export function SuggestedQuestions({ questions, onPick }: Props) {
  if (!questions.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q, i) => (
        <button
          key={i}
          onClick={() => onPick(q)}
          className="rounded-full border bg-background px-3 py-1 text-xs hover:bg-accent"
        >
          {q}
        </button>
      ))}
    </div>
  );
}
