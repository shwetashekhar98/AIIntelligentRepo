"use client";

interface QuestionPillsProps {
  selected: string;
  onSelect: (id: string) => void;
}

const QUESTIONS = [
  { id: "purpose", label: "What does this repo do?", icon: "◈" },
  { id: "commits", label: "Why recent commits?", icon: "◎" },
  { id: "risks", label: "What could break?", icon: "⬡" },
  { id: "onboarding", label: "Onboard me", icon: "◐" },
];

export default function QuestionPills({ selected, onSelect }: QuestionPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      {QUESTIONS.map((q) => (
        <button
          key={q.id}
          onClick={() => onSelect(q.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
            selected === q.id
              ? "bg-amber-500 text-black"
              : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
          }`}
        >
          <span>{q.icon}</span>
          {q.label}
        </button>
      ))}
    </div>
  );
}
