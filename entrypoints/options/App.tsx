import { useState, useEffect, useRef } from 'react';
import type { Profile } from '@/src/types/profile';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { calculateCompletion, getSectionCompletion, FIELD_FOCUS_IDS } from '@/src/utils/profileCompletion';
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

function App() {
  const [profile, setProfile] = useState<Partial<Profile>>({});
  const [activeSection, setActiveSection] = useState<SectionId>('personal');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [focusTarget, setFocusTarget] = useState<string | null>(null);

  // Used to skip section-switch autofocus when the banner focuses a specific field
  const skipAutoFocusRef = useRef(false);
  // Skip autofocus on the very first render
  const mountedRef = useRef(false);

  useEffect(() => {
    getProfile()
      .then((p) => { setProfile(p ?? {}); })
      .catch((err) => { console.error('[Job Buddy] Failed to initialize profile:', err); })
      .finally(() => { setLoading(false); });
  }, []);

  // Autofocus the first empty input when switching sections.
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (skipAutoFocusRef.current) { skipAutoFocusRef.current = false; return; }
    const raf = requestAnimationFrame(() => {
      const main = document.querySelector('main');
      if (!main) return;
      const inputs = Array.from(
        main.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
          'input[type="text"], input[type="email"], input[type="number"], input[type="url"],' +
          ' input:not([type]), textarea, select',
        ),
      ).filter((el) => !(el as HTMLInputElement).readOnly);
      inputs.find((el) => !el.value)?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeSection]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to, focus, and briefly highlight a specific field after navigating from the banner.
  useEffect(() => {
    if (!focusTarget) return;
    const raf = requestAnimationFrame(() => {
      const el = document.getElementById(focusTarget);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (el as HTMLElement).focus?.({ preventScroll: true });
        el.style.outline = '3px solid #3b82f6';
        el.style.outlineOffset = '3px';
        el.style.borderRadius = '6px';
        el.style.transition = 'outline 0.2s ease';
        setTimeout(() => {
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.transition = '';
        }, 1600);
      }
      setFocusTarget(null);
    });
    return () => cancelAnimationFrame(raf);
  }, [focusTarget]);

  const handleSave = async (updates: Partial<Profile>) => {
    const merged = { ...profile, ...updates };
    await saveProfile(merged as Profile);
    setProfile(merged);
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
        sectionCompletion={sectionCompletion}
      />
      <div className="flex flex-col flex-1 overflow-hidden">
        <CompletionBanner
          percentage={completion.percentage}
          missingGroups={completion.missingGroups}
          onNavigate={handleNavigate}
          onFocusField={handleFocusField}
          sidebarCollapsed={sidebarCollapsed}
          onSidebarToggle={() => setSidebarCollapsed((c) => !c)}
        />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl">{renderSection()}</div>
        </main>
      </div>
    </div>
  );
}

export default App;
