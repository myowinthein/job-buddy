import { ExternalLink } from 'lucide-react';

export function VersionLink({ className = '' }: { className?: string }) {
  const version = typeof chrome === 'undefined' ? undefined : chrome.runtime?.getManifest?.().version;
  if (!version) return null;

  return (
    <a
      href={`https://github.com/myowinthein/job-buddy/releases/tag/v${encodeURIComponent(version)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`v${version} release notes`}
      title="Read the release notes for this version"
      className={`inline-flex shrink-0 items-center gap-1 rounded-sm text-xs font-normal text-gray-500 hover:text-blue-600 focus-visible:text-blue-600 text-action focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-gray-400 dark:hover:text-blue-400 dark:focus-visible:text-blue-400 ${className}`}
    >
      v{version}
      <ExternalLink aria-hidden="true" className="h-3 w-3 shrink-0" />
    </a>
  );
}
