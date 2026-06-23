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

function MenuIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="w-5 h-5"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

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
            <img src="/icon.svg" alt="" className="w-7 h-7 shrink-0" />
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
            <img src="/icon.svg" alt="Job Buddy" className="w-5 h-5" />
          ) : (
            <MenuIcon />
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
          title={collapsed ? 'Auto-fill from Resume' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'resume'
              ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800'
          }`}
        >
          <span className="w-5 text-center shrink-0 leading-none">✨</span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Auto-fill from Resume</span>
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
          <span className="shrink-0"><GearIcon /></span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Settings</span>
          )}
        </button>
      </div>

    </aside>
  );
}
