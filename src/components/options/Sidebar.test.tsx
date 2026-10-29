// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { Sidebar } from './Sidebar';

afterEach(cleanup);

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
