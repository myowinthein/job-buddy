import { useState, useEffect, useRef } from 'react';
import type { Profile } from '@/src/types/profile';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { calculateCompletion, getSectionCompletion, FIELD_FOCUS_IDS } from '@/src/utils/profileCompletion';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import { ImportResumeDialog } from '@/src/components/options/ImportResumeDialog';
import type { ExtractedResume } from '@/src/types/storage';
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
import { ResumeFloatingPanel } from '@/src/components/options/ResumeFloatingPanel';
import type { DraggedItem, PanelCallbacks } from '@/src/components/options/ResumeFloatingPanel';
import { fillDroppedValue } from '@/src/resume/dropFiller';

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
  | 'settings';

// ── UI state persistence keys (sessionStorage) ───────────────────────────────
const UI_SECTION_KEY  = 'jb:ui:section';
const UI_SIDEBAR_KEY  = 'jb:ui:sidebar';
const UI_SCROLL_KEY   = (section: SectionId) => `jb:ui:scroll:${section}`;

const VALID_SECTIONS = new Set<SectionId>([
  'personal', 'address', 'salary', 'workAuthorization',
  'workHistory', 'education', 'languages', 'links', 'documents', 'settings',
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

// ── Chunk parsing helpers ────────────────────────────────────────────────────
const MONTH_ABBR: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function toYYYYMM(token: string): string {
  const clean = token.trim();
  const mMatch = clean.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i);
  if (mMatch) {
    const m = MONTH_ABBR[mMatch[1].toLowerCase()];
    const y = clean.match(/(\d{4})/)?.[1] ?? String(new Date().getFullYear());
    return `${y}-${m}`;
  }
  const y = clean.match(/^(\d{4})$/)?.[1];
  return y ? `${y}-01` : '';
}

const DATE_RANGE_RE =
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,4}|\d{4})\s*[–\-—]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{0,4}|\d{4}|Present)\b/i;

function parseWorkHistoryChunk(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  const dateMatch = text.match(DATE_RANGE_RE);
  if (dateMatch) {
    const sd = toYYYYMM(dateMatch[1]);
    if (sd) result.startDate = sd;
    if (!/present/i.test(dateMatch[2])) {
      const ed = toYYYYMM(dateMatch[2]);
      if (ed) result.endDate = ed;
    }
  }

  const firstLine = (text.split('\n')[0] ?? '').replace(DATE_RANGE_RE, '').trim();
  const sepMatch = firstLine.match(/^(.+?)\s+[—–]\s+(.+)$/) ?? firstLine.match(/^(.+?)\s+-\s+(.+)$/);
  if (sepMatch) {
    result.company = sepMatch[1].split(',')[0]?.trim() ?? sepMatch[1].trim();
    result.title = sepMatch[2].split('\n')[0]?.trim() ?? sepMatch[2].trim();
  } else if (firstLine) {
    result.company = firstLine.split(',')[0]?.trim() ?? firstLine;
  }

  const bullets = text
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[●\-•]/.test(l))
    .map((l) => l.replace(/^[●\-•]\s*/, '').trim());
  if (bullets.length > 0) result.description = bullets.join('\n');

  return result;
}

function parseEducationChunk(text: string): Record<string, string> {
  const result: Record<string, string> = {};

  const dateMatch = text.match(DATE_RANGE_RE);
  if (dateMatch) {
    const sd = toYYYYMM(dateMatch[1]);
    if (sd) result.startDate = sd;
    if (!/present/i.test(dateMatch[2])) {
      const ed = toYYYYMM(dateMatch[2]);
      if (ed) result.endDate = ed;
    }
  }

  const degreeRE =
    /\b(Bachelor(?:\s+of\s+[A-Za-z\s]+)?|Master(?:\s+of\s+[A-Za-z\s]+)?|PhD|Doctorate?|BSc|MSc|MBA|B\.Eng|M\.Eng|BEng|MEng|B\.S\.|M\.S\.|B\.A\.|M\.A\.)[^\n,]*/i;
  const degreeMatch = text.match(degreeRE);
  if (degreeMatch) result.degree = degreeMatch[0].trim().replace(/\s+/g, ' ');

  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (DATE_RANGE_RE.test(line)) continue;
    if (degreeMatch && line.startsWith(degreeMatch[0].slice(0, 8))) continue;
    if (line.length > 3) { result.institution = line; break; }
  }

  return result;
}

