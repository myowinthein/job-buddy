import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { devContext } from './context';
import { SCENARIOS, type DevSection } from './scenarios';
import { clearDevEvents, getDevEvents, subscribeDevEvents } from './diagnostics';
import { readDevSnapshot, inspectProfile } from './inspect';
import { getSimulation } from './bootstrap';
import { calculateCompletion } from '@/src/utils/profileCompletion';
import { generateDiff } from '@/src/resume-ai/parser';
import { useToast } from '@/src/components/ui/useToast';
import { fieldCls } from '@/src/components/options/shared/fieldCls';

const primary =
  'inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors';
const secondary =
  'inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 transition-colors';
const sections: { id: DevSection; label: string }[] = [
  { id: 'profile', label: 'Profile Data' },
  { id: 'resume', label: 'Resume Import' },
  { id: 'ai', label: 'AI Features' },
  { id: 'drive', label: 'Cloud Backup' },
  { id: 'diagnostics', label: 'Diagnostics' },
];

function Panel({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="py-6 border-b border-gray-200 dark:border-gray-800 last:border-0">
      <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
      <p className="mt-1 mb-4 text-sm text-gray-500 dark:text-gray-400">{description}</p>
      {children}
    </section>
  );
}

function scenarioUrl(id: string) {
  const url = new URL(location.href);
  url.search = new URLSearchParams({ devScenario: id }).toString();
  return url.href;
}
function ScenarioPicker({ section }: { section: DevSection }) {
  const choices = SCENARIOS.filter(
    (scenario) => scenario.section === section && scenario.id !== 'workspace',
  );
  const [id, setId] = useState(choices[0]?.id ?? 'workspace');
  const selected = choices.find((scenario) => scenario.id === id);
  return (
    <div className="max-w-2xl">
      <label
        htmlFor={`dev-scenario-${section}`}
        className="block mb-1 text-sm font-medium text-gray-700 dark:text-gray-200"
      >
        Scenario
      </label>
      <select
        id={`dev-scenario-${section}`}
        value={id}
        onChange={(event) => setId(event.target.value)}
        className={fieldCls()}
      >
        {choices.map((scenario) => (
          <option key={scenario.id} value={scenario.id}>
            {scenario.label}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{selected?.description}</p>
      <a
        href={scenarioUrl(id)}
        target={devContext() ? '_self' : '_blank'}
        rel="noopener noreferrer"
        className={`${primary} mt-4`}
      >
        Run Scenario
      </a>
    </div>
  );
}

function JsonView({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-gray-100 dark:bg-gray-950 p-4 text-xs leading-relaxed text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

function download(name: string, value: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function DevToolsPage({
  onFocusField,
}: {
  onFocusField: (section: string, field: string) => void;
}) {
  const [section, setSection] = useState<DevSection>('profile');
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof readDevSnapshot>> | null>(
    null,
  );
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const events = useSyncExternalStore(subscribeDevEvents, getDevEvents);
  const { showToast } = useToast();
  const context = devContext();
  const simulation = getSimulation();
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      void readDevSnapshot()
        .then((value) => {
          if (active) {
            setSnapshot(value);
            setError('');
          }
        })
        .catch(() => {
          if (active) setError('Could not read local data. Try refreshing the inspector.');
        });
    }, 50);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [events, refresh]);
  const completion = snapshot?.completion ?? calculateCompletion({});
  const completionAvailable = !snapshot || snapshot.completion !== null;
  const version = context?.version ?? chrome.runtime.getManifest?.().version ?? 'preview';
  const extensionId = context?.extensionId ?? chrome.runtime.id ?? 'localhost-preview';
  const diagnosticReport = {
    version,
    extensionId,
    mode: context ? 'simulation' : chrome.runtime.id ? 'live inspection' : 'preview inspection',
    ...(context ? { scenario: context.scenario } : {}),
    storageBytes: snapshot?.storageBytes ?? 0,
    completion: completionAvailable ? completion.percentage : null,
    mappingSites: snapshot?.mappings ?? 0,
    aiModel: snapshot?.aiModel ?? null,
    drive: snapshot?.drive ?? null,
    events,
  };
  const copy = async (value: unknown) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
      showToast('success', 'Copied to clipboard.');
    } catch {
      showToast('error', 'Could not copy. Try downloading the JSON instead.');
    }
  };

  return (
    <div>
      <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Dev Tools</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Inspect saved data and run isolated test scenarios
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-gray-500 dark:text-gray-400">
          <p className="font-medium text-gray-800 dark:text-gray-200">
            {context ? 'Simulation' : chrome.runtime.id ? 'Live inspection' : 'Preview inspection'}{' '}
            <span className="font-normal">(v{version})</span>
          </p>
          <p className="mt-1 break-all">Extension ID: {extensionId}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRefresh((value) => value + 1)}
            className={secondary}
          >
            Refresh Inspector
          </button>
          {!context && (
            <a
              className={secondary}
              href={scenarioUrl('workspace')}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open Simulation
            </a>
          )}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        {context
          ? 'Sample data and provider responses stay in this tab. Refreshing restarts the scenario.'
          : 'The inspector reads local data. Running a scenario opens a separate simulation tab.'}
      </p>
      <nav
        aria-label="Development sections"
        className="mt-6 flex flex-wrap gap-x-5 gap-y-2 border-b border-gray-200 dark:border-gray-800"
      >
        {sections.map((item) => (
          <button
            type="button"
            key={item.id}
            onClick={() => setSection(item.id)}
            aria-current={section === item.id ? 'page' : undefined}
            className={`pb-3 text-sm font-medium border-b-2 ${section === item.id ? 'border-blue-600 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      {section === 'profile' && (
        <>
          <Panel
            title="Profile Presets"
            description="Open the profile editor with temporary sample data."
          >
            <ScenarioPicker section="profile" />
          </Panel>
          <Panel
            title="Saved Profile"
            description="Inspect the saved JSON. Document bytes are omitted; Export Profile provides a full backup."
          >
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              <span>{(snapshot?.storageBytes ?? 0).toLocaleString()} bytes in local storage</span>
              <span>
                {completionAvailable
                  ? `${completion.percentage}% required details complete`
                  : 'Completion unavailable'}
              </span>
            </div>
            <JsonView value={snapshot?.profile ?? {}} />
            <div className="flex gap-2 mt-3">
              <button
                type="button"
                className={secondary}
                onClick={() => void copy(snapshot?.profile ?? {})}
              >
                Copy JSON
              </button>
              <button
                type="button"
                className={secondary}
                onClick={() =>
                  download('job-buddy-profile-inspection.json', snapshot?.profile ?? {})
                }
              >
                Download JSON
              </button>
            </div>
          </Panel>
          <Panel
            title="Completion Checks"
            description="Select a missing detail to inspect its input."
          >
            {!completionAvailable ? (
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Required checks could not be calculated. Inspect the stored JSON for invalid field
                types.
              </p>
            ) : completion.isCoreComplete ? (
              <p className="text-sm text-green-700 dark:text-green-400">
                All 10 required checks pass.
              </p>
            ) : (
              <ul className="space-y-2">
                {completion.missingGroups.flatMap((group) =>
                  group.fields.map((field) => (
                    <li key={`${group.sectionId}-${field}`}>
                      <button
                        type="button"
                        onClick={() => onFocusField(group.sectionId, field)}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {group.sectionLabel}: {field}
                      </button>
                    </li>
                  )),
                )}
              </ul>
            )}
          </Panel>
        </>
      )}
      {section === 'resume' && (
        <>
          <Panel
            title="Resume Scenarios"
            description="Run the actual upload, extraction, review, and save flow with a sample PDF."
          >
            <ScenarioPicker section="resume" />
          </Panel>
          <Panel
            title="Extraction and Saved Changes"
            description="Inspect the simulated response and changes applied to temporary storage."
          >
            {simulation ? (
              <div className="space-y-4">
                <details>
                  <summary className="text-sm text-blue-600 cursor-pointer">
                    Sample AI response
                  </summary>
                  <JsonView
                    value={
                      simulation.lastResponseText
                        ? (() => {
                            try {
                              return JSON.parse(simulation.lastResponseText);
                            } catch {
                              return simulation.lastResponseText;
                            }
                          })()
                        : 'Run a resume scenario to capture a response.'
                    }
                  />
                </details>
                <details>
                  <summary className="text-sm text-blue-600 cursor-pointer">
                    Changes saved in this simulation
                  </summary>
                  <JsonView
                    value={generateDiff(
                      inspectProfile(simulation.initialProfile),
                      snapshot?.profile ?? {},
                    )
                      .filter((change) => change.status !== 'unchanged')
                      .map((change) => ({
                        field: change.label,
                        section: change.section,
                        value: change.displaySuggested,
                      }))}
                  />
                </details>
              </div>
            ) : (
              <p className="text-sm text-gray-500">
                Run a resume scenario, then open Dev Tools from the simulation indicator.
              </p>
            )}
          </Panel>
        </>
      )}
      {section === 'ai' && (
        <>
          <Panel
            title="AI Scenarios"
            description="Check setup states, model attempts, and fallback without calling Gemini."
          >
            <ScenarioPicker section="ai" />
          </Panel>
          <Panel title="Model Activity" description="Request status and duration from this tab.">
            <JsonView
              value={events.filter((event) =>
                ['model-request', 'key-check'].includes(event.operation ?? ''),
              )}
            />
          </Panel>
        </>
      )}
      {section === 'drive' && (
        <>
          <Panel
            title="Backup Scenarios"
            description="Exercise connection, review, upload, and retry using an in-memory Drive."
          >
            <ScenarioPicker section="drive" />
          </Panel>
          <Panel
            title="Backup State"
            description="Inspect local retry metadata and the simulated remote backup."
          >
            <JsonView value={snapshot?.drive ?? {}} />
            {simulation && (
              <>
                <details className="mt-4">
                  <summary className="text-sm text-blue-600 cursor-pointer">
                    Simulated Drive backup
                  </summary>
                  <JsonView
                    value={
                      simulation.backup
                        ? {
                            ...simulation.backup,
                            profile: inspectProfile(simulation.backup.profile),
                          }
                        : 'No backup stored'
                    }
                  />
                </details>
                <p className="mt-3 text-xs text-gray-500">
                  {simulation.pendingAlarms().find((alarm) => alarm.name.includes('retry'))
                    ? 'A background retry is scheduled.'
                    : 'No background retry is scheduled.'}
                </p>
                <button
                  type="button"
                  className={`${secondary} mt-3`}
                  disabled={
                    retrying ||
                    !simulation.pendingAlarms().some((alarm) => alarm.name.includes('retry'))
                  }
                  onClick={() => {
                    setRetrying(true);
                    void simulation.fireAlarm('jb:drive-backup-retry').finally(() => {
                      setRetrying(false);
                      setRefresh((value) => value + 1);
                    });
                  }}
                >
                  Run Pending Retry
                </button>
              </>
            )}
          </Panel>
        </>
      )}
      {section === 'diagnostics' && (
        <Panel
          title="Diagnostics"
          description="Events from this tab. Reports exclude profile contents, credentials, tokens, and document bytes."
        >
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" className={secondary} onClick={() => void copy(diagnosticReport)}>
              Copy Debug Info
            </button>
            <button
              type="button"
              className={secondary}
              onClick={() => download('job-buddy-diagnostics.json', diagnosticReport)}
            >
              Download Log
            </button>
            <button type="button" className={secondary} onClick={clearDevEvents}>
              Clear Log
            </button>
          </div>
          <JsonView value={diagnosticReport} />
        </Panel>
      )}
    </div>
  );
}
