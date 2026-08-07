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
