import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Sparkles,
  LoaderCircle,
  ListChecks,
} from 'lucide-react';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings, LearnedMappingValue } from '@/src/types/storage';
import {
  getProfile,
  getLearnedMappings,
  saveLearnedMappings,
  getLearningContext,
} from '@/src/utils/storage';
import { readableMappings } from '@/src/utils/learnedMappingData';
import { resolveProfileValue } from '@/src/autofill/resolver';
import { LEARNED_MAPPING_THRESHOLD } from '@/src/autofill/constants';
import { profileData } from '@/src/utils/profileData';
import { equalJsonValues } from '@/src/utils/equalJsonValues';
import { feedback } from '@/src/ui/feedback';
import { useToast } from '@/src/components/ui/useToast';
import { RetryNotice } from '@/src/components/ui/RetryNotice';
import { ConfirmRemoveButton } from './shared/ConfirmRemoveButton';
import { SearchableProfileFieldSelect } from './shared/SearchableProfileFieldSelect';
import { fieldCls } from './shared/fieldCls';
import { LearnedMappingsHelp } from './LearnedMappingsHelp';
import { MappingReviewDialog } from './MappingReviewDialog';
import {
  groupMappings,
  type MappingGroup,
  type MappingStatus,
} from '@/src/learned-mappings/groups';
import { mappingDestination, matchesMapping, profileFieldLabels } from './learnedMappingsView';

const secondary =
  'rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800';
const primary =
  'rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50';
const action =
  'rounded-md px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800';
