// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Profile } from '@/src/types/profile';
import type { LearnedMappings } from '@/src/types/storage';
import { ToastProvider } from '@/src/components/ui/Toast';
import { equalJsonValues } from '@/src/utils/equalJsonValues';
import { feedback } from '@/src/ui/feedback';
import { LearnedMappingsSection } from './LearnedMappingsSection';
import {
  getProfile,
  getLearnedMappings,
  getLearningContext,
  saveLearnedMappings,
} from '@/src/utils/storage';

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn(),
  getLearnedMappings: vi.fn(),
  getLearningContext: vi.fn(),
  saveLearnedMappings: vi.fn(),
}));
let mappings: LearnedMappings;
let profile: Profile;
const entry = (path = 'personal.firstName', count = 2, label = 'Applicant name') => ({
  path,
  count,
  label,
  question: label,
  scope: 'field' as const,
});
function mount(props: Parameters<typeof LearnedMappingsSection>[0] = {}) {
  return render(
    <ToastProvider>
      <LearnedMappingsSection {...props} />
    </ToastProvider>,
  );
}
const site = (domain = 'acme.com') =>
  screen.getByRole('button', { name: new RegExp('^' + domain.replaceAll('.', '\\.')) });
async function open(domain = 'acme.com') {
  await screen.findByRole('button', { name: new RegExp('^' + domain.replaceAll('.', '\\.')) });
  fireEvent.click(site(domain));
}
const row = (label = 'Applicant name') => screen.getByRole('group', { name: label });
const edit = (label = 'Applicant name') =>
  fireEvent.click(within(row(label)).getByRole('button', { name: /^Edit / }));
