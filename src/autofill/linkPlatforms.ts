import type { Profile } from '../types/profile';
import { normalize } from './normalizer';

type LinkQuestion = {
  label?: string;
  ariaLabel?: string;
  visibleLabel?: string;
  placeholder?: string;
  name?: string;
  id?: string;
};
/** Exact platform names remain different even when their spelling is similar. */
export function linkPlatform(text: string): string | null {
  const match =
    /^(?:your|my)?(github|gitlab|bitbucket|linkedin|instagram|facebook|vk|tiktok|twitter|xtwitter|x|dribbble|behance|stackoverflow|youtube)(?:(?:profile|url|link|account|optional|required))*$/.exec(
      normalize(text),
    );
  if (!match) return null;
  return ['x', 'xtwitter'].includes(match[1]) ? 'twitter' : match[1];
}
export function requestedLinkPlatform(question: LinkQuestion): string | null {
  const primary = [
    question.label,
    question.ariaLabel,
    question.visibleLabel,
    question.placeholder,
  ].find((text) => text?.trim());
  if (primary) return linkPlatform(primary);
  for (const text of [question.name, question.id]) {
    const platform = text && linkPlatform(text);
    if (platform) return platform;
  }
  return null;
}
export function compatibleLinkPath(
  profile: Profile,
  question: LinkQuestion,
  path: string,
): boolean {
  const requested = requestedLinkPlatform(question);
  if (!requested) return true;
  const custom = /^links\.custom\.(\d+)\.url$/.exec(path);
  const candidate = custom
    ? linkPlatform(profile.links?.custom?.[Number(custom[1])]?.label ?? '')
    : /^links\.[a-z]+$/.test(path)
      ? linkPlatform(path.slice('links.'.length))
      : null;
  return candidate === requested;
}
