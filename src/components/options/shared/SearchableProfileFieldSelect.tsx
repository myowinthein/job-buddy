import { useEffect, useMemo, useRef, useState } from 'react';
import type { Profile } from '@/src/types/profile';
import { buildPickerTree } from '@/src/autofill/profileFieldTree';
import type { Section, SectionItem, OptionRow } from '@/src/autofill/profileFieldTree';

interface Props {
  profile: Partial<Profile>;
  value: string;
  onChange: (fieldPath: string) => void;
  placeholder?: string;
}

function matchesSearch(label: string, q: string): boolean {
  return label.toLowerCase().includes(q);
}

// A cluster (Phone, Date of Birth) is shown if any of its rows match.
function clusterMatches(rows: OptionRow[], q: string): boolean {
  return rows.some((r) => matchesSearch(r.label, q));
}

function findSectionIdFor(sections: Section[], fieldPath: string): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === 'option' && item.fieldPath === fieldPath) return section.id;
      if (item.kind !== 'option' && item.rows.some((r) => r.fieldPath === fieldPath)) return section.id;
    }
  }
  return null;
}

function findSubGroupHeadingFor(sections: Section[], fieldPath: string): string | null {
  for (const section of sections) {
    for (const item of section.items) {
      if (item.kind === 'subgroup' && item.rows.some((r) => r.fieldPath === fieldPath)) return item.heading;
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
export function SearchableProfileFieldSelect({ profile, value, onChange, placeholder = 'Select a profile field…' }: Props) {
  const sections = useMemo(() => buildPickerTree(profile as Profile), [profile]);

  const selectedLabel = useMemo(() => {
    for (const section of sections) {
      for (const item of section.items) {
        if (item.kind === 'option' && item.fieldPath === value) return item.label;
        if (item.kind !== 'option') {
          const row = item.rows.find((r) => r.fieldPath === value);
          if (row) return item.kind === 'subgroup' ? `${item.heading} · ${row.label}` : row.label;
        }
      }
    }
    return null;
  }, [sections, value]);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [collapsedSubGroups, setCollapsedSubGroups] = useState<Set<string>>(new Set());

  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const toggle = () => {
    if (!open) {
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
      setSearch('');
    }
    setOpen((o) => !o);
  };

  useEffect(() => {
    if (open) searchRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const select = (fieldPath: string) => {
    onChange(fieldPath);
    setOpen(false);
    setSearch('');
  };

  const q = search.trim().toLowerCase();

  const toggleSection = (id: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSubGroup = (heading: string) => {
    setCollapsedSubGroups((prev) => {
      const next = new Set(prev);
      if (next.has(heading)) next.delete(heading); else next.add(heading);
      return next;
    });
  };

  const renderRow = (row: OptionRow, indent: boolean) => (
    <div
      key={row.fieldPath}
      role="option"
      aria-selected={row.fieldPath === value}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => select(row.fieldPath)}
      className={`flex items-center gap-2 py-1.5 text-sm cursor-pointer select-none ${indent ? 'pl-5 pr-3' : 'px-3'} ${
        row.fieldPath === value
          ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
      }`}
    >
      <span className="shrink-0 w-2/5 text-xs text-gray-500 dark:text-gray-400 truncate">{row.label}</span>
      <span className="flex-1 min-w-0 truncate font-medium">{row.value}</span>
    </div>
  );

  const renderItem = (item: SectionItem) => {
    if (item.kind === 'option') {
      if (q && !matchesSearch(item.label, q)) return null;
      return renderRow(item, false);
    }
    if (item.kind === 'cluster') {
      if (q && !clusterMatches(item.rows, q)) return null;
      const rows = q ? item.rows.filter((r) => matchesSearch(r.label, q)) : item.rows;
      return (
        <div key={item.heading}>
          <p className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700">
            {item.heading}
          </p>
          {rows.map((r) => renderRow(r, true))}
        </div>
      );
    }
    // subgroup
    const hasMatch = !q || clusterMatches(item.rows, q);
    if (!hasMatch) return null;
    const expanded = q ? true : !collapsedSubGroups.has(item.heading);
    const rows = q ? item.rows.filter((r) => matchesSearch(r.label, q)) : item.rows;
    return (
      <div key={item.heading}>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => toggleSubGroup(item.heading)}
          className="w-full flex items-center justify-between gap-2 px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 border-t border-gray-100 dark:border-gray-700"
        >
          <span className="truncate">{item.heading}</span>
          <span className="shrink-0">{expanded ? '▾' : '▸'}</span>
        </button>
        {expanded && rows.map((r) => renderRow(r, true))}
      </div>
    );
  };

  const visibleSections = sections.filter((section) => {
    if (!q) return true;
    return section.items.some((item) => {
      if (item.kind === 'option') return matchesSearch(item.label, q);
      return clusterMatches(item.rows, q);
    });
  });

  return (
    <div ref={containerRef} className="relative w-full">
      <button
        type="button"
        onClick={toggle}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-left bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 flex items-center gap-2 min-h-[38px]"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selectedLabel ? (
          <span className="flex-1 min-w-0 truncate text-gray-900 dark:text-gray-100">
            {selectedLabel}{' '}
            <span className="text-gray-400 dark:text-gray-500 font-mono text-xs">({value})</span>
          </span>
        ) : (
          <span className="flex-1 text-gray-400 dark:text-gray-500 truncate">{value || placeholder}</span>
        )}
        <span className="text-gray-400 dark:text-gray-500 text-xs shrink-0">▾</span>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-full min-w-[320px] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg dark:shadow-black/40 z-50">
          <div className="p-2 border-b border-gray-100 dark:border-gray-700">
            <input
              ref={searchRef}
              type="text"
              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Search profile fields…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-72 overflow-y-auto py-1" role="listbox">
            {visibleSections.length === 0 ? (
              <p className="px-3 py-3 text-sm text-gray-400 dark:text-gray-500 text-center select-none">
                No matching fields.
              </p>
            ) : (
              visibleSections.map((section) => {
                const isExpanded = q ? true : expandedSections.has(section.id);
                return (
                  <div key={section.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggleSection(section.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-900/70"
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
        </div>
      )}
    </div>
  );
}
