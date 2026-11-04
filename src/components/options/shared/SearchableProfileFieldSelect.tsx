import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';
import type { Profile } from '@/src/types/profile';
import { findCountryByNameOrCode } from '@/src/data/countries';
import {
  PERSONAL_GENDER_OPTIONS,
  PERSONAL_YES_NO_OPTIONS,
  SALARY_PERIOD_OPTIONS,
} from '@/src/profile/fieldPolicies';
import { buildPickerTree } from '@/src/autofill/profileFieldTree';
import type { Section, SectionItem, OptionRow } from '@/src/autofill/profileFieldTree';
import { useDropdownPanel } from './useDropdownPanel';

interface Props {
  profile: Partial<Profile>;
  value: string;
  onChange: (fieldPath: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const PREVIEW_OPTIONS: Record<string, readonly { value: string; label: string }[]> = {
  'personal.gender': PERSONAL_GENDER_OPTIONS,
  'personal.ethnicity': PERSONAL_GENDER_OPTIONS.filter(
    (option) => option.value === 'prefer_not_to_say',
  ),
  'personal.veteranStatus': PERSONAL_YES_NO_OPTIONS,
  'personal.disabilityStatus': PERSONAL_YES_NO_OPTIONS,
  'salary.current.period': SALARY_PERIOD_OPTIONS,
  'salary.expected.$.period': SALARY_PERIOD_OPTIONS,
};

function previewValue(row: OptionRow): string {
  const path = row.fieldPath.replace(/\.\d+(?=\.|$)/g, '.$');
  if (path === 'workAuthorization.$.country')
    return findCountryByNameOrCode(row.value)?.name ?? row.value;
  return PREVIEW_OPTIONS[path]?.find((option) => option.value === row.value)?.label ?? row.value;
}

function matchesSearch(label: string, q: string): boolean {
  const text = label.toLowerCase();
  return q.split(/\s+/).every((word) => text.includes(word));
}

function findSectionIdFor(sections: Section[], fieldPath: string): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === 'option' && item.fieldPath === fieldPath) return section.id;
      if (item.kind !== 'option' && item.rows.some((r) => r.fieldPath === fieldPath))
        return section.id;
    }
  }
  return null;
}

function findSubGroupHeadingFor(sections: Section[], fieldPath: string): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === 'subgroup' && item.rows.some((r) => r.fieldPath === fieldPath))
        return item.heading;
    }
  }
  return null;
}

