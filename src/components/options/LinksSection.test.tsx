// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LinksSection } from './LinksSection';
import { ToastProvider } from '@/src/components/ui/Toast';
import type { Profile } from '@/src/types/profile';

afterEach(cleanup);

function renderSection(profile: Partial<Profile>, onSave = vi.fn().mockResolvedValue(undefined)) {
  render(
    <ToastProvider>
      <LinksSection profile={profile} onSave={onSave} />
    </ToastProvider>,
  );
  return { onSave };
}

describe('LinksSection — LinkedIn validation', () => {
  it('can save links without a LinkedIn URL', () => {
    const { onSave } = renderSection({ links: { linkedin: '' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ links: expect.objectContaining({ linkedin: '' }) }));
  });

  it('rejects a URL that does not contain linkedin.com', () => {
    const { onSave } = renderSection({ links: { linkedin: 'https://example.com/in/johnsmith' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid LinkedIn URL')).toBeTruthy();
  });

  it('accepts a valid linkedin.com URL', () => {
    const { onSave } = renderSection({ links: { linkedin: 'https://www.linkedin.com/in/johnsmith' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalled();
  });

  it('adds a scheme to a bare LinkedIn domain before saving', () => {
    // A scheme-less linkedin.com/... value passes the "contains linkedin.com"
    // check but fails native type="url" constraint validation on job sites —
    // add https:// at save time so a filled field never silently fails to
    // validate on submit.
    const { onSave } = renderSection({ links: { linkedin: 'linkedin.com/in/johnsmith' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({ linkedin: 'https://linkedin.com/in/johnsmith' }),
    }));
  });
});

describe('LinksSection — isValidUrl (via the optional Portfolio field)', () => {
  it('accepts a bare domain without a protocol, saving it with an added https:// scheme', () => {
    // A scheme-less stored value looks "filled" but fails native type="url"
    // constraint validation on job sites, silently blocking submission even
    // though autofill visibly wrote a value into the field — so the scheme
    // is added at save time, not just accepted for validation.
    const { onSave } = renderSection({ links: { linkedin: 'https://linkedin.com/in/x', portfolio: 'johnsmith.dev' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({ portfolio: 'https://johnsmith.dev' }),
    }));
  });

  it('rejects a hostname with no dot (e.g. "localhost")', () => {
    const { onSave } = renderSection({ links: { linkedin: 'https://linkedin.com/in/x', portfolio: 'localhost' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid URL')).toBeTruthy();
  });

  it('leaves portfolio unset (undefined, not empty string) when left blank', () => {
    const { onSave } = renderSection({ links: { linkedin: 'https://linkedin.com/in/x', portfolio: '' } });
    fireEvent.click(screen.getByText('Save Links'));
    const saved = onSave.mock.calls[0][0];
    expect(saved.links.portfolio).toBeUndefined();
  });
});

describe('LinksSection — incomplete custom links', () => {
  it('requires a URL when a custom label has been entered', () => {
    const { onSave } = renderSection({
      links: { linkedin: 'https://linkedin.com/in/x', custom: [{ label: 'My Blog', url: '' }] },
    });
    fireEvent.click(screen.getByText('Save Links'));

    expect(screen.getByText('URL is required')).toBeTruthy();
    expect(screen.getByDisplayValue('My Blog')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('requires a label when a custom URL has been entered', () => {
    const { onSave } = renderSection({
      links: { linkedin: 'https://linkedin.com/in/x', custom: [{ label: '', url: 'https://blog.dev' }] },
    });
    fireEvent.click(screen.getByText('Save Links'));
    expect(screen.getByText('Label is required')).toBeTruthy();
    expect(screen.getByDisplayValue('https://blog.dev')).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('preserves both rows while an incomplete entry is corrected', () => {
    const { onSave } = renderSection({
      links: {
        linkedin: 'https://linkedin.com/in/x',
        custom: [
          { label: 'My Blog', url: 'https://blog.dev' },
          { label: 'Incomplete', url: '' },
        ],
      },
    });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('URL is required')).toBeTruthy();
    fireEvent.change(screen.getAllByPlaceholderText('https://blog.johnsmith.dev')[1], { target: { value: 'https://second.dev' } });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({ custom: [{ label: 'My Blog', url: 'https://blog.dev' }, { label: 'Incomplete', url: 'https://second.dev' }] }),
    }));
  });

  it('still validates a malformed URL on a custom entry that has a label', () => {
    const { onSave } = renderSection({
      links: { linkedin: 'https://linkedin.com/in/x', custom: [{ label: 'My Blog', url: 'not a url' }] },
    });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a valid URL')).toBeTruthy();
  });

  it('adds a scheme to a bare custom-link domain before saving', () => {
    const { onSave } = renderSection({
      links: { linkedin: 'https://linkedin.com/in/x', custom: [{ label: 'My Blog', url: 'blog.dev' }] },
    });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({ custom: [{ label: 'My Blog', url: 'https://blog.dev' }] }),
    }));
  });
});

describe('LinksSection — custom link CRUD via UI interaction', () => {
  it('typing into an existing entry\'s Label and URL updates that entry, not another one', () => {
    const { onSave } = renderSection({
      links: {
        linkedin: 'https://linkedin.com/in/x',
        custom: [
          { label: 'My Blog', url: 'https://blog.dev' },
          { label: 'GitHub', url: 'https://github.com/johnsmith' },
        ],
      },
    });

    const labelInputs = screen.getAllByPlaceholderText('My Blog');
    const urlInputs = screen.getAllByPlaceholderText('https://blog.johnsmith.dev');
    fireEvent.change(labelInputs[1], { target: { value: 'GitHub Profile' } });
    fireEvent.change(urlInputs[1], { target: { value: 'https://github.com/janedoe' } });

    fireEvent.click(screen.getByText('Save Links'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({
        custom: [
          { label: 'My Blog', url: 'https://blog.dev' },
          { label: 'GitHub Profile', url: 'https://github.com/janedoe' },
        ],
      }),
    }));
  });

  it('+ Add Entry adds a new blank row without disturbing the existing entry', () => {
    const { onSave } = renderSection({
      links: { linkedin: 'https://linkedin.com/in/x', custom: [{ label: 'My Blog', url: 'https://blog.dev' }] },
    });

    fireEvent.click(screen.getByText('+ Add Entry'));

    const labelInputs = screen.getAllByPlaceholderText('My Blog');
    expect(labelInputs).toHaveLength(2);
    const urlInputs = screen.getAllByPlaceholderText('https://blog.johnsmith.dev');
    fireEvent.change(labelInputs[1], { target: { value: 'Portfolio Site' } });
    fireEvent.change(urlInputs[1], { target: { value: 'https://janedoe.dev' } });

    fireEvent.click(screen.getByText('Save Links'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({
        custom: [
          { label: 'My Blog', url: 'https://blog.dev' },
          { label: 'Portfolio Site', url: 'https://janedoe.dev' },
        ],
      }),
    }));
  });

  it('Remove deletes the correct entry by index, keeping the others intact', () => {
    const { onSave } = renderSection({
      links: {
        linkedin: 'https://linkedin.com/in/x',
        custom: [
          { label: 'First', url: 'https://first.dev' },
          { label: 'Second', url: 'https://second.dev' },
          { label: 'Third', url: 'https://third.dev' },
        ],
      },
    });

    fireEvent.click(screen.getAllByLabelText('Remove')[1]); // remove "Second"
    fireEvent.click(screen.getByText('Save Links'));

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({
        custom: [
          { label: 'First', url: 'https://first.dev' },
          { label: 'Third', url: 'https://third.dev' },
        ],
      }),
    }));
  });
});

describe('LinksSection — preserves dedicated social fields', () => {
  it('carries github/twitter/dribbble/behance through unchanged through the dedicated controls', () => {
    const { onSave } = renderSection({
      links: {
        linkedin: 'https://linkedin.com/in/x',
        github: 'https://github.com/johnsmith',
        twitter: 'https://twitter.com/johnsmith',
        dribbble: 'https://dribbble.com/johnsmith',
        behance: 'https://behance.net/johnsmith',
      },
    });
    fireEvent.click(screen.getByText('Save Links'));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      links: expect.objectContaining({
        github: 'https://github.com/johnsmith',
        twitter: 'https://twitter.com/johnsmith',
        dribbble: 'https://dribbble.com/johnsmith',
        behance: 'https://behance.net/johnsmith',
      }),
    }));
  });
});