function choose(label: string) {
  fireEvent.click(screen.getByRole('button', { name: /^Profile field:|^Choose a profile field/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Search profile fields' }), {
    target: { value: label },
  });
  fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
}
async function change(
  changes: Record<string, chrome.storage.StorageChange>,
  area: 'local' | 'session' = 'local',
) {
  const handler = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
  await act(async () => handler(changes, area));
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(0), 0),
  );
  vi.stubGlobal('cancelAnimationFrame', clearTimeout);
  vi.stubGlobal('chrome', {
    storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
  });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  profile = {
    id: 'p',
    personal: { firstName: 'Alex', lastName: 'Morgan' },
    address: { city: 'Seattle' },
    links: { linkedin: '' },
  } as Profile;
  mappings = { 'acme.com': { applicant: entry() } };
  vi.mocked(getProfile).mockImplementation(async () => structuredClone(profile));
  vi.mocked(getLearnedMappings).mockImplementation(async () => structuredClone(mappings));
  vi.mocked(getLearningContext).mockImplementation(async (captured) =>
    equalJsonValues(captured, profile) ? { profileId: 'p', revision: null } : null,
  );
  vi.mocked(saveLearnedMappings).mockImplementation(async (next) => {
    mappings = structuredClone(next);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Learned Mappings pagination', () => {
  function manySites() {
    mappings = Object.fromEntries(
      Array.from({ length: 7 }, (_, i) => [
        `site${i + 1}.test`,
        { name: entry('personal.firstName', i === 6 ? 1 : 2, `Question ${i + 1}`) },
      ]),
    );
  }
  it('pages five sites at a time, keeps expansion on return, and searches all sites', async () => {
    manySites();
    mount();
    await open('site1.test');
    const nav = screen.getByRole('navigation', { name: 'Learned mapping sites' });
    expect(within(nav).getByText('Sites 1–5 of 7')).toBeTruthy();
    expect(within(nav).getByRole('status').textContent).toContain('7 mappings');
    expect(within(nav).getByRole('button', { name: 'Previous page' })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByRole('button', { name: /^site6.test/ })).toBeNull();
    fireEvent.click(within(nav).getByRole('button', { name: 'Next page' }));
    expect(within(nav).getByText('Sites 6–7 of 7')).toBeTruthy();
    expect(within(nav).getByRole('button', { name: 'Next page' })).toHaveProperty('disabled', true);
    expect(screen.queryByRole('button', { name: /^site1.test/ })).toBeNull();
    fireEvent.click(within(nav).getByRole('button', { name: 'Previous page' }));
    expect(site('site1.test')).toHaveProperty('ariaExpanded', 'true');
    fireEvent.click(within(nav).getByRole('button', { name: 'Next page' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Question 1' } });
    expect(row('Question 1')).toBeTruthy();
    expect(screen.queryByRole('navigation')).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getByText('Sites 1–5 of 7')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    fireEvent.click(screen.getByRole('button', { name: 'Learning (1)' }));
    expect(row('Question 7')).toBeTruthy();
    expect(screen.getByText('1 mapping across 1 site')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All (7)' }));
    expect(screen.getByText('Sites 1–5 of 7')).toBeTruthy();
  });
  it('returns to the last available page when live deletions remove the current page', async () => {
    manySites();
    mount();
    await screen.findByText('Sites 1–5 of 7');
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }));
    delete mappings['site6.test'];
    delete mappings['site7.test'];
    await change({ learnedMappings: { newValue: mappings } });
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(site('site1.test')).toBeTruthy();
    mappings['site6.test'] = { name: entry() };
    await change({ learnedMappings: { newValue: mappings } });
    expect(screen.getByText('Sites 1–5 of 6')).toBeTruthy();
  });
  it('reveals mappings in batches, focuses the first new row and finds hidden matches', async () => {
    mappings = {
      'acme.com': Object.fromEntries(
        Array.from({ length: 45 }, (_, i) => [
          `q${String(i).padStart(2, '0')}`,
          entry('personal.firstName', 2, `Question ${i + 1}`),
        ]),
      ),
    };
    mount();
    await open();
    expect(screen.getAllByRole('group', { name: /^Question / })).toHaveLength(20);
    expect(screen.getByText('Showing 20 of 45 mappings')).toBeTruthy();
    expect(screen.getByText('25 remaining')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Show 20 more/ }));
    expect(screen.getAllByRole('group', { name: /^Question / })).toHaveLength(40);
    await waitFor(() => expect(document.activeElement).toBe(row('Question 21')));
    fireEvent.click(screen.getByRole('button', { name: /^Show 5 more/ }));
    expect(screen.getAllByRole('group', { name: /^Question / })).toHaveLength(45);
    await waitFor(() => expect(document.activeElement).toBe(row('Question 41')));
    expect(screen.queryByRole('button', { name: /^Show .* more/ })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Question 45' } });
    expect(row('Question 45')).toBeTruthy();
    expect(screen.getAllByRole('group', { name: /^Question / })).toHaveLength(1);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '' } });
    expect(screen.getAllByRole('group', { name: /^Question / })).toHaveLength(20);
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });
});

