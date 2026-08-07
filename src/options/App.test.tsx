// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/utils/sessionStorage', () => ({
  sessionGet: vi.fn().mockResolvedValue({}),
  sessionRemove: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/src/utils/derivedFields', () => ({
  calculateDerivedFields: vi.fn(() => ({ fullName: 'Jane Doe' })),
}));
vi.mock('@/src/utils/driveSync', () => ({
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
}));

// Sidebar/CompletionBanner and every section component are replaced with
// minimal stand-ins — their own internals are covered by their dedicated
// test files. These stubs exist only to exercise App.tsx's own orchestration
// (save contract, reset timing, focus routing), including a couple of real
// focusable elements with the ids the real components would carry.
vi.mock('@/src/components/options/Sidebar', () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));
vi.mock('@/src/components/options/CompletionBanner', () => ({
  CompletionBanner: (props: { onNavigate: (id: string) => void; onFocusField: (id: string, field: string) => void }) => (
    <div>
      <button onClick={() => props.onFocusField('address', 'City')}>focus-city</button>
    </div>
  ),
}));
vi.mock('@/src/components/options/PersonalSection', () => ({
  PersonalSection: (props: { profile: { personal?: { firstName?: string } }; onSave: (u: object) => void }) => (
    <div>
      <span>personal-section:{props.profile.personal?.firstName ?? '(empty)'}</span>
      <button onClick={() => props.onSave({ personal: { firstName: 'Updated' } })}>save-personal</button>
    </div>
  ),
}));
vi.mock('@/src/components/options/AddressSection', () => ({
  AddressSection: () => (
    <div>
      <span>address-section</span>
      <input id="field-city" aria-label="City" />
    </div>
  ),
}));
vi.mock('@/src/components/options/SalarySection', () => ({ SalarySection: () => <div>salary-section</div> }));
vi.mock('@/src/components/options/WorkAuthorizationSection', () => ({ WorkAuthorizationSection: () => <div>workAuth-section</div> }));
vi.mock('@/src/components/options/WorkHistorySection', () => ({ WorkHistorySection: () => <div>workHistory-section</div> }));
vi.mock('@/src/components/options/EducationSection', () => ({ EducationSection: () => <div>education-section</div> }));
vi.mock('@/src/components/options/LanguagesSection', () => ({ LanguagesSection: () => <div>languages-section</div> }));
vi.mock('@/src/components/options/LinksSection', () => ({ LinksSection: () => <div>links-section</div> }));
vi.mock('@/src/components/options/DocumentsSection', () => ({ DocumentsSection: () => <div>documents-section</div> }));
vi.mock('@/src/components/options/ResumeImportSection', () => ({ ResumeImportSection: () => <div>resume-section</div> }));
vi.mock('@/src/components/options/LearnedMappingsSection', () => ({ LearnedMappingsSection: () => <div>learnedMappings-section</div> }));
vi.mock('@/src/components/options/SettingsSection', () => ({
  SettingsSection: (props: { onImportComplete: (afterLoad?: () => void) => void; onResetComplete: () => void }) => (
    <div>
      <span>settings-section</span>
      <input id="gemini-api-key" aria-label="Gemini API Key" />
      <button onClick={() => props.onResetComplete()}>trigger-reset</button>
    </div>
  ),
}));

vi.stubGlobal('chrome', {
  storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
});

import App from '@/entrypoints/options/App';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getProfile, saveProfile } from '@/src/utils/storage';
import { sessionGet } from '@/src/utils/sessionStorage';
import { calculateDerivedFields } from '@/src/utils/derivedFields';
import { syncProfileToDrive } from '@/src/utils/driveSync';
import type { Profile } from '@/src/types/profile';

function renderApp() {
  render(
    <ToastProvider>
      <App />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sessionStorage.clear();
  // jsdom doesn't implement Element.scrollTo/scrollIntoView; App.tsx calls
  // both (section-nav reset, and focus-target scrolling).
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  // mockReset (not just clearAllMocks, which never touches queued
  // once-implementations) guarantees no leftover mockImplementationOnce from
  // a test that failed before consuming its queue can bleed into the next.
  vi.mocked(getProfile).mockReset().mockResolvedValue({ personal: { firstName: 'Jane' } } as Profile);
  vi.mocked(sessionGet).mockResolvedValue({});
  vi.mocked(calculateDerivedFields).mockReturnValue({ fullName: 'Jane Doe' } as ReturnType<typeof calculateDerivedFields>);
  vi.mocked(syncProfileToDrive).mockResolvedValue({ success: true, errorCode: null });
});

afterEach(cleanup);

describe('options App — handleSave contract', () => {
  it('merges derived fields into a single saveProfile call on the happy path', async () => {
    renderApp();
    fireEvent.click(await screen.findByText('save-personal'));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveProfile).mock.calls[0][0];
    expect(saved.personal?.firstName).toBe('Updated');
    expect(saved.derived).toEqual({ fullName: 'Jane Doe' });
  });

  it('still saves the merged profile (without derived fields) when derivation throws', async () => {
    vi.mocked(calculateDerivedFields).mockImplementation(() => { throw new Error('boom'); });
    renderApp();
    fireEvent.click(await screen.findByText('save-personal'));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(saveProfile).mock.calls[0][0];
    expect(saved.personal?.firstName).toBe('Updated');
    expect(saved.derived).toBeUndefined();
  });

  it('shows a warning toast when the fire-and-forget Drive sync fails, without blocking the save', async () => {
    vi.mocked(syncProfileToDrive).mockResolvedValue({ success: false, errorCode: 'sync_error' });
    renderApp();
    fireEvent.click(await screen.findByText('save-personal'));

    await waitFor(() => expect(vi.mocked(saveProfile)).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Profile saved. Drive sync failed, will retry.')).toBeTruthy();
  });
});

describe('options App — reset timing', () => {
  it('bumps sectionSeq/activeSection only after the reloaded profile is in state, never showing a stale remount', async () => {
    sessionStorage.setItem('jb:ui:section', 'settings'); // land directly on Settings, no Sidebar mock needed
    let resolveSecondLoad!: (p: Profile) => void;
    vi.mocked(getProfile)
      .mockResolvedValueOnce({ personal: { firstName: 'Jane' } } as Profile) // initial load
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondLoad = resolve; })); // reset reload

    renderApp();
    await screen.findByText('settings-section');

    fireEvent.click(await screen.findByText('trigger-reset'));

    // Still on the settings section — must not remount/navigate before the
    // reloaded profile actually lands in state.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.getByText('settings-section')).toBeTruthy();
    expect(screen.queryByText(/personal-section/)).toBeNull();

    await act(async () => { resolveSecondLoad({ personal: { firstName: 'Reset Jane' } } as Profile); });

    await waitFor(() => expect(screen.getByText('personal-section:Reset Jane')).toBeTruthy());
  });
});

describe('options App — focus routing', () => {
  it('switches to Settings and focuses the Gemini API key input on a popup focus handoff', async () => {
    vi.mocked(sessionGet).mockResolvedValue({ 'jb:focusOnLoad': 'gemini-api-key' });
    renderApp();

    await waitFor(() => expect(screen.getByText('settings-section')).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.id).toBe('gemini-api-key'));
  });

  it('navigates to a section and focuses the target field when the completion banner requests it', async () => {
    renderApp();
    fireEvent.click(await screen.findByText('focus-city'));

    await waitFor(() => expect(screen.getByText('address-section')).toBeTruthy());
    await waitFor(() => expect(document.activeElement?.id).toBe('field-city'));
  });
});