// Grouped, collapsible field picker — deliberately mirrors picker.ts's own
// on-page picker structure (sections > clusters/subgroups > rows) rather than
// a flat searchable list, since a flat list of 15+ similarly-named fields
// ("Company", "Job Title" repeated per work-history entry) reads as noise.
// Constrains a learned-mapping's path to fields that actually exist and
// currently have a value — typing a raw path by hand let a typo (dead path,
// silently never fills) or a wrong-but-valid path (confidently auto-fills the
// wrong data, since a manual edit is trusted immediately) both through with
// no feedback.
export function SearchableProfileFieldSelect({
  profile,
  value,
  onChange,
  placeholder = 'Select a profile field…',
  disabled = false,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const [position, setPosition] = useState<CSSProperties | null>(null);
  const sections = useMemo(() => buildPickerTree(profile as Profile), [profile]);
  const selectedSectionId = findSectionIdFor(sections, value);
  const selectedSubGroup = findSubGroupHeadingFor(sections, value);

  const selectedLabel = useMemo(() => {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.kind === 'option' && item.fieldPath === value)
          return `${section.label} → ${item.label}`;
        if (item.kind !== 'option') {
          const row = item.rows.find((r) => r.fieldPath === value);
          if (row) return `${section.label} → ${item.heading} → ${row.label}`;
        }
      }
    }
    return null;
  }, [sections, value]);

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Set<string>>(new Set());
  const [hlIdx, setHlIdx] = useState(0);

  const { open, search, setSearch, containerRef, searchRef, toggle, close } = useDropdownPanel({
    panelRef,
    onOpen: () => {
      // Open near the section (and, if applicable, the specific subgroup
      // entry) that currently holds the selected value, same spirit as the
      // on-page picker auto-expanding a relevant section.
      const sectionId = findSectionIdFor(sections, value);
      setExpandedSections(sectionId ? new Set([sectionId]) : new Set());
      const defaultCollapsed = new Set<string>();
      for (const section of sections) {
        for (const item of section.items) {
          if (item.kind === 'subgroup' && item.defaultCollapsed) defaultCollapsed.add(item.heading);
        }
      }
      const currentSubGroup = findSubGroupHeadingFor(sections, value);
      if (currentSubGroup) defaultCollapsed.delete(currentSubGroup);
      setCollapsedSubGroups(defaultCollapsed);
      setHlIdx(0);
    },
  });

  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const select = (fieldPath: string) => {
    onChange(fieldPath);
    close();
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useLayoutEffect(() => {
    if (!open) return;
    let frame = 0;
    const place = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.min(Math.max(rect.width, 320), window.innerWidth - 24);
      const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
      const below = window.innerHeight - rect.bottom - 20;
      const above = rect.top - 20;
      const flip = below < 240 && above > below;
      setPosition({
        position: 'fixed',
        left,
        width,
        maxHeight: Math.max(100, Math.min(360, flip ? above : below)),
        ...(flip ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
      });
    };
    const schedule = () => {
      if (frame) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    place();
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('scroll', schedule, true);
    };
  }, [open]);

  const q = search.trim().toLowerCase();

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSubGroup = (heading: string) => {
    setCollapsedSubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading);
      else next.add(heading);
      return next;
    });
  };

  // One projection owns search and expansion for both DOM and keyboard order.
  type VisibleItem = SectionItem & { expanded?: boolean };
  const visibleSections = sections
    .map((section) => {
      const items: VisibleItem[] = [];
      for (const item of section.items) {
        if (item.kind === 'option') {
          if (!q || matchesSearch(`${section.label} ${item.label}`, q)) items.push(item);
        } else {
          const rows = q
            ? item.rows.filter((row) =>
                matchesSearch(`${section.label} ${item.heading} ${row.label}`, q),
              )
            : item.rows;
          if (q && rows.length === 0) continue;
          items.push({
            ...item,
            rows,
            expanded: item.kind === 'cluster' || !!q || !collapsedSubGroups.has(item.heading),
          });
        }
      }
      return { ...section, items, expanded: !!q || expandedSections.has(section.id) };
    })
    .filter((section) => !q || section.items.length > 0);
  const visibleRowPaths = visibleSections.flatMap((section) =>
    !section.expanded
      ? []
      : section.items.flatMap((item) =>
          item.kind === 'option'
            ? [item.fieldPath]
            : item.expanded
              ? item.rows.map((row) => row.fieldPath)
              : [],
        ),
  );

  const renderRow = (row: OptionRow, indent: boolean) => {
    const isSelected = row.fieldPath === value;
    const isHighlighted = row.fieldPath === highlightedPath;
    return (
      <div
        key={row.fieldPath}
        id={`${listId}-option-${row.fieldPath}`}
        ref={(el) => {
          if (el) rowRefs.current.set(row.fieldPath, el);
          else rowRefs.current.delete(row.fieldPath);
        }}
        role="option"
        aria-selected={isSelected}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => select(row.fieldPath)}
        className={`flex items-start gap-3 py-2 text-sm cursor-pointer select-none ${indent ? 'pl-5 pr-3' : 'px-3'} ${
          isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
            : isHighlighted
              ? 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
        }`}
      >
        <span
          className={`w-2/5 shrink-0 break-words text-xs leading-relaxed ${isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}
        >
          {row.label}
        </span>
        <span className="min-w-0 flex-1 break-words line-clamp-2 font-medium">
          {previewValue(row)}
        </span>
        <span className="flex h-5 w-4 shrink-0 items-center" aria-hidden="true">
          {isSelected && <Check size={16} />}
        </span>
      </div>
    );
  };

  const renderItem = (item: VisibleItem) => {
    if (item.kind === 'option') {
      return renderRow(item, false);
    }
    if (item.kind === 'cluster') {
      const rows = item.rows;
      return (
        <div key={item.heading}>
          <p className="px-3 pt-2 pb-1 text-xs font-semibold text-gray-500 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
            {item.heading}
          </p>
          {rows.map((r) => renderRow(r, true))}
        </div>
      );
    }
    // subgroup
    const expanded = item.expanded;
    const rows = item.rows;
    return (
      <div key={item.heading}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleSubGroup(item.heading)}
          aria-expanded={!!expanded}
          className={`w-full min-h-9 flex items-center justify-between gap-2 px-3 py-2 text-xs leading-4 font-semibold border-t border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${item.heading === selectedSubGroup ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}
        >
          <span className="min-w-0 break-words text-left">{item.heading}</span>
          <span className="shrink-0">{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && rows.map((r) => renderRow(r, true))}
      </div>
    );
  };

  // Clamp for display/selection purposes only — the underlying hlIdx state
  // corrects itself on the next arrow-key press regardless (Math.min/max
  // against the current list length), so no effect is needed to write it back.
  const clampedHlIdx = Math.min(hlIdx, Math.max(visibleRowPaths.length - 1, 0));
  const highlightedPath = visibleRowPaths[clampedHlIdx];

  useEffect(() => {
    if (highlightedPath) rowRefs.current.get(highlightedPath)?.scrollIntoView({ block: 'nearest' });
  }, [highlightedPath]);

  const handleSearchKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
        setHlIdx(Math.min(clampedHlIdx + 1, visibleRowPaths.length - 1));
        e.preventDefault();
        break;
      case 'ArrowUp':
        setHlIdx(Math.max(clampedHlIdx - 1, 0));
        e.preventDefault();
        break;
      case 'Enter':
        if (visibleRowPaths[clampedHlIdx]) select(visibleRowPaths[clampedHlIdx]);
        e.preventDefault();
        break;
      case 'Escape':
        close();
        e.preventDefault();
        e.stopPropagation();
        triggerRef.current?.focus();
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        ref={triggerRef}
        disabled={disabled}
        type="button"
        onClick={toggle}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-h-[38px]"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={selectedLabel ? `Profile field: ${selectedLabel}` : 'Choose a profile field'}
      >
        {selectedLabel ? (
          <span className="min-w-0 flex-1 break-words text-gray-900 dark:text-gray-100">
            {selectedLabel}
          </span>
        ) : (
          <span className="flex-1 text-gray-500 dark:text-gray-400 truncate">
            {value ? 'Choose an available profile field' : placeholder}
          </span>
        )}
        <span className="text-gray-500 dark:text-gray-400 text-xs shrink-0">▾</span>
      </button>

      {open &&
        !disabled &&
        createPortal(
          <div
            ref={panelRef}
            style={position ?? { visibility: 'hidden', position: 'fixed' }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                close();
                triggerRef.current?.focus();
                event.preventDefault();
                event.stopPropagation();
              }
            }}
            className="z-50 flex min-h-0 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800 dark:shadow-black/40"
          >
            <div className="shrink-0 p-2 border-b border-gray-100 dark:border-gray-700">
              <input
                ref={searchRef}
                type="text"
                className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Search profile fields…"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setHlIdx(0);
                }}
                onKeyDown={handleSearchKeyDown}
                role="combobox"
                aria-label="Search profile fields"
                aria-expanded={open}
                aria-controls={listId}
                aria-activedescendant={
                  highlightedPath ? `${listId}-option-${highlightedPath}` : undefined
                }
              />
            </div>
            <div
              id={listId}
              className="min-h-0 overflow-y-auto py-1"
              role="listbox"
              aria-label="Profile fields"
            >
              {visibleSections.length === 0 ? (
                <p className="px-3 py-3 text-sm text-gray-500 dark:text-gray-400 text-center select-none">
                  No matching fields.
                </p>
              ) : (
                visibleSections.map((section) => {
                  const isExpanded = section.expanded;
                  return (
                    <div key={section.id}>
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => toggleSection(section.id)}
                        aria-expanded={isExpanded}
                        className={`w-full min-h-9 flex items-center justify-between gap-2 px-3 py-2 text-[13px] leading-5 font-semibold bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-900/70 ${section.id === selectedSectionId ? 'text-blue-700 dark:text-blue-300' : 'text-gray-500 dark:text-gray-400'}`}
                      >
                        <span className="truncate">{section.label}</span>
                        <span className="shrink-0">{isExpanded ? '▾' : '▸'}</span>
                      </button>
                      {isExpanded && section.items.map((item) => renderItem(item))}
                    </div>
                  );
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
