// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { Sidebar } from './Sidebar';
import { getGeminiSettings, type GeminiSettings } from '@/src/utils/storage';

vi.mock('@/src/utils/storage', () => ({ getGeminiSettings: vi.fn() }));

const empty: GeminiSettings = {
  apiKey: null,
  model: null,
  preference: 'auto',
  revision: null,
  verifiedAt: null,
};
const configured: GeminiSettings = {
  ...empty,
  apiKey: 'test-key',
  model: 'gemini-3.5-flash-lite',
  revision: 'saved',
};
const storageChanges = { addListener: vi.fn(), removeListener: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getGeminiSettings).mockReset().mockResolvedValue(empty);
  vi.stubGlobal('chrome', { storage: { onChanged: storageChanges } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const onSelect = vi.fn();
  const onToggle = vi.fn();
  render(
    <Sidebar
      activeSection="personal"
      onSelect={onSelect}
      collapsed={false}
      onToggle={onToggle}
      sectionCompletion={{}}
      {...overrides}
    />,
  );
  return { onSelect, onToggle };
}

describe('Sidebar — section navigation', () => {
  it('calls onSelect with the section id when a profile section is clicked', () => {
    const { onSelect } = renderSidebar();
    fireEvent.click(screen.getByText('Address'));
    expect(onSelect).toHaveBeenCalledWith('address');
  });

  it('calls onSelect for the Resume, Learned Mappings, and Settings buttons', () => {
    const { onSelect } = renderSidebar();
    fireEvent.click(screen.getByRole('button', { name: 'Import Resume' }));
    expect(onSelect).toHaveBeenCalledWith('resume');
    fireEvent.click(screen.getByText('Learned Mappings'));
    expect(onSelect).toHaveBeenCalledWith('learnedMappings');
    fireEvent.click(screen.getByText('Settings'));
    expect(onSelect).toHaveBeenCalledWith('settings');
  });

  it('calls onToggle when the collapse button is clicked', () => {
    const { onToggle } = renderSidebar();
    fireEvent.click(screen.getByTitle('Collapse sidebar'));
    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});

describe('Sidebar — collapsed state', () => {
  it('hides section labels and the brand name when collapsed, using title attributes instead', () => {
    renderSidebar({ collapsed: true });
    expect(screen.queryByText('Job Buddy')).toBeNull();
    expect(screen.queryByText('Address')).toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
    expect(screen.queryByText('Tools')).toBeNull();
    expect(screen.getByRole('button', { name: 'Address' })).toBeTruthy();
    expect(screen.getByTitle('Expand sidebar')).toBeTruthy();
  });
});

describe('Sidebar — completion badges', () => {
  it('shows one checkmark when required details are complete', () => {
    renderSidebar({ sectionCompletion: { address: true } });
    const addressButton = screen.getByText('Address').closest('button')!;
    expect(addressButton.querySelector('[title="Required details complete"]')).toBeTruthy();
  });

  it('shows a dot when required details remain', () => {
    renderSidebar({ sectionCompletion: { address: false } });
    const addressButton = screen.getByText('Address').closest('button')!;
    const indicator = addressButton.querySelector('[title="Required details remaining"]');
    expect(indicator).toBeTruthy();
    expect(indicator!.querySelector('svg')).toBeNull();
  });
});

it.each([false, true])('explains section status when collapsed=%s', (collapsed) => {
  render(
    <Sidebar
      activeSection="personal"
      onSelect={vi.fn()}
      collapsed={collapsed}
      onToggle={vi.fn()}
      sectionCompletion={{ personal: true, address: true }}
    />,
  );
  const personal = screen.getByRole('button', { name: 'Personal' });
  const address = screen.getByRole('button', { name: 'Address' });
  const salary = screen.getByRole('button', { name: 'Salary' });
  expect(document.getElementById(personal.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Required details complete',
  );
  expect(document.getElementById(address.getAttribute('aria-describedby')!)?.textContent).toBe(
    'Required details complete',
  );
  expect(document.getElementById(salary.getAttribute('aria-describedby')!)?.textContent).toBe(
    'No details added',
  );
  expect(personal.title).toContain('Required details complete');
});

describe('Sidebar — AI setup indicator', () => {
  it.each([false, true])(
    'describes saved AI configuration when collapsed=%s',
    async (collapsed) => {
      vi.mocked(getGeminiSettings).mockResolvedValue(configured);
      renderSidebar({ collapsed });
      const resume = screen.getByRole('button', { name: 'Import Resume' });
      await waitFor(() => expect(resume.title).toBe('Import your resume with AI.'));
      expect(document.getElementById(resume.getAttribute('aria-describedby')!)?.textContent).toBe(
        'Import your resume with AI.',
      );
    },
  );

  it.each([empty, { ...configured, model: null }])(
    'keeps setup guidance and navigation without complete AI settings',
    async (settings) => {
      vi.mocked(getGeminiSettings).mockResolvedValue(settings);
      const { onSelect } = renderSidebar();
      const resume = screen.getByRole('button', { name: 'Import Resume' });
      await waitFor(() => expect(getGeminiSettings).toHaveBeenCalledOnce());
      expect(resume.title).toBe('Add a Gemini API key to import your resume with AI.');
      expect(resume.hasAttribute('disabled')).toBe(false);
      fireEvent.click(resume);
      expect(onSelect).toHaveBeenCalledWith('resume');
    },
  );

  it('updates immediately after local save and removal events and cleans up its listener', async () => {
    const view = render(
      <Sidebar
        activeSection="personal"
        onSelect={vi.fn()}
        collapsed={false}
        onToggle={vi.fn()}
        sectionCompletion={{}}
      />,
    );
    const resume = screen.getByRole('button', { name: 'Import Resume' });
    await waitFor(() => expect(getGeminiSettings).toHaveBeenCalledOnce());
    const changed = storageChanges.addListener.mock.calls[0][0];
    vi.mocked(getGeminiSettings).mockResolvedValue(configured);
    act(() => changed({ geminiApiKey: {} }, 'local'));
    await waitFor(() => expect(resume.title).toBe('Import your resume with AI.'));
    vi.mocked(getGeminiSettings).mockResolvedValue(empty);
    act(() => changed({ geminiSettingsMeta: {} }, 'local'));
    await waitFor(() => expect(resume.title).toContain('Add a Gemini API key'));
    act(() => changed({ geminiApiKey: {} }, 'session'));
    expect(getGeminiSettings).toHaveBeenCalledTimes(3);
    view.unmount();
    expect(storageChanges.removeListener).toHaveBeenCalledWith(changed);
  });

  it('does not restore an outdated configured indicator after a reset', async () => {
    let finish!: (settings: GeminiSettings) => void;
    vi.mocked(getGeminiSettings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    renderSidebar();
    const changed = storageChanges.addListener.mock.calls[0][0];
    await act(async () => {
      changed({ geminiSettingsMeta: {} }, 'local');
    });
    await act(async () => {
      finish(configured);
    });
    expect(screen.getByRole('button', { name: 'Import Resume' }).title).toContain(
      'Add a Gemini API key',
    );
  });

  it('retains navigation when saved settings cannot be read', async () => {
    vi.mocked(getGeminiSettings).mockRejectedValue(new Error('Storage unavailable'));
    const { onSelect } = renderSidebar();
    await act(async () => {
      await Promise.resolve();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Import Resume' }));
    expect(onSelect).toHaveBeenCalledWith('resume');
  });
});
