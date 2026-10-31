import { useEffect, useState } from 'react';
import { FileUp, Brain, Menu, Settings, Check, Minus, Sparkles, FlaskConical } from 'lucide-react';
import { LOGO_ICON_SRC } from '@/src/utils/branding';
import { getGeminiSettings } from '@/src/utils/storage';

import { PROFILE_SECTIONS } from './shared/profileSections';

const SECTIONS = PROFILE_SECTIONS;

interface SidebarProps {
  activeSection: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  sectionCompletion: Record<string, boolean>;
}

export function Sidebar({
  activeSection,
  onSelect,
  collapsed,
  onToggle,
  sectionCompletion,
}: SidebarProps) {
  const [geminiConfigured, setGeminiConfigured] = useState(false);
  const resumeAiDescription = geminiConfigured
    ? 'Import your resume with AI.'
    : 'Add a Gemini API key to import your resume with AI.';

  useEffect(() => {
    let active = true;
    let sequence = 0;
    const load = async () => {
      const id = ++sequence;
      try {
        const settings = await getGeminiSettings();
        if (active && id === sequence) setGeminiConfigured(!!settings.apiKey && !!settings.model);
      } catch {
        if (active && id === sequence) setGeminiConfigured(false);
      }
    };
    const changed = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (
        area === 'local' &&
        ['geminiApiKey', 'geminiModel', 'geminiSettingsMeta'].some((key) => key in changes)
      )
        void load();
    };
    const storageChanges = typeof chrome !== 'undefined' ? chrome.storage?.onChanged : undefined;
    storageChanges?.addListener(changed);
    void load();
    return () => {
      active = false;
      storageChanges?.removeListener(changed);
    };
  }, []);

  return (
    <aside
      className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-200 shrink-0 ${
        collapsed ? 'w-16' : 'w-16 sm:w-56'
      }`}
    >
      {/* Header: brand logo + sidebar toggle */}
      <div
        className={`flex items-center h-16 px-3 border-b border-gray-200 dark:border-gray-800 ${collapsed ? 'justify-center' : 'justify-between sm:pl-4 sm:pr-1'}`}
      >
        <img src={LOGO_ICON_SRC} alt="Job Buddy" className="w-7 h-7 sm:hidden" />
        {!collapsed && (
          <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 mr-1">
            <img src={LOGO_ICON_SRC} alt="" className="w-7 h-7 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              Job Buddy
            </span>
            {import.meta.env.DEV && <span title="Development build" className="shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold tracking-wide text-amber-700 bg-amber-100 dark:text-amber-300 dark:bg-amber-900/40">DEV</span>}
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="hidden sm:block p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <img src={LOGO_ICON_SRC} alt="Job Buddy" className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2" aria-label="Profile sections">
        {!collapsed && (
          <p className="hidden sm:block px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Profile
          </p>
        )}
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          const isMandatoryComplete = sectionCompletion[section.id];
          const optionalSection = section.id === 'salary' || section.id === 'links';
          const status = isMandatoryComplete
            ? optionalSection
              ? 'Details added'
              : 'Required details complete'
            : optionalSection
              ? 'No details added'
              : 'Required details remaining';

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              title={`${section.label}: ${status}`}
              aria-label={section.label}
              aria-describedby={`status-${section.id}`}
              aria-current={isActive ? 'page' : undefined}
              className={`w-full flex items-center px-3 py-2.5 text-left transition-colors ${collapsed ? 'justify-center gap-1' : 'justify-center gap-1 sm:justify-start sm:gap-3'} ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              <Icon aria-hidden="true" className="w-5 h-5 shrink-0" />
              {!collapsed && (
                <span className="hidden sm:block text-sm font-medium flex-1 truncate">
                  {section.label}
                </span>
              )}
              <span id={`status-${section.id}`} className="sr-only">
                {status}
              </span>
              <span
                title={status}
                aria-hidden="true"
                className={`${collapsed ? '' : 'sm:ml-auto'} flex h-4 w-4 items-center justify-center shrink-0 ${isMandatoryComplete ? 'text-green-600 dark:text-green-400' : optionalSection ? 'text-gray-400 dark:text-gray-500' : 'text-amber-500 dark:text-amber-400'}`}
              >
                {isMandatoryComplete ? (
                  <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
                ) : optionalSection ? (
                  <Minus className="h-3 w-3" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
            </button>
          );
        })}
      </nav>

      {/* Tools are separate from profile data. */}
      <div
        className={`border-t border-gray-200 dark:border-gray-800 pt-1 pb-0 ${collapsed ? 'flex flex-col items-center px-2 gap-0' : 'px-0'}`}
      >
        {!collapsed && (
          <p className="hidden sm:block px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
            Tools
          </p>
        )}
        <button
          type="button"
          onClick={() => onSelect('resume')}
          title={resumeAiDescription}
          aria-label="Import Resume"
          aria-describedby="resume-ai-description"
          aria-current={activeSection === 'resume' ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${collapsed ? 'justify-center' : 'justify-center sm:justify-start'} ${
            activeSection === 'resume'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <FileUp aria-hidden="true" className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="hidden sm:flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium">
              <span className="truncate">Import Resume</span>
              <Sparkles
                aria-hidden="true"
                className="w-3.5 h-3.5 shrink-0 text-blue-500 dark:text-blue-400"
              />
            </span>
          )}
          <span id="resume-ai-description" className="sr-only">
            {resumeAiDescription}
          </span>
        </button>
        <button
          type="button"
          onClick={() => onSelect('learnedMappings')}
          title="Learned Mappings"
          aria-label="Learned Mappings"
          aria-current={activeSection === 'learnedMappings' ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${collapsed ? 'justify-center' : 'justify-center sm:justify-start'} ${
            activeSection === 'learnedMappings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <Brain aria-hidden="true" className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="hidden sm:block text-sm font-medium truncate">Learned Mappings</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title="Settings"
          aria-label="Settings"
          aria-current={activeSection === 'settings' ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${collapsed ? 'justify-center' : 'justify-center sm:justify-start'} ${
            activeSection === 'settings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <Settings aria-hidden="true" className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="hidden sm:block text-sm font-medium truncate">Settings</span>
          )}
        </button>
        {import.meta.env.DEV && (
          <button type="button" onClick={() => onSelect('devTools')} title="Inspect data and run development scenarios." aria-label="Dev Tools" aria-current={activeSection === 'devTools' ? 'page' : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${collapsed ? 'justify-center' : 'justify-center sm:justify-start'} ${activeSection === 'devTools' ? 'bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'}`}>
            <FlaskConical aria-hidden="true" className="w-5 h-5 shrink-0" />
            {!collapsed && <span className="hidden sm:block text-sm font-medium truncate">Dev Tools</span>}
          </button>
        )}
      </div>
    </aside>
  );
}
