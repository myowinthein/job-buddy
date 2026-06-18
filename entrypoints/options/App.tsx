import { useState, useEffect, useRef } from 'react';
import type { Profile } from '@/src/types/profile';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { calculateCompletion, getSectionCompletion, FIELD_FOCUS_IDS } from '@/src/utils/profileCompletion';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import { Sidebar } from '@/src/components/options/Sidebar';
import { CompletionBanner } from '@/src/components/options/CompletionBanner';
import { PersonalSection } from '@/src/components/options/PersonalSection';
import { AddressSection } from '@/src/components/options/AddressSection';
import { SalarySection } from '@/src/components/options/SalarySection';
import { WorkAuthorizationSection } from '@/src/components/options/WorkAuthorizationSection';
import { WorkHistorySection } from '@/src/components/options/WorkHistorySection';
import { EducationSection } from '@/src/components/options/EducationSection';
import { LanguagesSection } from '@/src/components/options/LanguagesSection';
import { LinksSection } from '@/src/components/options/LinksSection';
import { DocumentsSection } from '@/src/components/options/DocumentsSection';

type SectionId =
  | 'personal'
  | 'address'
  | 'salary'
  | 'workAuthorization'
  | 'workHistory'
  | 'education'
  | 'languages'
  | 'links'
  | 'documents';

// ── UI state persistence keys (sessionStorage) ───────────────────────────────
const UI_SECTION_KEY  = 'jb:ui:section';
const UI_SIDEBAR_KEY  = 'jb:ui:sidebar';
const UI_SCROLL_KEY   = (section: SectionId) => `jb:ui:scroll:${section}`;

const VALID_SECTIONS = new Set<SectionId>([
  'personal', 'address', 'salary', 'workAuthorization',
  'workHistory', 'education', 'languages', 'links', 'documents',
]);

function readSection(): SectionId {
  try {
    const s = sessionStorage.getItem(UI_SECTION_KEY) as SectionId | null;
    return s && VALID_SECTIONS.has(s) ? s : 'personal';
  } catch { return 'personal'; }
}

function readSidebar(): boolean {
  try { return sessionStorage.getItem(UI_SIDEBAR_KEY) === 'true'; }
  catch { return false; }
}

// ── Autofocus helper (shared between two effects) ────────────────────────────
function focusFirstEmpty(container: Element | null) {
  if (!container) return;
  const inputs = Array.from(
    container.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
      'input[type="text"], input[type="email"], input[type="number"], input[type="url"],' +
      ' input:not([type]), textarea, select',
    ),
  ).filter((el) => !(el as HTMLInputElement).readOnly);
  inputs.find((el) => !el.value)?.focus();
}

