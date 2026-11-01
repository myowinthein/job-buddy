import { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { devContext } from '@/src/devtools/context';
import type { Profile } from '@/src/types/profile';
import type { ProfileUpdate } from '@/src/resume-ai/resumeImport';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { sessionGet, sessionRemove } from '@/src/utils/sessionStorage';
import { calculateCompletion, getSectionCompletion, getCompletionTarget, getSectionStartTarget } from '@/src/utils/profileCompletion';
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
import { LearnedMappingsSection } from '@/src/components/options/LearnedMappingsSection';
import { syncProfileToDrive } from '@/src/utils/driveSync';
import { ReportedSaveError } from '@/src/components/options/shared/saveSection';
import { useToast } from '@/src/components/ui/useToast';
import type { CompletionTarget } from '@/src/utils/profileCompletion';
import { DraftStatusContext, SectionSaveStatusContext } from '@/src/components/options/shared/draftStatus';
import { replaceImportedProfile } from '@/src/utils/replaceImportedProfile';
import { withProfileWriteLock } from '@/src/utils/profileWriteLock';

const DevToolsPage = import.meta.env.DEV ? lazy(() => import('@/src/devtools/DevToolsPage')) : null;

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
  | 'learnedMappings'
  | 'settings'
  | 'devTools';

// ── UI state persistence keys (sessionStorage) ───────────────────────────────
const UI_SECTION_KEY  = 'jb:ui:section';
const UI_SIDEBAR_KEY  = 'jb:ui:sidebar';
const UI_SCROLL_KEY   = (section: SectionId) => `jb:ui:scroll:${section}`;

const VALID_SECTIONS = new Set<SectionId>([
  'personal', 'address', 'salary', 'workAuthorization',
  'workHistory', 'education', 'languages', 'links', 'documents', 'resume', 'learnedMappings', 'settings',
  ...(import.meta.env.DEV ? ['devTools' as const] : []),
]);

function readSection(): SectionId {
  try {
    if (import.meta.env.DEV && new URLSearchParams(location.search).has('devTools')) return 'devTools';
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
  const [focusTarget, setFocusTarget] = useState<CompletionTarget | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [unsavedStatusVisible, setUnsavedStatusVisible] = useState(false);
  const [savedFeedbackAt, setSavedFeedbackAt] = useState<number | null>(null);
  // Incremented on reset so all profile-editing sections remount and show cleared inputs.
  const [sectionSeq, setSectionSeq] = useState(0);

  const skipAutoFocusRef  = useRef(false);
  const mountedRef        = useRef(false);
  const sectionNavRef     = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const activeSectionRef  = useRef(activeSection);
  const mainRef           = useRef<HTMLElement>(null);
  const dirtyInputsRef = useRef(new Set<string>());
  const reportDraftStatus = useCallback((id: string, dirty: boolean) => {
    if (dirty) dirtyInputsRef.current.add(id);
    else dirtyInputsRef.current.delete(id);
    setHasUnsavedChanges(dirtyInputsRef.current.size > 0);
    if (dirtyInputsRef.current.size === 0) setUnsavedStatusVisible(false);
  }, []);

  const navigateSection = useCallback((section: SectionId) => {
    if (section === activeSection) return true;
    if (hasUnsavedChanges && !window.confirm('You have unsaved changes. Leave this section and discard them?')) return false;
    dirtyInputsRef.current.clear();
    setHasUnsavedChanges(false);
    setUnsavedStatusVisible(false);
    setSavedFeedbackAt(null);
    setFocusTarget(null);
    setActiveSection(section);
    return true;
  }, [activeSection, hasUnsavedChanges]);

  useEffect(() => {
    if (savedFeedbackAt === null) return;
    const timer = window.setTimeout(() => setSavedFeedbackAt(null), 2000);
    return () => window.clearTimeout(timer);
  }, [savedFeedbackAt]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeClosing = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeClosing);
    return () => window.removeEventListener('beforeunload', warnBeforeClosing);
  }, [hasUnsavedChanges]);

  // ── Load profile ────────────────────────────────────────────────────────────
  useEffect(() => {
    getProfile()
      .then((p) => { setProfile(p ?? {}); })
      .catch((err) => { console.error('[Job Buddy] Failed to initialize profile:', err); })
      .finally(() => { setLoading(false); });
  }, []);

  // Skips the "autofocus first empty input" effect that would otherwise fire
  // on the section switch below, then focuses the specific target field once
  // it renders (via the focusTarget effect).
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const openTools = () => { navigateSection('devTools'); };
    window.addEventListener('jb:dev:open-tools', openTools);
    return () => window.removeEventListener('jb:dev:open-tools', openTools);
  }, [navigateSection]);

  const navigateAndFocus = useCallback((section: SectionId, field?: string | CompletionTarget) => {
    if (!navigateSection(section)) return;
    if (section !== activeSection) skipAutoFocusRef.current = true;
    if (field) setFocusTarget(typeof field === 'string' ? { id: field } : field);
  }, [navigateSection, activeSection]);

  // ── Cross-context focus request (popup → Options) ──────────────────────────
  const focusGeminiKey = useCallback(() => {
    navigateAndFocus('settings', 'gemini-api-key');
  }, [navigateAndFocus]);

  // The popup writes 'jb:focusOnLoad': 'gemini-api-key' to chrome.storage.session
  // before opening the Options page; we read it here, clear it, and focus the
  // AI key input. Runs after initial profile load AND on visibilitychange — the
  // latter covers the case where the Options tab was already open when the
  // popup called openOptionsPage(), which just focused the existing tab
  // without a reload.
  const applyFocusTarget = useCallback(() => {
    sessionGet('jb:focusOnLoad').then((r) => {
      const target = r?.['jb:focusOnLoad'];
      if (target == null) return;
      void sessionRemove('jb:focusOnLoad');

      if (target === 'quick-fill-enabled') navigateAndFocus('settings', 'quick-fill-enabled');
      if (target === 'field-firstName') navigateAndFocus('personal', 'field-firstName');
      if (target === 'gemini-api-key') {
        focusGeminiKey();
      }
    });
  }, [focusGeminiKey, navigateAndFocus]);

  useEffect(() => {
    if (loading) return;
    applyFocusTarget();
  }, [loading, applyFocusTarget]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') applyFocusTarget();
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [applyFocusTarget]);

  // Covers the case where the Options tab is already the visible/focused tab —
  // visibilitychange never fires then, so we also react to the storage write
  // itself (e.g. clicking the popup's sparkle while already on this page).
  useEffect(() => {
    const handleStorageChange = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === 'session' && 'jb:focusOnLoad' in changes && changes['jb:focusOnLoad'].newValue != null) {
        applyFocusTarget();
      }
    };
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, [applyFocusTarget]);

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
  }, []);

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
  }, [loading]);

  // ── Autofocus first empty input when navigating sections ────────────────────
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (skipAutoFocusRef.current) { skipAutoFocusRef.current = false; return; }
    const raf = requestAnimationFrame(() => { focusFirstEmpty(mainRef.current); });
    return () => cancelAnimationFrame(raf);
  }, [activeSection]);

  // ── Scroll/focus a specific field from the banner ───────────────────────────
  useEffect(() => {
    if (!focusTarget) return;
    let focusRaf = 0;
    let observer: MutationObserver | undefined;
    const raf = requestAnimationFrame(() => {
      if (focusTarget.revealId) document.getElementById(focusTarget.revealId)?.click();
      const card = focusTarget.cardId ? document.getElementById(focusTarget.cardId) : null;
      card?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]')?.click();
      focusRaf = requestAnimationFrame(() => {
        const focusWhenReady = () => {
          const el = document.getElementById(focusTarget.id) ?? (focusTarget.fallbackId ? document.getElementById(focusTarget.fallbackId) : null);
          // Settings can render the key input before its saved state finishes loading.
          if (!el || el.matches(':disabled')) return;
          el.focus({ preventScroll: true });
          if (document.activeElement !== el) return;
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          observer?.disconnect();
          setFocusTarget(null);
        };
        if (mainRef.current) {
          observer = new MutationObserver(focusWhenReady);
          observer.observe(mainRef.current, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['disabled'],
          });
        }
        focusWhenReady();
      });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(focusRaf);
      observer?.disconnect();
    };
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
      .catch((err) => {
        // The write itself already succeeded at this point (import/reset/Drive
        // restore all complete before calling this) — only the reload failed,
        // so the wording must not imply the save itself failed.
        console.error('[Job Buddy] Failed to reload profile after import:', err);
        showToast('warning', "Saved, but the profile view couldn't refresh. Reload the page.");
      });
  };

  const handleSave = (update: ProfileUpdate) => withProfileWriteLock(async () => {
    // Keep changes saved by another Options tab in other profile sections.
    const latest = await getProfile({ rejectOnError: true });
    if (typeof update !== 'function' && latest?.id !== profile.id) {
      showToast('warning', 'Your profile was replaced in another tab. Reload before saving.');
      throw new ReportedSaveError('Profile replaced in another tab');
    }
    const base = latest ?? (typeof update === 'function' ? {} : profile);
    const updates = typeof update === 'function' ? update(base) : update;
    const merged = { ...base, ...updates, id: base.id || crypto.randomUUID() } as Profile;
    let synced: Profile = merged;
    try {
      const derived = calculateDerivedFields(merged);
      synced = { ...merged, derived };
    } catch (err) {
      console.error('[Job Buddy] Failed to compute derived fields:', err);
    }
    try {
      await saveProfile(synced);
    } catch (err) {
      if (import.meta.env.DEV) window.dispatchEvent(new CustomEvent('jb:dev:request', { detail: { operation: 'profile-save', status: 500, section: activeSection } }));
      console.error('[Job Buddy] Failed to save profile:', err);
      showToast('error', 'Failed to save: storage may be full.');
      throw new ReportedSaveError('Failed to save: storage may be full.');
    }
    if (import.meta.env.DEV) window.dispatchEvent(new CustomEvent('jb:dev:request', { detail: { operation: 'profile-save', status: 200, section: activeSection } }));
    setProfile(synced);
    setSavedFeedbackAt(Date.now());
    // Fire-and-forget Drive sync. Never blocks the local save flow.
    void syncProfileToDrive(synced).then((res) => {
      if (!res.success && res.errorCode) {
        showToast('warning', res.errorCode === 'review_required' ? 'Profile saved. Review your Drive backup in Settings.' : res.errorCode === 'token_expired' ? 'Profile saved. Reconnect Google Drive to continue backups.' : 'Profile saved. Drive backup is pending.');
      }
    }).catch(() => { /* syncProfileToDrive never throws, but be defensive */ });
  });

  const handleFocusField = (sectionId: string, fieldLabel: string) => {
    navigateAndFocus(sectionId as SectionId, getCompletionTarget(profile, sectionId, fieldLabel));
  };

  const handleGoToApiKey = focusGeminiKey;

  const handleResetComplete = () => {
    handleImportComplete(() => { setSectionSeq((s) => s + 1); setActiveSection('personal'); });
  };

  const handleCloseResumeImport = () => {
    navigateSection('personal');
  };

  // All completion-derived values are recomputed only when `profile` changes,
  // rather than on every render. calculateCompletion traverses the whole
  // profile, and getSectionCompletion calls it internally — so both are kept
  // inside a single memo keyed on profile.
  const { completion, sectionCompletion } = useMemo(() => {
    const completion = calculateCompletion(profile);
    const sectionCompletion = getSectionCompletion(profile);
    return { completion, sectionCompletion };
  }, [profile]);
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
      case 'resume':            return <ResumeImportSection key="resume" profile={profile} onSave={handleSave} onReplace={async (base, changes) => { setProfile(await replaceImportedProfile(base, changes)); }} onGoToApiKey={handleGoToApiKey} onClose={handleCloseResumeImport} />;
      case 'learnedMappings':   return <LearnedMappingsSection key="learnedMappings" />;
      case 'devTools': return DevToolsPage ? <Suspense fallback={<p>Loading development tools…</p>}><DevToolsPage onFocusField={handleFocusField} /></Suspense> : null;
      case 'settings':          return <SettingsSection key="settings" onImportComplete={handleImportComplete} onResetComplete={handleResetComplete} />;
    }
  };

  return (
    <div className={`flex ${import.meta.env.DEV && devContext() ? 'h-full' : 'h-screen'} bg-gray-50 dark:bg-gray-900`}>
      <Sidebar
        activeSection={activeSection}
        onSelect={(id) => { navigateSection(id as SectionId); }}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((c) => !c)}
        sectionCompletion={sectionCompletion}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <CompletionBanner
          percentage={completion.percentage}
          isCoreComplete={completion.isCoreComplete}
          optionalFieldsRemaining={completion.optionalFieldsRemaining}
          optionalGroups={completion.optionalGroups}
          missingGroups={completion.missingGroups}
          onNavigate={(sectionId) => { navigateAndFocus(sectionId as SectionId, getSectionStartTarget(sectionId)); }}
          onFocusField={handleFocusField}
        />
        <main ref={mainRef} className="flex-1 min-w-0 overflow-y-auto p-4 sm:p-8">
          {/* Settings uses max-w-none so long subtitles can flow to one line */}
          <div data-profile-section={activeSection} className={['settings', 'devTools'].includes(activeSection) ? 'max-w-none' : 'max-w-2xl'}
            onBlurCapture={() => {
              if (dirtyInputsRef.current.size > 0) setUnsavedStatusVisible(true);
            }}>
            <DraftStatusContext.Provider value={reportDraftStatus}>
              <SectionSaveStatusContext.Provider value={hasUnsavedChanges
                ? unsavedStatusVisible ? 'unsaved' : 'idle'
                : savedFeedbackAt !== null ? 'saved' : 'idle'}>
                {renderSection()}
              </SectionSaveStatusContext.Provider>
            </DraftStatusContext.Provider>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
