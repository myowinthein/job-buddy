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
  sectionCompletion: Record<string, boolean>;
}

export function Sidebar({
  activeSection,
  onSelect,
  collapsed,
  sectionCompletion,
}: SidebarProps) {
  return (
    <aside
      className={`flex flex-col bg-white border-r border-gray-200 transition-all duration-200 shrink-0 ${
        collapsed ? 'w-16' : 'w-56'
      }`}
    >
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
                    <span className="text-green-500 text-xs shrink-0" title="Complete">✓</span>
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
    </aside>
  );
}
