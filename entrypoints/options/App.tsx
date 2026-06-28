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
import { SettingsSection } from '@/src/components/options/SettingsSection';
import { ResumeImportSection } from '@/src/components/options/ResumeImportSection';
import { syncProfileToDrive } from '@/src/utils/driveSync';
import { useToast } from '@/src/components/ui/Toast';

type SectionId =
  | 'personal'
  | 'address'
  | 'salary'
  | 'workAuthorization'
  | 'workHistory'
  | 'education'
  | 'languages'
  | 'links'
  | 'documents'
  | 'resume'
  | 'settings';

// ── UI state persistence keys (sessionStorage) ───────────────────────────────
const UI_SECTION_KEY  = 'jb:ui:section';
const UI_SIDEBAR_KEY  = 'jb:ui:sidebar';
const UI_SCROLL_KEY   = (section: SectionId) => `jb:ui:scroll:${section}`;

const VALID_SECTIONS = new Set<SectionId>([
  'personal', 'address', 'salary', 'workAuthorization',
  'workHistory', 'education', 'languages', 'links', 'documents', 'resume', 'settings',
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
  const { showToast } = useToast();
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [activeSection, setActiveSection] = useState<SectionId>(readSection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebar);
  const [loading, setLoading] = useState(true);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);
  // Incremented on reset so all profile-editing sections remount and show cleared inputs.
  const [sectionSeq, setSectionSeq] = useState(0);

  const skipAutoFocusRef  = useRef(false);
  const mountedRef        = useRef(false);
  const sectionNavRef     = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const activeSectionRef  = useRef(activeSection);
  const mainRef           = useRef<HTMLElement>(null);

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile()
      .then((p) => { setProfile(p ?? {}); })
      .catch((err) => { console.error('[Job Buddy] Failed to initialize profile:', err); })
      .finally(() => { setLoading(false); });
  }, []);

  // ── Cross-context focus request (e.g. popup → Settings → API key input) ─────
  // The popup writes 'jb:focusOnLoad' to chrome.storage.session before opening
  // the options page; we read it here, clear it, and route to the appropriate
  // section + focus target. Only runs once after the initial profile load.
  useEffect(() => {
    if (loading) return;
    try {
      chrome.storage.session.get('jb:focusOnLoad', (r) => {
        const target = r?.['jb:focusOnLoad'];
        if (typeof target !== 'string') return;
        chrome.storage.session.remove('jb:focusOnLoad');
        if (target === 'gemini-api-key') {
          skipAutoFocusRef.current = true;
          setActiveSection('settings');
          setFocusTarget('gemini-api-key');
        }
      });
    } catch { /* session storage unavailable — no-op */ }
  }, [loading]);

  // ── Persist active section ──────────────────────────────────────────────────
  useEffect(() => {
    activeSectionRef.current = activeSection;
    try { sessionStorage.setItem(UI_SECTION_KEY, activeSection); } catch { /* storage blocked */ }
  }, [activeSection]);

  // ── Persist sidebar state ───────────────────────────────────────────────────
  useEffect(() => {
    try { sessionStorage.setItem(UI_SIDEBAR_KEY, String(sidebarCollapsed)); } catch { /* storage blocked */ }
  }, [sidebarCollapsed]);

  // ── Save scroll position per section ────────────────────────────────────────
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

  // ── Reset scroll on section navigation ──────────────────────────────────────
  useEffect(() => {
    if (!sectionNavRef.current) { sectionNavRef.current = true; return; }
    mainRef.current?.scrollTo({ top: 0, behavior: 'instant' });
  }, [activeSection]);

  // ── Restore scroll + autofocus once after profile loads ─────────────────────
  useEffect(() => {
    if (loading) return;
    if (initialLoadDoneRef.current) return;
    initialLoadDoneRef.current = true;
    const raf = requestAnimationFrame(() => {
      try {
        const saved = parseInt(sessionStorage.getItem(UI_SCROLL_KEY(activeSectionRef.current)) ?? '0', 10);
        if (saved > 0) mainRef.current?.scrollTo({ top: saved, behavior: 'instant' });
      } catch { /* storage blocked */ }
      if (!skipAutoFocusRef.current) focusFirstEmpty(mainRef.current);
    });
    return () => cancelAnimationFrame(raf);
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autofocus first empty input when navigating sections ────────────────────
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (skipAutoFocusRef.current) { skipAutoFocusRef.current = false; return; }
    const raf = requestAnimationFrame(() => { focusFirstEmpty(document.querySelector('main')); });
    return () => cancelAnimationFrame(raf);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Scroll/focus a specific field from the banner ───────────────────────────
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

  // Pass `afterLoad` when the caller needs to remount section components only
  // AFTER the new profile has been written to state. This avoids the race
  // where sectionSeq bumps synchronously while setProfile runs inside the
  // async .then() — the section would otherwise remount with the OLD profile.
  const handleImportComplete = (afterLoad?: () => void) => {
    getProfile()
      .then((p) => {
        setProfile(p ?? {});
        if (p) void syncProfileToDrive(p);
        afterLoad?.();
      })
      .catch((err) => console.error('[Job Buddy] Failed to reload profile after import:', err));
  };

  const handleSave = async (updates: Partial<Profile>) => {
    const merged = { ...profile, ...updates } as Profile;
    await saveProfile(merged);
    setProfile(merged);
    let synced: Profile = merged;
    try {
      const derived = calculateDerivedFields(merged);
      const withDerived: Profile = { ...merged, derived };
      await saveProfile(withDerived);
      setProfile(withDerived);
      synced = withDerived;
    } catch (err) {
      console.error('[Job Buddy] Failed to write derived fields:', err);
    }
    // Fire-and-forget Drive sync. Never blocks the local save flow.
    void syncProfileToDrive(synced).then((res) => {
      if (!res.success && res.errorCode) {
        showToast('warning', 'Profile saved. Drive sync failed — will retry.');
      }
    }).catch(() => { /* syncProfileToDrive never throws, but be defensive */ });
  };

  const handleNavigate = (sectionId: string) => {
    setActiveSection(sectionId as SectionId);
  };

  const handleFocusField = (sectionId: string, fieldLabel: string) => {
    skipAutoFocusRef.current = true;
    setActiveSection(sectionId as SectionId);
    const fieldId = FIELD_FOCUS_IDS[fieldLabel];
    if (fieldId) setFocusTarget(fieldId);
  };

  const handleGoToApiKey = () => {
    skipAutoFocusRef.current = true;
    setActiveSection('settings');
    setFocusTarget('gemini-api-key');
  };

  const handleCloseResumeImport = () => {
    setActiveSection('personal');
  };

  const completion = calculateCompletion(profile);
  const sectionCompletion = getSectionCompletion(profile);

  // A section is "fully complete" when its mandatory fields are done AND it has
  // no remaining optional fields. Derived from already-computed values — no
  // extra profile traversal needed.
  const sectionsWithOptionalGaps = new Set(completion.optionalGroups.map((g) => g.sectionId));
  const sectionFullCompletion: Record<string, boolean> = Object.fromEntries(
    Object.entries(sectionCompletion).map(([id, mandatoryDone]) => [
      id,
      mandatoryDone && !sectionsWithOptionalGaps.has(id),
    ]),
  );
  const sectionProps = { profile, onSave: handleSave };

  const renderSection = () => {
    if (loading) {
      return (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse" />
          ))}
        </div>
      );
    }
    switch (activeSection) {
      case 'personal':          return <PersonalSection key={`personal-${sectionSeq}`} {...sectionProps} />;
      case 'address':           return <AddressSection key={`address-${sectionSeq}`} {...sectionProps} />;
      case 'salary':            return <SalarySection key={`salary-${sectionSeq}`} {...sectionProps} />;
      case 'workAuthorization': return <WorkAuthorizationSection key={`workAuthorization-${sectionSeq}`} {...sectionProps} />;
      case 'workHistory':       return <WorkHistorySection key={`workHistory-${sectionSeq}`} {...sectionProps} />;
      case 'education':         return <EducationSection key={`education-${sectionSeq}`} {...sectionProps} />;
      case 'languages':         return <LanguagesSection key={`languages-${sectionSeq}`} {...sectionProps} />;
      case 'links':             return <LinksSection key={`links-${sectionSeq}`} {...sectionProps} />;
      case 'documents':         return <DocumentsSection key={`documents-${sectionSeq}`} {...sectionProps} />;
      case 'resume':            return <ResumeImportSection key="resume" profile={profile} onSave={handleSave} onGoToApiKey={handleGoToApiKey} onClose={handleCloseResumeImport} />;
      case 'settings':          return <SettingsSection key="settings" onImportComplete={handleImportComplete} onResetComplete={() => handleImportComplete(() => { setSectionSeq((s) => s + 1); setActiveSection('personal'); })} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar
        activeSection={activeSection}
        onSelect={(id) => setActiveSection(id as SectionId)}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        sectionCompletion={sectionCompletion}
        sectionFullCompletion={sectionFullCompletion}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <CompletionBanner
          percentage={completion.percentage}
          isCoreComplete={completion.isCoreComplete}
          optionalFieldsRemaining={completion.optionalFieldsRemaining}
          optionalGroups={completion.optionalGroups}
          missingGroups={completion.missingGroups}
          onNavigate={handleNavigate}
          onFocusField={handleFocusField}
        />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-8">
          {/* Settings uses max-w-none so long subtitles can flow to one line */}
          <div className={activeSection === 'settings' ? 'max-w-none' : 'max-w-2xl'}>
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