function App() {
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [activeSection, setActiveSection] = useState<SectionId>(readSection);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(readSidebar);
  const [loading, setLoading] = useState(true);
  const [focusTarget, setFocusTarget]           = useState<string | null>(null);
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [pendingResume, setPendingResume]       = useState<ExtractedResume | null>(null);

  const skipAutoFocusRef  = useRef(false);
  const mountedRef        = useRef(false);
  const sectionNavRef     = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const activeSectionRef  = useRef(activeSection);
  const mainRef           = useRef<HTMLElement>(null);

  // Drag-and-drop refs
  const draggedItemRef    = useRef<DraggedItem | null>(null);
  const panelCallbacksRef = useRef<PanelCallbacks | null>(null);
  const highlightedField  = useRef<HTMLElement | null>(null);

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

  // ── Document-level drag handlers (active only while a resume is loaded) ──────
  useEffect(() => {
    if (!pendingResume) return;

    const clearHighlight = () => {
      if (highlightedField.current) {
        highlightedField.current.style.outline = '';
        highlightedField.current.style.outlineOffset = '';
        highlightedField.current = null;
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      const field = (e.target as HTMLElement).closest('input, textarea, select') as HTMLElement | null;
      if (field !== highlightedField.current) {
        clearHighlight();
        if (field) {
          field.style.outline = '2px dashed #6366f1';
          field.style.outlineOffset = '2px';
        }
        highlightedField.current = field;
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      const field = (e.target as HTMLElement).closest('input, textarea, select') as HTMLElement | null;
      if (field && field === highlightedField.current && !field.contains(e.relatedTarget as Node)) {
        clearHighlight();
      }
    };

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      clearHighlight();

      const item = draggedItemRef.current;
      if (!item) return;
      draggedItemRef.current = null;

      const field = (e.target as HTMLElement).closest('input, textarea, select') as HTMLElement | null;

      if (item.type === 'detectedField') {
        if (field) {
          fillDroppedValue(field, item.value);
          if (item.fieldPath) panelCallbacksRef.current?.markChipUsed(item.fieldPath);
        }
        return;
      }

      // textChunk
      const section = activeSectionRef.current;
      if (section === 'workHistory' || section === 'education') {
        const parsedData =
          section === 'workHistory'
            ? parseWorkHistoryChunk(item.value)
            : parseEducationChunk(item.value);

        const dispatch = () => {
          window.dispatchEvent(
            new CustomEvent('job-buddy-add-entry', {
              detail: { section, parsedData, rawText: item.value },
            }),
          );
          if (item.chunkId) panelCallbacksRef.current?.markChunkUsed(item.chunkId);
        };

        if (activeSectionRef.current === section) {
          dispatch();
        } else {
          setActiveSection(section);
          requestAnimationFrame(() => requestAnimationFrame(dispatch));
        }
      } else {
        if (field) {
          fillDroppedValue(field, item.value);
          if (item.chunkId) panelCallbacksRef.current?.markChunkUsed(item.chunkId);
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('dragleave', handleDragLeave);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('dragleave', handleDragLeave);
      document.removeEventListener('drop', handleDrop);
      clearHighlight();
    };
  }, [pendingResume]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImportComplete = () => {
    getProfile()
      .then((p) => { setProfile(p ?? {}); })
      .catch((err) => console.error('[Job Buddy] Failed to reload profile after import:', err));
  };

  const handleSave = async (updates: Partial<Profile>) => {
    const merged = { ...profile, ...updates } as Profile;
    await saveProfile(merged);
    setProfile(merged);
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
    skipAutoFocusRef.current = true;
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
      case 'settings':          return <SettingsSection key="settings" onImportComplete={handleImportComplete} onResetComplete={() => { handleImportComplete(); setActiveSection('personal'); }} />;
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
        onImportClick={() => setShowImportDialog(true)}
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

      {showImportDialog && (
        <ImportResumeDialog
          onClose={() => setShowImportDialog(false)}
          onComplete={(data) => {
            setPendingResume(data);
            setShowImportDialog(false);
          }}
        />
      )}

      {pendingResume && (
        <ResumeFloatingPanel
          resume={pendingResume}
          onDismiss={() => setPendingResume(null)}
          draggedItemRef={draggedItemRef}
          callbacksRef={panelCallbacksRef}
        />
      )}
    </div>
  );
}

export default App;