describe('Learned Mappings presentation and discovery', () => {
  it('uses the current learning copy, readable destinations and contextual action names', async () => {
    mount();
    await open();
    expect(
      screen.getByText('Review and manage the profile fields remembered for each site'),
    ).toBeTruthy();
    expect(screen.getByText('Personal → First Name')).toBeTruthy();
    expect(within(row()).queryByText('personal.firstName')).toBeNull();
    expect(screen.getByRole('button', { name: 'Edit Applicant name on acme.com' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Delete mapping Applicant name on acme.com' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete all mappings for acme.com' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /^acme.com/ }).getAttribute('aria-controls'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Expand' })).toBeNull();
    expect(row().querySelector('details')).toBeNull();
  });
  it('distinguishes learning, trusted legacy, inactive and empty-data states', async () => {
    mappings = {
      'acme.com': {
        one: entry('personal.firstName', 1, 'First name'),
        legacy: 'personal.lastName',
        inactive: { ...entry('personal.firstName', 2, 'Inactive name'), inactive: true },
        empty: entry('links.linkedin', 2, 'LinkedIn'),
      },
    };
    mount();
    await open();
    expect(within(row('First name')).getByText('Learning')).toBeTruthy();
    expect(within(row('Unlabelled field')).getByText('Trusted')).toBeTruthy();
    expect(within(row('Inactive name')).getByText('Inactive')).toBeTruthy();
    expect(within(row('Inactive name')).queryByText('No saved profile data.')).toBeNull();
    expect(within(row('LinkedIn')).getByText('No saved profile data.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All (4)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Trusted (2)' })).toBeTruthy();
  });
  it('groups identical aliases visually without modifying storage and counts questions rather than keys', async () => {
    mappings = {
      'acme.com': {
        label: entry(),
        field001: entry(),
        different: entry('personal.lastName', 2, 'Surname'),
      },
    };
    mount();
    await open();
    expect(screen.getAllByRole('group', { name: 'Applicant name' })).toHaveLength(1);
    expect(screen.getByText('2 mappings across 1 site')).toBeTruthy();
    expect(within(row()).queryByText('field001')).toBeNull();
    expect(within(row()).queryByText('label')).toBeNull();
    expect(mappings['acme.com']).toHaveProperty('field001');
    expect(mappings['acme.com']).toHaveProperty('label');
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });
  it('searches questions and destinations, expands matches, and restores the earlier expansion on clear', async () => {
    mappings = {
      'acme.com': { first: entry(), city: entry('address.city', 1, 'Town of residence') },
      'beta.com': { first: entry() },
    };
    mount();
    await open();
    const input = screen.getByRole('searchbox', { name: 'Search mappings' });
    fireEvent.change(input, { target: { value: 'address city' } });
    expect(screen.getByText('1 mapping across 1 site')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Town of residence' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Applicant name' })).toBeNull();
    expect(site().getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(input, { target: { value: '' } });
    expect(site().getAttribute('aria-expanded')).toBe('true');
    expect(site('beta.com').getAttribute('aria-expanded')).toBe('false');
    fireEvent.change(input, { target: { value: 'BETA.COM' } });
    expect(screen.getByText('1 mapping across 1 site')).toBeTruthy();
    expect(site('beta.com').getAttribute('aria-expanded')).toBe('true');
    expect(screen.queryByRole('button', { name: /^acme.com/ })).toBeNull();
  });
  it('filters by status with contextual counts and leaves an active zero filter clearable', async () => {
    mappings = { 'acme.com': { first: entry(), city: entry('address.city', 1, 'Town') } };
    mount();
    await screen.findByRole('button', { name: 'Learning (1)' });
    fireEvent.click(screen.getByRole('button', { name: 'Learning (1)' }));
    expect(screen.getByRole('group', { name: 'Town' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Applicant name' })).toBeNull();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Applicant' } });
    expect(screen.getByRole('button', { name: 'Learning (0)' })).toHaveProperty('disabled', false);
    expect(screen.getByText('No mappings match this search or filter.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'All (1)' }));
    expect(screen.getByRole('group', { name: 'Applicant name' })).toBeTruthy();
  });
  it('keeps the initial empty state distinct from search results', async () => {
    mappings = {};
    mount();
    expect(
      await screen.findByText(
        'No learned mappings yet. Correct an answer on a job form to start learning.',
      ),
    ).toBeTruthy();
    expect(screen.queryByRole('searchbox')).toBeNull();
  });
  it('orders sites by mapping count with alphabetical ties', async () => {
    mappings = {
      'zeta.com': { a: entry() },
      'many.com': { a: entry(), b: entry('personal.lastName', 2, 'Surname') },
      'alpha.com': { a: entry() },
    };
    mount();
    await screen.findByRole('button', { name: /^many.com/ });
    const summaries = screen
      .getAllByRole('button')
      .filter((button) => button.hasAttribute('aria-controls'))
      .map((button) => button.textContent);
    expect(summaries).toEqual(['many.com2 mappings', 'alpha.com1 mapping', 'zeta.com1 mapping']);
  });
  it('provides one accessible explanation on focus and click', async () => {
    mount();
    await screen.findByRole('button', { name: 'How learned mappings work' });
    const help = screen.getByRole('button', { name: 'How learned mappings work' });
    fireEvent.focus(help);
    expect(screen.getByRole('tooltip').textContent).toContain('AI answers do not teach mappings.');
    fireEvent.keyDown(help, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.click(help);
    expect(screen.getByRole('tooltip')).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

describe('explicit corrections and guarded writes', () => {
  it('preserves label and question metadata for every alias when correcting a mapping', async () => {
    mappings = { 'acme.com': { applicant: entry(), alias: entry() } };
    mount();
    await open();
    edit();
    choose('Last Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveLearnedMappings).toHaveBeenCalled());
    expect(mappings['acme.com'].applicant).toEqual({
      ...entry('personal.lastName'),
      scope: 'entry',
    });
    expect(mappings['acme.com'].alias).toEqual({ ...entry('personal.lastName'), scope: 'entry' });
    expect(vi.mocked(saveLearnedMappings).mock.calls[0][1]).toMatchObject({
      strictBase: true,
      context: { profileId: 'p' },
    });
    expect(await screen.findByText(feedback.mappingSaved)).toBeTruthy();
    expect(row()).toBeTruthy();
  });
  it.each(['Learning', 'Inactive'] as const)(
    'an explicit save trusts a usable %s mapping immediately',
    async (status) => {
      mappings = {
        'acme.com': {
          applicant: {
            ...entry('personal.firstName', status === 'Learning' ? 1 : 2),
            ...(status === 'Inactive' ? { inactive: true as const } : {}),
          },
        },
      };
      mount();
      await open();
      edit();
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(saveLearnedMappings).toHaveBeenCalled());
      expect(mappings['acme.com'].applicant).toEqual({ ...entry(), scope: 'entry' });
    },
  );
  it('disables unchanged trusted saves', async () => {
    mount();
    await open();
    edit();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });
  it('keeps the selected draft after a failed save and lets the user retry', async () => {
    vi.mocked(saveLearnedMappings).mockRejectedValueOnce(new Error('quota'));
    mount();
    await open();
    edit();
    choose('Last Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(feedback.sectionSaveFailed)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Profile field: Personal → Last Name' }),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(feedback.mappingSaved)).toBeTruthy();
    expect(mappings['acme.com'].applicant).toMatchObject({ path: 'personal.lastName' });
  });
  it('disables the action area until a pending write finishes', async () => {
    let finish!: () => void;
    vi.mocked(saveLearnedMappings).mockImplementationOnce(
      (next) =>
        new Promise((resolve) => {
          finish = () => {
            mappings = structuredClone(next);
            resolve();
          };
        }),
    );
    mount();
    await open();
    edit();
    choose('Last Name');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(saveLearnedMappings).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Saving…' })).toHaveProperty('disabled', true);
    expect(screen.getByRole('button', { name: 'Cancel' })).toHaveProperty('disabled', true);
    expect(
      screen.getByRole('button', { name: 'Profile field: Personal → Last Name' }),
    ).toHaveProperty('disabled', true);
    await act(async () => finish());
    expect(await screen.findByText(feedback.mappingSaved)).toBeTruthy();
  });
  it('updates profile availability live and opens the matching profile section', async () => {
    const onOpenProfile = vi.fn();
    mappings = { 'acme.com': { linkedin: entry('links.linkedin', 2, 'LinkedIn') } };
    mount({ onOpenProfile });
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Open profile' }));
    expect(onOpenProfile).toHaveBeenCalledWith(
      'links.linkedin',
      expect.objectContaining({ id: 'p' }),
    );
    profile = { ...profile, links: { linkedin: 'https://www.linkedin.com/in/example/' } };
    await change({ profile: { newValue: profile } });
    await waitFor(() => expect(screen.queryByText('No saved profile data.')).toBeNull());
  });
  it('requires another selection after a profile change while editing', async () => {
    mount();
    await open();
    edit();
    choose('Last Name');
    profile = { ...profile, personal: { ...profile.personal, firstName: 'Updated' } };
    await change({ profile: { newValue: profile } });
    expect(await screen.findByText(feedback.mappingProfileChanged)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    choose('Last Name');
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', false);
  });
  it('does not overwrite another correction that arrives while editing', async () => {
    mount();
    await open();
    edit();
    choose('Last Name');
    mappings = { 'acme.com': { applicant: entry('address.city') } };
    await change({ learnedMappings: { newValue: mappings } });
    expect(await screen.findByText(feedback.mappingChanged)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Save' })).toHaveProperty('disabled', true);
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });
});

describe('deletion, failure recovery and storage subscriptions', () => {
  it('deletes only a question and its equivalent aliases', async () => {
    mappings = {
      'acme.com': {
        applicant: entry(),
        alias: entry(),
        surname: entry('personal.lastName', 2, 'Surname'),
      },
    };
    mount();
    await open();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete mapping Applicant name on acme.com' }),
    );
    expect(screen.getByText('Delete this mapping for “Applicant name” on acme.com?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(feedback.mappingDeleted)).toBeTruthy();
    expect(Object.keys(mappings['acme.com'])).toEqual(['surname']);
  });
  it('deletes a whole site with a clearly scoped confirmation and preserves other sites', async () => {
    mappings['beta.com'] = { other: entry() };
    mount();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all mappings for acme.com' }));
    expect(screen.getByText('Delete all 1 mapping for acme.com?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(feedback.mappingsSiteDeleted)).toBeTruthy();
    expect(Object.keys(mappings)).toEqual(['beta.com']);
  });
  it('cancels deletion with Escape without saving', async () => {
    mount();
    await open();
    fireEvent.click(
      screen.getByRole('button', { name: 'Delete mapping Applicant name on acme.com' }),
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cancel' }), {
      key: 'Escape',
    });
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    expect(saveLearnedMappings).not.toHaveBeenCalled();
  });
  it('restores a persistent load error with Retry instead of claiming nothing is learned', async () => {
    vi.mocked(getLearnedMappings).mockRejectedValueOnce(new Error('read failed'));
    mount();
    expect(await screen.findByRole('alert')).toHaveProperty(
      'textContent',
      expect.stringContaining(feedback.mappingsLoadFailed),
    );
    expect(screen.queryByText(/No learned mappings yet/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('button', { name: /^acme.com/ })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('retains the site after a failed deletion', async () => {
    vi.mocked(saveLearnedMappings).mockRejectedValueOnce(new Error('quota'));
    mount();
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all mappings for acme.com' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(await screen.findByText(feedback.sectionSaveFailed)).toBeTruthy();
    expect(site()).toBeTruthy();
    expect(mappings['acme.com']).toBeTruthy();
  });
  it('follows background mapping changes and ignores other storage areas', async () => {
    mount();
    await open();
    await change({ learnedMappings: { newValue: { 'ignored.com': { a: entry() } } } }, 'session');
    expect(site()).toBeTruthy();
    mappings = { 'beta.com': { a: entry() } };
    await change({ learnedMappings: { newValue: mappings } });
    expect(await screen.findByRole('button', { name: /^beta.com/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^acme.com/ })).toBeNull();
  });
  it('ignores a late initial read after newer mappings arrive', async () => {
    let finish!: (data: LearnedMappings) => void;
    vi.mocked(getLearnedMappings).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    mount();
    await waitFor(() => expect(getLearnedMappings).toHaveBeenCalledTimes(1));
    mappings = { 'fresh.com': { a: entry() } };
    await change({ learnedMappings: { newValue: mappings } });
    expect(await screen.findByRole('button', { name: /^fresh.com/ })).toBeTruthy();
    await act(async () => finish({ 'old.com': { a: entry() } }));
    expect(screen.queryByRole('button', { name: /^old.com/ })).toBeNull();
  });
  it('removes its listener on unmount', async () => {
    const result = mount();
    await screen.findByRole('button', { name: /^acme.com/ });
    const handler = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    result.unmount();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(handler);
  });
});