function App() {
  const [profile, setProfile] = useState<Partial<Profile>>({});
  // Read synchronously from sessionStorage so the first render shows the
  // correct section/sidebar without any visible jump after refresh.
  const [activeSection, setActiveSection] = useState<SectionId>(readSection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebar);
  const [loading, setLoading] = useState(true);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  const skipAutoFocusRef  = useRef(false);
  const mountedRef        = useRef(false); // skip autofocus on the very first render
  const sectionNavRef     = useRef(false); // skip scroll-reset on the very first render
  const initialLoadDoneRef = useRef(false); // gates the restore-on-load effect
  const activeSectionRef  = useRef(activeSection); // stale-closure-free ref for scroll handler
  const mainRef           = useRef<HTMLElement>(null);

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile()
      .then((p) => { setProfile(p ?? {}); })
      .catch((err) => { console.error('[Job Buddy] Failed to initialize profile:', err); })
      .finally(() => { setLoading(false); });
  }, []);

  // ── Persist active section ──────────────────────────────────────────────────
  useEffect(() => {
    activeSectionRef.current = activeSection;
    try { sessionStorage.setItem(UI_SECTION_KEY, activeSection); } catch { /* storage blocked */ }
  }, [activeSection]);

  // ── Persist sidebar state ───────────────────────────────────────────────────
  useEffect(() => {
    try { sessionStorage.setItem(UI_SIDEBAR_KEY, String(sidebarCollapsed)); } catch { /* storage blocked */ }
  }, [sidebarCollapsed]);

  // ── Save scroll position per section (attached once, uses ref to avoid staleness) ──
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const handler = () => {
      try {
        sessionStorage.setItem(UI_SCROLL_KEY(activeSectionRef.current), String(el.scrollTop));
      } catch { /* storage blocked */ }
    };
    el.addEventListener('scroll', handler, { passive: true });
    return () => el.removeEventListener('scroll', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset scroll to top on section navigation (skip initial mount) ──────────
  // The initial-load restore effect below overrides this for the refresh case.
  useEffect(() => {
    if (!sectionNavRef.current) { sectionNavRef.current = true; return; }
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeSection]);

  // ── Restore scroll + autofocus once after profile loads ─────────────────────
  // Fires exactly once (initialLoadDoneRef guards re-runs). Handles both
  // normal first load (scroll stays at 0) and refresh (scroll is restored).
  useEffect(() => {
    if (loading) return;
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;

    const raf = requestAnimationFrame(() => {
      // Restore saved scroll for this section (0 if never saved)
      try {
        const saved = parseInt(sessionStorage.getItem(UI_SCROLL_KEY(activeSectionRef.current)) ?? '0', 10);
        if (saved > 0) mainRef.current?.scrollTo({ top: saved, behavior: 'instant' });
      } catch { /* storage blocked */ }

      // Autofocus first empty input in the restored section
      if (!skipAutoFocusRef.current) {
        focusFirstEmpty(mainRef.current);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autofocus first empty input when navigating sections (existing) ──────────
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (skipAutoFocusRef.current) { skipAutoFocusRef.current = false; return; }
    const raf = requestAnimationFrame(() => {
      focusFirstEmpty(document.querySelector('main'));
    });
    return () => cancelAnimationFrame(raf);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll to and focus a specific field after navigating from the banner ────
  useEffect(() => {
    if (!focusTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement).focus?.({ preventScroll: true });
      }
      setFocusTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusTarget]);

  const handleSave = async (updates: Partial<Profile>) => {
    const merged = { ...profile, ...updates } as Profile;
    await saveProfile(merged);
    setProfile(merged);
    // Recalculate derived fields after every successful section save and
    // write them back as a separate pass so a derivation error can never
    // block or roll back the primary save.
    try {
      const derived = calculateDerivedFields(merged);
      const withDerived: Profile = { ...merged, derived };
      await saveProfile(withDerived);
      setProfile(withDerived);
    } catch (err) {
      console.error('[Job Buddy] Failed to write derived fields:', err);
    }
  };

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId as SectionId);
  };

  const handleFocusField = (sectionId: string, fieldLabel: string) => {
    skipAutoFocusRef.current = true; // specific field takes over, skip generic autofocus
    setActiveSection(sectionId as SectionId);
    const fieldId = FIELD_FOCUS_IDS[fieldLabel];
    if (fieldId) setFocusTarget(fieldId);
  };

  const completion = calculateCompletion(profile);
  const sectionCompletion = getSectionCompletion(profile);

  const sectionProps = { profile, onSave: handleSave };

  const renderSection = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }
    switch (activeSection) {
      case 'personal':          return <PersonalSection key="personal" {...sectionProps} />;
      case 'address':           return <AddressSection key="address" {...sectionProps} />;
      case 'salary':            return <SalarySection key="salary" {...sectionProps} />;
      case 'workAuthorization': return <WorkAuthorizationSection key="workAuthorization" {...sectionProps} />;
      case 'workHistory':       return <WorkHistorySection key="workHistory" {...sectionProps} />;
      case 'education':         return <EducationSection key="education" {...sectionProps} />;
      case 'languages':         return <LanguagesSection key="languages" {...sectionProps} />;
      case 'links':             return <LinksSection key="links" {...sectionProps} />;
      case 'documents':         return <DocumentsSection key="documents" {...sectionProps} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar
        activeSection={activeSection}
        onSelect={(id) => setActiveSection(id as SectionId)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        sectionCompletion={sectionCompletion}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <CompletionBanner
          percentage={completion.percentage}
          missingGroups={completion.missingGroups}
          onNavigate={handleNavigate}
          onFocusField={handleFocusField}
        />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl">{renderSection()}</div>
        </main>
      </div>
    </div>
  );
}

export default App;
