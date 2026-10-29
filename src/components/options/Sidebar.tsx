import { FileUp, Brain, Menu, Settings } from 'lucide-react';
import { LOGO_ICON_SRC } from '@/src/utils/branding';

interface Section {
  id: string;
  label: string;
  icon: string;
}

const SECTIONS: Section[] = [
  { id: 'personal', label: 'Personal', icon: '👤' },
  { id: 'address', label: 'Address', icon: '📍' },
  { id: 'workAuthorization', label: 'Work Authorization', icon: '🛂' },
  { id: 'workHistory', label: 'Work History', icon: '📋' },
  { id: 'education', label: 'Education', icon: '🎓' },
  { id: 'languages', label: 'Languages', icon: '🌐' },
  { id: 'links', label: 'Links', icon: '🔗' },
  { id: 'documents', label: 'Documents', icon: '📄' },
  { id: 'salary', label: 'Salary', icon: '💰' },
];

interface SidebarProps {
  activeSection: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  sectionCompletion: Record<string, boolean>;
  sectionFullCompletion: Record<string, boolean>;
}

export function Sidebar({
  activeSection,
  onSelect,
  collapsed,
  onToggle,
  sectionCompletion,
  sectionFullCompletion,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 transition-all duration-200 shrink-0 ${
        collapsed ? 'w-16' : 'w-16 sm:w-56'
      }`}
    >
      {/* Header: brand logo + sidebar toggle */}
      <div
        className={`flex items-center h-16 px-3 border-b border-gray-200 dark:border-gray-800 ${collapsed ? 'justify-center' : 'justify-between'}`}
      >
        <img src={LOGO_ICON_SRC} alt="Job Buddy" className="w-7 h-7 sm:hidden" />
        {!collapsed && (
          <div className="hidden sm:flex items-center gap-2 min-w-0 flex-1 mr-1">
            <img src={LOGO_ICON_SRC} alt="" className="w-7 h-7 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
              Job Buddy
            </span>
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
        <p className="hidden sm:block px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Profile
        </p>
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          const isMandatoryComplete = sectionCompletion[section.id];
          const isFullyComplete = sectionFullCompletion[section.id];
          const optionalSection = section.id === 'salary' || section.id === 'links';
          const status =
            optionalSection && !isMandatoryComplete
              ? 'Optional section; no details added'
              : isFullyComplete
                ? 'All tracked details complete'
                : isMandatoryComplete
                  ? optionalSection
                    ? 'Details added; more optional details available'
                    : 'Required details complete; optional details remaining'
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
              className={`relative w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="w-5 text-center shrink-0 leading-none">{section.icon}</span>
              {!collapsed && (
                <span className="hidden sm:block text-sm font-medium flex-1 truncate">
                  {section.label}
                </span>
              )}
              <span id={`status-${section.id}`} className="sr-only">
                {status}
              </span>
              {isMandatoryComplete && (
                <span
                  title={
                    isFullyComplete ? 'All tracked details complete' : 'Required details complete'
                  }
                  aria-hidden="true"
                  className={`${collapsed ? 'absolute right-1 top-1' : 'absolute right-1 top-1 sm:static sm:ml-auto'} w-[17px] h-[17px] rounded-full flex items-center justify-center shrink-0 ${isFullyComplete ? 'bg-green-500 dark:bg-green-600 text-white' : 'text-green-600 dark:text-green-400'}`}
                >
                  <span className="text-[10px] leading-none font-bold">✓</span>
                </span>
              )}
            </button>
          );
        })}
        {!collapsed && (
          <p className="hidden sm:block px-3 pt-3 text-[11px] text-gray-500 dark:text-gray-400 leading-5">
            <span className="text-green-600">✓</span> Required complete
            <br />
            <span className="inline-flex w-3 h-3 rounded-full bg-green-500 text-white items-center justify-center text-[9px]">
              ✓
            </span>{' '}
            All tracked details complete
          </p>
        )}
      </nav>

      {/* Tools are separate from profile data. */}
      <div
        className={`border-t border-gray-200 dark:border-gray-800 pt-1 pb-0 ${collapsed ? 'flex flex-col items-center px-2 gap-0' : 'px-0'}`}
      >
        <p className="hidden sm:block px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          Tools
        </p>
        <button
          type="button"
          onClick={() => onSelect('resume')}
          title="Import Resume"
          aria-label="Import Resume"
          aria-current={activeSection === 'resume' ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'resume'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <FileUp className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="hidden sm:block text-sm font-medium flex-1 truncate">
              Import Resume ✨
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect('learnedMappings')}
          title="Learned Mappings"
          aria-label="Learned Mappings"
          aria-current={activeSection === 'learnedMappings' ? 'page' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'learnedMappings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <Brain className="w-5 h-5" />
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
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'settings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0">
            <Settings className="w-5 h-5" />
          </span>
          {!collapsed && (
            <span className="hidden sm:block text-sm font-medium truncate">Settings</span>
          )}
        </button>
      </div>
    </aside>
  );
}