const statusColors = {
  Trusted: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  Learning: 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  Inactive: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const profileKey = (profile: Partial<Profile>) => JSON.stringify(profileData(profile));
const same = equalJsonValues;
const SITES_PER_PAGE = 5;
const MAPPINGS_PER_BATCH = 20;

interface MappingRowProps {
  group: MappingGroup;
  domain: string;
  profile: Partial<Profile>;
  revision: string;
  destination: string;
  availableFields: Map<string, string>;
  busy: string | null;
  onUpdate: (
    group: MappingGroup,
    path: string,
    reviewedProfile: Partial<Profile>,
  ) => Promise<boolean>;
  onDelete: (group: MappingGroup) => Promise<boolean>;
  onAfterDelete: () => void;
}
function MappingRow({
  group,
  domain,
  profile,
  revision,
  destination,
  availableFields,
  busy,
  onUpdate,
  onDelete,
  onAfterDelete,
}: MappingRowProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(group.path);
  const [reviewedProfile, setReviewedProfile] = useState(profile);
  const [reviewedRevision, setReviewedRevision] = useState(revision);
  const [reviewedGroup, setReviewedGroup] = useState(group);
  const editRef = useRef<HTMLButtonElement>(null);
  const rowId = useId();
  const operation = `${domain}:${group.id}`;
  const saving = busy === `save:${operation}`;
  const deleting = busy === `delete:${operation}`;
  const profileChanged = editing && revision !== reviewedRevision;
  const mappingChanged = editing && !same(group.members, reviewedGroup.members);
  const value = availableFields.has(editValue)
    ? resolveProfileValue(profile as Profile, editValue)
    : null;
  const unchanged = editValue === group.path && group.status === 'Trusted';
  const cancelEdit = () => {
    if (saving) return;
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  };
  return (
    <div
      role="group"
      aria-labelledby={rowId}
      tabIndex={-1}
      className="min-w-0 border-b border-gray-100 py-4 last:border-b-0 dark:border-gray-800"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && editing && !saving) {
          event.stopPropagation();
          cancelEdit();
        }
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-x-4">
        <div className="min-w-0 flex-1">
          <p
            id={rowId}
            className={`break-words text-sm font-medium ${group.title === 'Unlabelled field' ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}
          >
            {group.title}
          </p>
          {!editing && (
            <p className="mt-1 break-words text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {destination}
            </p>
          )}
        </div>
        <div className="flex items-center justify-between gap-3 sm:self-start">
          <span className={`shrink-0 rounded-md px-2 py-1 text-xs ${statusColors[group.status]}`}>
            {group.status}
          </span>
          {!editing && (
            <ConfirmRemoveButton
              title={`Delete mapping ${group.title} on ${domain}`}
              compact
              disabled={!!busy}
              busy={deleting}
              onConfirm={() => {
                void onDelete(group).then((deleted) => {
                  if (deleted) requestAnimationFrame(onAfterDelete);
                });
              }}
              leadingAction={
                <button
                  ref={editRef}
                  type="button"
                  disabled={!!busy}
                  aria-label={`Edit ${group.title} on ${domain}`}
                  title="Edit mapping"
                  className={`${action} grid h-8 w-8 place-items-center`}
                  onClick={() => {
                    setEditValue(group.path);
                    setReviewedProfile(profile);
                    setReviewedRevision(revision);
                    setReviewedGroup(group);
                    setEditing(true);
                  }}
                >
                  <Pencil aria-hidden="true" className="h-4 w-4" />
                </button>
              }
            />
          )}
        </div>
      </div>
      {editing && (
        <div className="mt-3 max-w-2xl space-y-3">
          <p className="text-xs font-medium text-gray-700 dark:text-gray-300">Profile field</p>
          <SearchableProfileFieldSelect
            autoFocus
            disabled={!!busy}
            profile={profile}
            value={editValue}
            onChange={(path) => {
              setEditValue(path);
              setReviewedProfile(profile);
              setReviewedRevision(revision);
            }}
          />
          {value && (
            <p className="break-words text-xs leading-relaxed text-gray-600 dark:text-gray-300">
              Current value: <span className="font-medium">{value}</span>
            </p>
          )}
          {(profileChanged || mappingChanged) && (
            <p role="alert" className="text-xs text-amber-800 dark:text-amber-300">
              {mappingChanged ? feedback.mappingChanged : feedback.mappingProfileChanged}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!!busy || !value || unchanged || profileChanged || mappingChanged}
              aria-busy={saving}
              className={`inline-flex items-center justify-center gap-2 ${primary}`}
              onClick={async () => {
                if (await onUpdate(reviewedGroup, editValue, reviewedProfile)) {
                  setEditing(false);
                  requestAnimationFrame(() => editRef.current?.focus());
                }
              }}
            >
              {saving && <LoaderCircle aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none" />}
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" disabled={saving} onClick={cancelEdit} className={secondary}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MappingSite({
  domain,
  groups,
  total,
  expanded,
  onToggle,
  onDeleteSite,
  busy,
  profile,
  revision,
  labels,
  onUpdate,
  onDelete,
  onFallbackFocus,
}: {
  domain: string;
  groups: MappingGroup[];
  total: number;
  expanded: boolean;
  onToggle: () => void;
  onDeleteSite: () => Promise<boolean>;
  busy: string | null;
  profile: Partial<Profile>;
  revision: string;
  labels: Map<string, string>;
  onUpdate: MappingRowProps['onUpdate'];
  onDelete: MappingRowProps['onDelete'];
  onFallbackFocus: () => void;
}) {
  const [visibleCount, setVisibleCount] = useState(MAPPINGS_PER_BATCH);
  const headerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const remaining = Math.max(0, groups.length - visibleCount);
  const deleting = busy === `site:${domain}`;
  return (
    <section
      aria-label={`Mappings for ${domain}`}
      className="mb-3 min-w-0 rounded-xl border border-gray-200 dark:border-gray-700"
    >
      <div
        data-mapping-site-header=""
        className={`flex items-center gap-2 bg-gray-50 px-3 dark:bg-gray-800/60 ${expanded ? 'rounded-t-xl' : 'rounded-xl'}`}
      >
        <h3 className="min-w-0 flex-1">
          <button
            ref={headerRef}
            data-mapping-site-toggle=""
            type="button"
            disabled={!!busy}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={onToggle}
            className="flex w-full items-center gap-3 rounded-md py-3 text-left focus-visible:outline-none disabled:opacity-60"
          >
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${expanded ? '' : '-rotate-90'}`}
            />
            <span className="min-w-0">
              <span className="block break-all text-sm font-medium text-gray-900 dark:text-gray-100">
                {domain}
              </span>
              <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                {groups.length === total
                  ? `${total} mapping${total === 1 ? '' : 's'}`
                  : `${groups.length} of ${total} mappings`}
              </span>
            </span>
          </button>
        </h3>
        <ConfirmRemoveButton
          title={`Delete all mappings for ${domain}`}
          disabled={!!busy}
          busy={deleting}
          onConfirm={() => {
            void onDeleteSite().then((deleted) => {
              if (deleted) requestAnimationFrame(onFallbackFocus);
            });
          }}
        />
      </div>
      <div
        ref={panelRef}
        id={panelId}
        hidden={!expanded}
        className={expanded ? 'border-t border-gray-200 px-4 dark:border-gray-700' : undefined}
      >
        {expanded &&
          groups
            .slice(0, visibleCount)
            .map((group) => (
              <MappingRow
                key={group.id}
                group={group}
                domain={domain}
                profile={profile}
                revision={revision}
                destination={mappingDestination(group.path, labels)}
                availableFields={labels}
                busy={busy}
                onUpdate={onUpdate}
                onDelete={onDelete}
                onAfterDelete={() => (headerRef.current ?? { focus: onFallbackFocus }).focus()}
              />
            ))}
        {expanded && groups.length > MAPPINGS_PER_BATCH && (
          <div className="flex flex-wrap items-center gap-3 py-4">
            <p role="status" className="text-xs text-gray-500 dark:text-gray-400">
              Showing {Math.min(visibleCount, groups.length)} of {groups.length} mappings
            </p>
            {remaining > 0 && (
              <button
                type="button"
                disabled={!!busy}
                className={secondary}
                onClick={() => {
                  const firstNew = visibleCount;
                  setVisibleCount((count) => count + MAPPINGS_PER_BATCH);
                  requestAnimationFrame(() => {
                    const row =
                      panelRef.current?.querySelectorAll<HTMLElement>('[role="group"]')[firstNew];
                    row?.focus({ preventScroll: true });
                    row?.scrollIntoView({ block: 'nearest' });
                  });
                }}
              >
                Show {Math.min(MAPPINGS_PER_BATCH, remaining)} more
                <span className="sr-only"> mappings for {domain}</span>
              </button>
            )}
            {remaining > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {remaining} remaining
              </span>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

export function LearnedMappingsSection({
  onProfileChange,
  onGoToApiKey,
}: {
  onProfileChange?: (profile: Partial<Profile>) => void;
  onGoToApiKey?: () => void;
} = {}) {
  const { showToast } = useToast();
  const [mappings, setMappings] = useState<LearnedMappings>({});
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [loading, setLoading] = useState(true);
  const [reloading, setReloading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reviewBase, setReviewBase] = useState<{
    profile: Partial<Profile>;
    mappings: LearnedMappings;
  } | null>(null);
  const busyRef = useRef(false);
  const live = useRef(false);
  const sequence = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | MappingStatus>('All');
  const [sitePage, setSitePage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filteredCollapsed, setFilteredCollapsed] = useState<Set<string>>(new Set());
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const [next, currentProfile] = await Promise.all([getLearnedMappings(), getProfile()]);
      if (!live.current || request !== sequence.current) return;
      setMappings((previous) => (same(previous, next) ? previous : next));
      setProfile((previous) =>
        same(previous, currentProfile ?? {}) ? previous : (currentProfile ?? {}),
      );
      onProfileChange?.(currentProfile ?? {});
      setLoadError(false);
    } catch {
      if (live.current && request === sequence.current) setLoadError(true);
    } finally {
      if (live.current && request === sequence.current) {
        setLoading(false);
        setReloading(false);
      }
    }
  }, [onProfileChange]);
  useEffect(() => {
    live.current = true;
    const requests = sequence;
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      if ('learnedMappings' in changes)
        setMappings(readableMappings(changes.learnedMappings.newValue, true));
      if (
        'profile' in changes ||
        'learnedMappings' in changes ||
        'learnedMappingsRevision' in changes
      )
        void refresh();
    };
    chrome.storage.onChanged.addListener(changed);
    const initial = setTimeout(() => void refresh(), 0);
    return () => {
      clearTimeout(initial);
      live.current = false;
      requests.current++;
      chrome.storage.onChanged.removeListener(changed);
    };
  }, [refresh]);
  const groupsBySite = useMemo(() => groupMappings(mappings), [mappings]);
  const revision = useMemo(() => profileKey(profile), [profile]);
  const labels = useMemo(() => profileFieldLabels(profile), [profile]);
  const sites = useMemo(
    () =>
      [...groupsBySite.keys()].sort(
        (a, b) => groupsBySite.get(b)!.length - groupsBySite.get(a)!.length || a.localeCompare(b),
      ),
    [groupsBySite],
  );
  const { counts, shown, shownSites } = useMemo(() => {
    const searched = sites
      .flatMap((domain) => groupsBySite.get(domain)!.map((group) => ({ domain, group })))
      .filter(({ domain, group }) =>
        matchesMapping(group, domain, search, mappingDestination(group.path, labels)),
      );
    const counts = { All: searched.length, Trusted: 0, Learning: 0, Inactive: 0 };
    for (const { group } of searched) counts[group.status]++;
    const shown = searched.filter(({ group }) => filter === 'All' || group.status === filter);
    const shownDomains = new Set(shown.map((entry) => entry.domain));
    return { counts, shown, shownSites: sites.filter((domain) => shownDomains.has(domain)) };
  }, [sites, groupsBySite, labels, search, filter]);
  const lastPage = Math.max(0, Math.ceil(shownSites.length / SITES_PER_PAGE) - 1);
  const currentPage = Math.min(sitePage, lastPage);
  // Deleting the last site on a page must not leave an empty or stale page selected.
  if (sitePage !== currentPage) setSitePage(currentPage);
  const firstSite = currentPage * SITES_PER_PAGE;
  const pagedSites = shownSites.slice(firstSite, firstSite + SITES_PER_PAGE);
  const filtering = !!search.trim() || filter !== 'All';
  const mappingSummary = `${shown.length} mapping${shown.length === 1 ? '' : 's'} across ${shownSites.length} site${shownSites.length === 1 ? '' : 's'}`;

  const mutate = async (
    key: string,
    domain: string,
    expected: [string, LearnedMappingValue][],
    capturedProfile: Partial<Profile>,
    change: (fresh: LearnedMappings) => LearnedMappings,
    message: string,
    wholeSite = false,
  ): Promise<boolean> => {
    if (busyRef.current) return false;
    busyRef.current = true;
    setBusy(key);
    try {
      const context = await getLearningContext(
        capturedProfile.id ? (capturedProfile as Profile) : null,
      );
      if (!context) throw new Error('Profile changed before saving');
      const fresh = await getLearnedMappings();
      if (
        wholeSite
          ? !same(fresh[domain], Object.fromEntries(expected))
          : expected.some(([signal, value]) => !same(fresh[domain]?.[signal], value))
      )
        throw new Error('Learned mapping changed before saving');
      await saveLearnedMappings(change(fresh), { base: fresh, context, strictBase: true });
      await refresh();
      showToast('success', message);
      return true;
    } catch (error) {
      showToast(
        'error',
        error instanceof Error && error.message.startsWith('Profile changed')
          ? feedback.mappingProfileChanged
          : error instanceof Error && error.message.startsWith('Learned mapping changed')
            ? feedback.mappingChanged
            : feedback.sectionSaveFailed,
      );
      await refresh();
      return false;
    } finally {
      busyRef.current = false;
      if (live.current) setBusy(null);
    }
  };
  const update = (
    domain: string,
    group: MappingGroup,
    path: string,
    reviewedProfile: Partial<Profile>,
  ) =>
    mutate(
      `save:${domain}:${group.id}`,
      domain,
      group.members,
      reviewedProfile,
      (fresh) => ({
        ...fresh,
        [domain]: {
          ...fresh[domain],
          ...Object.fromEntries(
            group.members.map(([signal]) => {
              const previous = fresh[domain][signal];
              const metadata: Partial<Exclude<LearnedMappingValue, string>> =
                typeof previous === 'string' ? {} : { ...previous };
              delete metadata.inactive;
              return [
                signal,
                { ...metadata, path, count: LEARNED_MAPPING_THRESHOLD, scope: 'entry' as const },
              ];
            }),
          ),
        },
      }),
      feedback.mappingSaved,
    );
  const remove = (domain: string, group: MappingGroup) =>
    mutate(
      `delete:${domain}:${group.id}`,
      domain,
      group.members,
      profile,
      (fresh) => {
        const next = { ...fresh, [domain]: { ...fresh[domain] } };
        for (const [signal] of group.members) delete next[domain][signal];
        if (!Object.keys(next[domain]).length) delete next[domain];
        return next;
      },
      feedback.mappingDeleted,
    );
  const removeSite = (domain: string) =>
    mutate(
      `site:${domain}`,
      domain,
      Object.entries(mappings[domain]),
      profile,
      (fresh) => {
        const next = { ...fresh };
        delete next[domain];
        return next;
      },
      feedback.mappingsSiteDeleted,
      true,
    );

  return (
    <section aria-label="Learned Mappings">
      <header className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex items-center gap-2">
            <h2
              ref={headingRef}
              tabIndex={-1}
              className="text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              Learned Mappings
            </h2>
            <LearnedMappingsHelp />
          </div>
          <button
            type="button"
            className={secondary}
            disabled={loading || loadError || !!busy || !Object.keys(mappings).length}
            onClick={() => setReviewBase(structuredClone({ profile, mappings }))}
          >
            <span className="flex items-center gap-1.5">
              Review Mappings
              <Sparkles
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400"
              />
            </span>
          </button>
        </div>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Review and manage the profile fields remembered for each site
        </p>
      </header>
      {reviewBase && (
        <MappingReviewDialog
          {...reviewBase}
          onGoToApiKey={onGoToApiKey}
          onClose={() => setReviewBase(null)}
          onSaved={() => {
            setReviewBase(null);
            void refresh();
            showToast('success', feedback.mappingReviewSaved);
          }}
        />
      )}
      {loadError && (
        <div className="mb-4">
          <RetryNotice busy={reloading} onRetry={() => {
            setReloading(true);
            void refresh();
          }}>
            {feedback.mappingsLoadFailed}
          </RetryNotice>
        </div>
      )}
      {loading ? (
        <p
          role="status"
          aria-label="Loading learned mappings"
          className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
        >
          <LoaderCircle
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          Loading learned mappings…
        </p>
      ) : !sites.length ? (
        !loadError && (
          <div
            role="status"
            className="rounded-xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-gray-700"
          >
            <ListChecks
              aria-hidden="true"
              className="mx-auto mb-3 h-8 w-8 text-gray-400 dark:text-gray-500"
            />
            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
              No learned mappings yet
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Correct an answer on a job form to start learning.
            </p>
          </div>
        )
      ) : (
        <>
          <input
            ref={searchRef}
            type="search"
            aria-label="Search mappings"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setSitePage(0);
              setFilteredCollapsed(new Set());
            }}
            placeholder="Search sites, questions, or profile fields"
            className={fieldCls()}
          />
          <div className="my-3 flex flex-wrap items-center justify-between gap-3">
            <div role="group" aria-label="Mapping status filters" className="flex flex-wrap gap-2">
              {(['All', 'Trusted', 'Learning', 'Inactive'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  aria-pressed={filter === status}
                  disabled={status !== 'All' && counts[status] === 0 && filter !== status}
                  onClick={() => {
                    setFilter(status);
                    setSitePage(0);
                    setFilteredCollapsed(new Set());
                  }}
                  className={`rounded-md border px-2.5 py-1.5 text-xs focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40 ${filter === status ? 'border-blue-500 bg-blue-50 text-blue-700 dark:border-blue-400 dark:bg-blue-950/50 dark:text-blue-300' : 'border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}`}
                >
                  {status} ({counts[status]})
                </button>
              ))}
            </div>
          </div>
          {!shown.length && (
            <p
              role="status"
              className="rounded-lg bg-gray-50 p-4 text-sm text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            >
              No mappings match this search or filter.
            </p>
          )}
          {shownSites.length > SITES_PER_PAGE && (
            <nav
              aria-label="Learned mapping sites"
              className="mb-3 flex items-center justify-between gap-3"
            >
              <p
                role="status"
                className="flex flex-wrap items-center gap-x-1 text-xs text-gray-500 dark:text-gray-400"
              >
                <span>{mappingSummary}</span>
                <span aria-hidden="true">·</span>
                <span>
                  Sites {firstSite + 1}–{Math.min(firstSite + SITES_PER_PAGE, shownSites.length)} of{' '}
                  {shownSites.length}
                </span>
              </p>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  title="Previous page"
                  className={`${action} grid h-8 w-8 place-items-center disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent`}
                  disabled={!!busy || currentPage === 0}
                  onClick={() => setSitePage(currentPage - 1)}
                >
                  <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  aria-label="Next page"
                  title="Next page"
                  className={`${action} grid h-8 w-8 place-items-center disabled:cursor-default disabled:hover:bg-transparent dark:disabled:hover:bg-transparent`}
                  disabled={!!busy || currentPage === lastPage}
                  onClick={() => setSitePage(currentPage + 1)}
                >
                  <ChevronRight aria-hidden="true" className="h-4 w-4" />
                </button>
              </div>
            </nav>
          )}
          {shown.length > 0 && shownSites.length <= SITES_PER_PAGE && (
            <p role="status" className="mb-3 text-xs text-gray-500 dark:text-gray-400">
              {mappingSummary}
            </p>
          )}
          {pagedSites.map((domain) => (
            <MappingSite
              key={JSON.stringify([profile.id, domain, search, filter])}
              domain={domain}
              groups={shown.filter((entry) => entry.domain === domain).map((entry) => entry.group)}
              total={groupsBySite.get(domain)!.length}
              profile={profile}
              revision={revision}
              labels={labels}
              busy={busy}
              expanded={filtering ? !filteredCollapsed.has(domain) : expanded.has(domain)}
              onToggle={() => {
                const change = (previous: Set<string>) => {
                  const next = new Set(previous);
                  if (next.has(domain)) next.delete(domain);
                  else next.add(domain);
                  return next;
                };
                if (filtering) setFilteredCollapsed(change);
                else setExpanded(change);
              }}
              onUpdate={(group, path, reviewedProfile) =>
                update(domain, group, path, reviewedProfile)
              }
              onDelete={(group) => remove(domain, group)}
              onDeleteSite={() => removeSite(domain)}
              onFallbackFocus={() => (searchRef.current ?? headingRef.current)?.focus()}
            />
          ))}
        </>
      )}
    </section>
  );
}
