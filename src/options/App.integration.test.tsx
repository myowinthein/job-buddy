// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

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
const { saveOutcome } = vi.hoisted(() => ({ saveOutcome: vi.fn() }));
vi.mock('@/src/components/options/PersonalSection', () => ({
  PersonalSection: (props: { profile: { personal?: { firstName?: string } }; onSave: (u: object) => Promise<void> }) => (
    <div>
      <span>personal-section:{props.profile.personal?.firstName ?? '(empty)'}</span>
      <button onClick={() => { void props.onSave({ personal: { firstName: 'Updated' } }).then(() => saveOutcome('success'), () => saveOutcome('failure')); }}>save-personal</button>
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

describe('options App — real section persistence', () => {
  it('keeps the document draft on quota failure, reports one error, and retries successfully', async () => {
    sessionStorage.setItem('jb:ui:section', 'documents');
    vi.mocked(getProfile).mockResolvedValue({ documents: { cv: { url: 'https://example.com/cv.pdf' } } } as Profile);
    vi.mocked(saveProfile).mockRejectedValueOnce(new Error('synthetic quota error'));
    renderApp();
    fireEvent.click(await screen.findByText('Save Documents'));
    expect(await screen.findByText('Failed to save: storage may be full.')).toBeTruthy();
    expect(screen.queryByText('Documents saved')).toBeNull();
    expect(screen.queryByText('Failed to save. Please try again.')).toBeNull();
    expect((screen.getByPlaceholderText('https://drive.google.com/file/...') as HTMLInputElement).value).toBe('https://example.com/cv.pdf');
    expect(syncProfileToDrive).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Save Documents'));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Documents saved')).toBeTruthy();
    expect(vi.mocked(saveProfile).mock.calls[1][0].documents.cv.url).toBe('https://example.com/cv.pdf');
  });
});
