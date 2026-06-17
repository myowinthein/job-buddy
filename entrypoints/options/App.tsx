import { useState, useEffect } from 'react';
import type { Profile } from '@/src/types/profile';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { calculateCompletion, getSectionCompletion } from '@/src/utils/profileCompletion';
import { Sidebar } from '@/src/components/options/Sidebar';
import { CompletionBanner } from '@/src/components/options/CompletionBanner';
import { PersonalSection } from '@/src/components/options/PersonalSection';
import { AddressSection } from '@/src/components/options/AddressSection';
import { ProfessionalSection } from '@/src/components/options/ProfessionalSection';
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
  | 'professional'
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

  useEffect(() => {
    getProfile().then((p) => {
      setProfile(p ?? {});
      setLoading(false);
    });
  }, []);

  const handleSave = async (updates: Partial<Profile>) => {
    const merged = { ...profile, ...updates };
    await saveProfile(merged as Profile);
    setProfile(merged);
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
      case 'personal': return <PersonalSection key="personal" {...sectionProps} />;
      case 'address': return <AddressSection key="address" {...sectionProps} />;
      case 'professional': return <ProfessionalSection key="professional" {...sectionProps} />;
      case 'salary': return <SalarySection key="salary" {...sectionProps} />;
      case 'workAuthorization': return <WorkAuthorizationSection key="workAuthorization" {...sectionProps} />;
      case 'workHistory': return <WorkHistorySection key="workHistory" {...sectionProps} />;
      case 'education': return <EducationSection key="education" {...sectionProps} />;
      case 'languages': return <LanguagesSection key="languages" {...sectionProps} />;
      case 'links': return <LinksSection key="links" {...sectionProps} />;
      case 'documents': return <DocumentsSection key="documents" {...sectionProps} />;
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
          missingFields={completion.missingFields}
        />
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-2xl">{renderSection()}</div>
        </main>
      </div>
    </div>
  );
}

export default App;
