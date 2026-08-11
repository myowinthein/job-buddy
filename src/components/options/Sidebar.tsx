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
  { id: 'salary', label: 'Salary', icon: '💰' },
  { id: 'workAuthorization', label: 'Work Authorization', icon: '🛂' },
  { id: 'workHistory', label: 'Work History', icon: '📋' },
  { id: 'education', label: 'Education', icon: '🎓' },
  { id: 'languages', label: 'Languages', icon: '🌐' },
  { id: 'links', label: 'Links', icon: '🔗' },
  { id: 'documents', label: 'Documents', icon: '📄' },
];

interface SidebarProps {
  activeSection: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  sectionCompletion:     Record<string, boolean>;
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
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header: brand logo + sidebar toggle */}
      <div className={`flex items-center h-16 px-3 border-b border-gray-200 dark:border-gray-800 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0 flex-1 mr-1">
            <img src={LOGO_ICON_SRC} alt="" className="w-7 h-7 shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">Job Buddy</span>
          </div>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors text-gray-500 dark:text-gray-400 shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <img src={LOGO_ICON_SRC} alt="Job Buddy" className="w-5 h-5" />
          ) : (
            <Menu className="w-5 h-5" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => {
          const isActive          = activeSection === section.id;
          const isMandatoryComplete = sectionCompletion[section.id];
          const isFullyComplete   = sectionFullCompletion[section.id];

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              title={collapsed ? section.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
              }`}
            >
              <span className="w-5 text-center shrink-0 leading-none">{section.icon}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1 truncate">{section.label}</span>
                  {isFullyComplete ? (
                    <span
                      className="w-[17px] h-[17px] rounded-full bg-green-500 dark:bg-green-600 flex items-center justify-center shrink-0"
                      title="Fully complete"
                    >
                      <span className="text-white text-[10px] leading-none font-bold">✓</span>
                    </span>
                  ) : isMandatoryComplete ? (
                    <span className="text-green-500 dark:text-green-400 text-xs shrink-0" title="Complete">✓</span>
                  ) : null}
                </>
              )}
              {collapsed && isMandatoryComplete && (
                <span className="absolute ml-6 text-green-500 dark:text-green-400 text-xs leading-none">·</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Resume AI + Settings — separated by a divider */}
      <div className={`border-t border-gray-200 dark:border-gray-800 pt-1 pb-0 ${collapsed ? 'flex flex-col items-center px-2 gap-0' : 'px-0'}`}>
        <button
          type="button"
          onClick={() => onSelect('resume')}
          title={collapsed ? 'Import Resume' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'resume'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0"><FileUp className="w-5 h-5" /></span>
          {!collapsed && (
            <span className="text-sm font-medium flex-1 truncate">
              Import Resume ✨
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect('learnedMappings')}
          title={collapsed ? 'Learned Mappings' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'learnedMappings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0"><Brain className="w-5 h-5" /></span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Learned Mappings</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'settings'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="shrink-0"><Settings className="w-5 h-5" /></span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Settings</span>
          )}
        </button>
      </div>

    </aside>
  );
}
