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
      sectionFullCompletion={{}}
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
    fireEvent.click(screen.getByText('Import Resume ✨'));
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
    expect(screen.getByTitle('Address')).toBeTruthy();
    expect(screen.getByTitle('Expand sidebar')).toBeTruthy();
  });
});

describe('Sidebar — completion badges', () => {
  it('shows the full green checkmark badge for a fully complete section', () => {
    renderSidebar({ sectionCompletion: { address: true }, sectionFullCompletion: { address: true } });
    const addressButton = screen.getByText('Address').closest('button')!;
    expect(addressButton.querySelector('[title="Fully complete"]')).toBeTruthy();
  });

  it('shows a plain checkmark (not the full badge) for mandatory-only completion', () => {
    renderSidebar({ sectionCompletion: { address: true }, sectionFullCompletion: { address: false } });
    const addressButton = screen.getByText('Address').closest('button')!;
    expect(addressButton.querySelector('[title="Fully complete"]')).toBeNull();
    expect(addressButton.querySelector('[title="Complete"]')).toBeTruthy();
  });

  it('shows no badge at all when the section has no completion yet', () => {
    renderSidebar({ sectionCompletion: { address: false }, sectionFullCompletion: { address: false } });
    const addressButton = screen.getByText('Address').closest('button')!;
    expect(addressButton.querySelector('[title="Fully complete"]')).toBeNull();
    expect(addressButton.querySelector('[title="Complete"]')).toBeNull();
  });
});
