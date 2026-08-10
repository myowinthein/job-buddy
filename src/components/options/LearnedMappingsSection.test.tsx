// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';

vi.stubGlobal('chrome', {
  storage: { onChanged: { addListener: vi.fn(), removeListener: vi.fn() } },
});

vi.mock('@/src/utils/storage', () => ({
  getProfile: vi.fn(),
  getLearnedMappings: vi.fn(),
  saveLearnedMappings: vi.fn().mockResolvedValue(undefined),
}));

import { LearnedMappingsSection } from './LearnedMappingsSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import { getProfile, getLearnedMappings, saveLearnedMappings } from '@/src/utils/storage';
import type { LearnedMappings } from '@/src/types/storage';
import type { Profile } from '@/src/types/profile';

// jsdom doesn't implement Element.scrollIntoView; SearchableProfileFieldSelect's
// keyboard-highlight effect calls it whenever the highlighted row changes.
Element.prototype.scrollIntoView = vi.fn();

function renderSection() {
  render(
    <ToastProvider>
      <LearnedMappingsSection />
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProfile).mockResolvedValue({ personal: { firstName: 'Jane', lastName: 'Doe' } } as Profile);
});

afterEach(cleanup);

describe('LearnedMappingsSection — trust model (isTrusted)', () => {
  it('labels a count:1 entry as "Learning" and a count:2+ entry as "Trusted"', async () => {
    const mappings: LearnedMappings = {
      'acme.com': {
        sig1: { path: 'personal.firstName', count: 1 },
        sig2: { path: 'personal.firstName', count: 2 },
      },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    expect(screen.getByText('Learning')).toBeTruthy();
    expect(screen.getByText('Trusted')).toBeTruthy();
  });

  it('treats a legacy string-format entry as already trusted', async () => {
    const mappings: LearnedMappings = { 'acme.com': { sig1: 'personal.firstName' } };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    expect(screen.getByText('Trusted')).toBeTruthy();
    expect(screen.queryByText('Learning')).toBeNull();
  });
});

describe('LearnedMappingsSection — stale-mapping detection (resolvesEmpty)', () => {
  it('flags "Empty right now" for a path that no longer resolves in the current profile', async () => {
    const mappings: LearnedMappings = {
      'acme.com': { sig1: { path: 'workHistory.5.company', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    expect(screen.getByText('Empty right now')).toBeTruthy();
  });

  it('does not flag a path that resolves to a real value', async () => {
    const mappings: LearnedMappings = {
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    expect(screen.queryByText('Empty right now')).toBeNull();
  });
});

describe('LearnedMappingsSection — domain and signal cleanup', () => {
  it('deletes an entire domain via the card-level remove button', async () => {
    const mappings: LearnedMappings = {
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    await screen.findByText('acme.com');
    fireEvent.click(screen.getByTitle('Remove entry'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith({}));
  });

  it('removes only the deleted signal, keeping its domain when other signals remain', async () => {
    const mappings: LearnedMappings = {
      'acme.com': {
        sig1: { path: 'personal.firstName', count: 2 },
        sig2: { path: 'personal.lastName', count: 2 },
      },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    fireEvent.click(screen.getAllByTitle('Delete this learned input')[0]); // sig1, sorted before sig2
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith({
      'acme.com': { sig2: { path: 'personal.lastName', count: 2 } },
    }));
  });

  it('removes the whole domain when deleting its last remaining signal', async () => {
    const mappings: LearnedMappings = {
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    fireEvent.click(screen.getByTitle('Delete this learned input'));
    fireEvent.click(screen.getByText('Delete'));

    await waitFor(() => expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith({}));
  });
});

describe('LearnedMappingsSection — manual edit is trusted immediately', () => {
  it('sets count:2 on save rather than resetting to count:1', async () => {
    const mappings: LearnedMappings = {
      'acme.com': { sig1: { path: 'personal.firstName', count: 1 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    fireEvent.click(await screen.findByText('acme.com'));
    fireEvent.click(screen.getByText('Edit'));

    fireEvent.click(screen.getByRole('button', { name: /First Name/ }));
    fireEvent.change(screen.getByPlaceholderText('Search profile fields…'), { target: { value: 'Last Name' } });
    fireEvent.click(screen.getByText('Last Name'));
    fireEvent.click(screen.getByText('Save'));

    await waitFor(() => expect(vi.mocked(saveLearnedMappings)).toHaveBeenCalledWith({
      'acme.com': { sig1: { path: 'personal.lastName', count: 2 } },
    }));
  });
});

describe('LearnedMappingsSection — syncing with background storage writes', () => {
  it('updates the displayed mappings when chrome.storage.onChanged fires for learnedMappings in the local area', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    });
    renderSection();
    await screen.findByText('acme.com');

    const handler = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    handler(
      { learnedMappings: { newValue: { 'beta.com': { sig2: { path: 'personal.lastName', count: 2 } } } } } as Record<string, chrome.storage.StorageChange>,
      'local',
    );

    expect(await screen.findByText('beta.com')).toBeTruthy();
    expect(screen.queryByText('acme.com')).toBeNull();
  });

  it('ignores a change from a non-local storage area', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    });
    renderSection();
    await screen.findByText('acme.com');

    const handler = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    handler(
      { learnedMappings: { newValue: { 'beta.com': {} } } } as Record<string, chrome.storage.StorageChange>,
      'session',
    );

    expect(screen.getByText('acme.com')).toBeTruthy();
    expect(screen.queryByText('beta.com')).toBeNull();
  });

  it('removes its listener on unmount', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({});
    renderSection();
    await screen.findByText('Nothing learned yet. Entries will appear here as you fill out job applications.');

    const handler = vi.mocked(chrome.storage.onChanged.addListener).mock.calls[0][0];
    cleanup();
    expect(vi.mocked(chrome.storage.onChanged.removeListener)).toHaveBeenCalledWith(handler);
  });
});

describe('LearnedMappingsSection — sorted by most learned inputs first', () => {
  it('lists the domain with the most learned inputs before ones with fewer', async () => {
    const mappings: LearnedMappings = {
      'few.com':  { sig1: { path: 'personal.firstName', count: 2 } },
      'many.com': {
        sig1: { path: 'personal.firstName', count: 2 },
        sig2: { path: 'personal.lastName',  count: 2 },
        sig3: { path: 'address.city',       count: 2 },
      },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    await screen.findByText('few.com');
    const summaries = screen.getAllByText(/\.com$/).map((el) => el.textContent);
    expect(summaries.indexOf('many.com')).toBeLessThan(summaries.indexOf('few.com'));
  });

  it('breaks a tied input count alphabetically', async () => {
    const mappings: LearnedMappings = {
      'zeta.com':  { sig1: { path: 'personal.firstName', count: 2 } },
      'alpha.com': { sig1: { path: 'personal.firstName', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    await screen.findByText('alpha.com');
    const summaries = screen.getAllByText(/\.com$/).map((el) => el.textContent);
    expect(summaries.indexOf('alpha.com')).toBeLessThan(summaries.indexOf('zeta.com'));
  });
});

describe('LearnedMappingsSection — search filter', () => {
  it('filters domains by a case-insensitive substring match', async () => {
    const mappings: LearnedMappings = {
      'indeed.com':  { sig1: { path: 'personal.firstName', count: 2 } },
      'linkedin.com': { sig1: { path: 'personal.firstName', count: 2 } },
    };
    vi.mocked(getLearnedMappings).mockResolvedValue(mappings);
    renderSection();

    await screen.findByText('indeed.com');
    fireEvent.change(screen.getByLabelText('Search sites'), { target: { value: 'LINKED' } });

    expect(screen.getByText('linkedin.com')).toBeTruthy();
    expect(screen.queryByText('indeed.com')).toBeNull();
  });

  it('shows a no-matches message distinct from the empty-state message', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({
      'indeed.com': { sig1: { path: 'personal.firstName', count: 2 } },
    });
    renderSection();

    await screen.findByText('indeed.com');
    fireEvent.change(screen.getByLabelText('Search sites'), { target: { value: 'zzz' } });

    expect(await screen.findByText('No sites match "zzz".')).toBeTruthy();
    expect(screen.queryByText('Nothing learned yet. Entries will appear here as you fill out job applications.')).toBeNull();
  });

  it('does not render the search input when there is nothing learned yet', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({});
    renderSection();
    await screen.findByText('Nothing learned yet. Entries will appear here as you fill out job applications.');
    expect(screen.queryByLabelText('Search sites')).toBeNull();
  });
});

describe('LearnedMappingsSection — load and save failures', () => {
  it('shows a toast when the initial load rejects, without leaving the page stuck loading', async () => {
    vi.mocked(getLearnedMappings).mockRejectedValue(new Error('storage unavailable'));
    renderSection();
    expect(await screen.findByText('Failed to load learned inputs.')).toBeTruthy();
  });

  it('shows a toast when persisting a deletion fails', async () => {
    vi.mocked(getLearnedMappings).mockResolvedValue({
      'acme.com': { sig1: { path: 'personal.firstName', count: 2 } },
    });
    vi.mocked(saveLearnedMappings).mockRejectedValueOnce(new Error('quota exceeded'));
    renderSection();

    await screen.findByText('acme.com');
    fireEvent.click(screen.getByTitle('Remove entry'));
    fireEvent.click(screen.getByText('Delete'));

    expect(await screen.findByText('Failed to save. Please try again.')).toBeTruthy();
  });
});
