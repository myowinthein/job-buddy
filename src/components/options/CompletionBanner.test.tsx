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
  it('labels the percentage as required profile progress', () => {
    renderBanner({ percentage: 40, isCoreComplete: false });
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByText('Required profile')).toBeTruthy();
  });

  it('shows 100% and required completion without claiming application readiness', () => {
    renderBanner({ isCoreComplete: true, percentage: 100 });
    expect(screen.getByText('Required details complete')).toBeTruthy();
    expect(screen.getByText('100%')).toBeTruthy();
  });
});

describe('CompletionBanner — missing-fields dropdown', () => {
  it('hides the Missing trigger once core complete with no optional fields remaining', () => {
    renderBanner({ isCoreComplete: true, optionalFieldsRemaining: 0 });
    expect(screen.queryByRole('button', { name: /remaining|optional details/ })).toBeNull();
  });

  it('shows the Required Fields dropdown with missing groups, and navigating closes it', () => {
    const { onNavigate } = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /required remaining/ }));
    expect(screen.getByText('Required details to complete or correct')).toBeTruthy();
    expect(screen.getByText('Personal →')).toBeTruthy();

    fireEvent.click(screen.getByText('Personal →'));
    expect(onNavigate).toHaveBeenCalledWith('personal');
    expect(screen.queryByText('Required details to complete or correct')).toBeNull();
  });

  it('clicking a field button calls onFocusField and closes the dropdown', () => {
    const { onFocusField } = renderBanner();
    fireEvent.click(screen.getByRole('button', { name: /required remaining/ }));
    fireEvent.click(screen.getByText('First Name'));
    expect(onFocusField).toHaveBeenCalledWith('personal', 'First Name');
    expect(screen.queryByText('Required details to complete or correct')).toBeNull();
  });

  it('shows the Optional Fields dropdown once core complete with optional fields remaining', () => {
    renderBanner({
      isCoreComplete: true,
      optionalFieldsRemaining: 1,
      optionalGroups: OPTIONAL_GROUPS,
      missingGroups: [],
    });
    fireEvent.click(screen.getByRole('button', { name: /optional details/ }));
    expect(screen.getByText('Optional details')).toBeTruthy();
    expect(screen.getByText('Links →')).toBeTruthy();
  });
});

it.each([0, 40, 80, 93, 100])('exposes accessible saved progress at %s percent', (percentage) => {
  renderBanner({ percentage, isCoreComplete: percentage === 100 });
  const bar = screen.getByRole('progressbar', { name: 'Saved required profile details' });
  expect(bar.getAttribute('aria-valuenow')).toBe(String(percentage));
  expect(bar.firstElementChild?.className).toContain(
    percentage === 100 ? 'bg-green-500' : 'bg-blue-500',
  );
});

it('closes on outside click and Escape, returning keyboard focus on Escape', () => {
  renderBanner();
  const trigger = screen.getByRole('button', { name: /required remaining/ });
  fireEvent.click(trigger);
  fireEvent.mouseDown(document.body);
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(trigger);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(trigger.getAttribute('aria-expanded')).toBe('false');
  expect(document.activeElement).toBe(trigger);
});
