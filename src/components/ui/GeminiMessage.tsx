import { ExternalLink } from 'lucide-react';

export function GeminiMessage({ message }: { message: string }) {
  const label = 'Google AI Studio';
  const index = message.indexOf(label);
  if (index < 0) return <>{message}</>;
  const sentenceEnd = message.indexOf('. ');
  return (
    <>
      {sentenceEnd >= 0 && <span className="block">{message.slice(0, sentenceEnd + 1)}</span>}
      {message.slice(sentenceEnd >= 0 ? sentenceEnd + 1 : 0, index)}
      <a
        href="https://aistudio.google.com/api-keys"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 rounded-sm text-blue-600 underline text-action dark:text-blue-400"
      >
        {label}
        <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
      </a>
      {message.slice(index + label.length)}
    </>
  );
}
