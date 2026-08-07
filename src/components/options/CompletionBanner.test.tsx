// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { CompletionBanner } from './CompletionBanner';
import type { CompletionGroup } from '@/src/utils/profileCompletion';

afterEach(cleanup);

const MISSING_GROUPS: CompletionGroup[] = [
  { sectionId: 'personal', sectionLabel: 'Personal', fields: ['First Name', 'Last Name'] },
];
const OPTIONAL_GROUPS: CompletionGroup[] = [
  { sectionId: 'links', sectionLabel: 'Links', fields: ['Portfolio'] },
];

function renderBanner(overrides: Partial<React.ComponentProps<typeof CompletionBanner>> = {}) {
  const onNavigate = vi.fn();
  const onFocusField = vi.fn();
  render(
    <CompletionBanner
      percentage={40}
      isCoreComplete={false}
      optionalFieldsRemaining={0}
      optionalGroups={[]}
      missingGroups={MISSING_GROUPS}
      onNavigate={onNavigate}
      onFocusField={onFocusField}
      {...overrides}
    />,
  );
  return { onNavigate, onFocusField };
}

describe('CompletionBanner — core-complete vs percentage label', () => {
  it('shows the percentage and "Complete" label when not core complete', () => {
    renderBanner({ percentage: 40, isCoreComplete: false });
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('Complete')).toBeTruthy();
  });

  it('shows "Ready to Apply" instead of a percentage once core complete', () => {
    renderBanner({ isCoreComplete: true, percentage: 100 });
    expect(screen.getByText('✓ Ready to Apply')).toBeTruthy();
    expect(screen.queryByText('100%')).toBeNull();
  });
});

describe('CompletionBanner — missing-fields dropdown', () => {
  it('hides the Missing trigger once core complete with no optional fields remaining', () => {
    renderBanner({ isCoreComplete: true, optionalFieldsRemaining: 0 });
    expect(screen.queryByText(/Missing/)).toBeNull();
  });

  it('shows the Required Fields dropdown with missing groups, and navigating closes it', () => {
    const { onNavigate } = renderBanner();
    fireEvent.click(screen.getByText(/Missing/));
    expect(screen.getByText('Required Fields')).toBeTruthy();
    expect(screen.getByText('Personal →')).toBeTruthy();

    fireEvent.click(screen.getByText('Personal →'));
    expect(onNavigate).toHaveBeenCalledWith('personal');
    expect(screen.queryByText('Required Fields')).toBeNull();
  });

  it('clicking a field button calls onFocusField and closes the dropdown', () => {
    const { onFocusField } = renderBanner();
    fireEvent.click(screen.getByText(/Missing/));
    fireEvent.click(screen.getByText('First Name'));
    expect(onFocusField).toHaveBeenCalledWith('personal', 'First Name');
    expect(screen.queryByText('Required Fields')).toBeNull();
  });

  it('shows the Optional Fields dropdown once core complete with optional fields remaining', () => {
    renderBanner({ isCoreComplete: true, optionalFieldsRemaining: 1, optionalGroups: OPTIONAL_GROUPS, missingGroups: [] });
    fireEvent.click(screen.getByText(/Missing/));
    expect(screen.getByText('Optional Fields')).toBeTruthy();
    expect(screen.getByText('Links →')).toBeTruthy();
  });
});
