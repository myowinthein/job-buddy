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

function UploadIcon() {
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
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 7.5m0 0L7.5 12M12 7.5v9" />
    </svg>
  );
}

interface SidebarProps {
  activeSection: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  sectionCompletion: Record<string, boolean>;
  onImportClick: () => void;
  isCoreComplete: boolean;
  optionalSections: Set<string>;
}

export function Sidebar({
  activeSection,
  onSelect,
  collapsed,
  onToggle,
  sectionCompletion,
  onImportClick,
  isCoreComplete,
  optionalSections,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-200 shrink-0 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
      {/* Header: hamburger toggle + "Profile Sections" label */}
      <div className={`flex items-center gap-2 px-3 h-16 border-b border-gray-100 ${collapsed ? 'justify-center' : ''}`}>
        <button
          type="button"
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500 shrink-0"
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <MenuIcon />
        </button>
        {!collapsed && (
          <span className="text-sm font-semibold text-gray-800 truncate">Profile Sections</span>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-2">
        {SECTIONS.map((section) => {
          const isActive = activeSection === section.id;
          const isComplete = sectionCompletion[section.id];

          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSelect(section.id)}
              title={collapsed ? section.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                isActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
            >
              <span className="text-base shrink-0">{section.icon}</span>
              {!collapsed && (
                <>
                  <span className="text-sm font-medium flex-1 truncate">{section.label}</span>
                  {isComplete && (
                    <span className="flex items-center gap-0.5 shrink-0">
                      <span className="text-green-500 text-xs" title="Complete">✓</span>
                      {isCoreComplete && optionalSections.has(section.id) && (
                        <span className="text-gray-400 text-[8px] leading-none" title="Optional fields available">●</span>
                      )}
                    </span>
                  )}
                </>
              )}
              {collapsed && isComplete && (
                <span className="absolute ml-6 text-green-500 text-xs leading-none">·</span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Settings — separated by a divider */}
      <div className={`border-t border-gray-200 pt-1 pb-0 ${collapsed ? 'flex justify-center px-2' : 'px-0'}`}>
        <button
          type="button"
          onClick={() => onSelect('settings')}
          title={collapsed ? 'Settings' : undefined}
          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
            activeSection === 'settings'
              ? 'bg-blue-50 text-blue-700'
              : 'text-gray-700 hover:bg-gray-50'
          }`}
        >
          <span className="shrink-0"><GearIcon /></span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Settings</span>
          )}
        </button>
      </div>

      {/* Import Resume — separated by a divider */}
      <div className={`border-t border-gray-200 p-2 ${collapsed ? 'flex justify-center' : ''}`}>
        <button
          type="button"
          onClick={onImportClick}
          title={collapsed ? 'Import Resume' : undefined}
          className="w-full flex items-center gap-3 px-3 py-2.5 text-left text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
        >
          <span className="shrink-0"><UploadIcon /></span>
          {!collapsed && (
            <span className="text-sm font-medium truncate">Import Resume</span>
          )}
        </button>
      </div>
    </aside>
  );
}
