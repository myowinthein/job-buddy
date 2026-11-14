// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import ImportReviewScreen from './ImportReviewScreen';
import type { Profile } from '@/src/types/profile';
import type { FieldChange } from '@/src/resume-ai/types';

afterEach(cleanup);

function newField(id: string, label: string, accepted = false): FieldChange {
  return {
    id, label, section: 'Personal',
    currentValue: null, suggestedValue: 'x',
    displayCurrent: '', displaySuggested: `suggested-${id}`,
    status: 'new', accepted,
  };
}

function conflictField(id: string, accepted = false): FieldChange {
  return {
    id, label: `Field ${id}`, section: 'Personal',
    currentValue: 'old', suggestedValue: 'new',
    displayCurrent: `current-${id}`, displaySuggested: `suggested-${id}`,
    status: 'conflict', accepted,
  };
}

function unchangedField(id: string): FieldChange {
  return {
    id, label: `Field ${id}`, section: 'Personal',
    currentValue: 'same', suggestedValue: 'same',
    displayCurrent: 'same', displaySuggested: 'same',
    status: 'unchanged', accepted: false,
  };
}

function renderScreen(changes: FieldChange[], overrides: Partial<{ isSaving: boolean }> = {}) {
  const onSave = vi.fn().mockResolvedValue(undefined);
  const onBack = vi.fn();
  render(
    <ImportReviewScreen
      changes={changes}
      onSave={onSave}
      onBack={onBack}
      isSaving={overrides.isSaving}
    />,
  );
  return { onSave, onBack };
}

describe('ImportReviewScreen — multiline value rendering', () => {
  it('preserves multiline prose without adding bullet points', () => {
    const field = newField('summary', 'Career Summary');
    field.displaySuggested = 'Led the platform team.\nShipped three major releases.\nMentored junior engineers.';
    renderScreen([field]);

    expect(screen.getByText(/Led the platform team/).tagName).toBe('P');
    expect(screen.getByText(/Led the platform team/).textContent).toBe(field.displaySuggested);
  });

  it('renders a single-line value as a plain paragraph, not a one-item list', () => {
    const field = newField('summary', 'Career Summary');
    field.displaySuggested = 'A one-line summary.';
    renderScreen([field]);
    expect(screen.getByText('A one-line summary.').tagName).toBe('P');
  });
});

describe('ImportReviewScreen — accept-all new fields', () => {
  it('selects new and changed details together', () => {
    const { onSave } = renderScreen([
      newField('a', 'First Name', false),
      newField('b', 'Last Name', false),
      conflictField('c', false),
    ]);

    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved.find((c) => c.id === 'a')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'b')?.accepted).toBe(true);
    expect(saved.find((c) => c.id === 'c')?.accepted).toBe(true);
  });

  it('offers bulk selection when only changed details exist', () => {
    renderScreen([conflictField('c')]);
    expect(screen.getByText('Select All')).toBeTruthy();
    expect(screen.getByText('Clear Selection')).toBeTruthy();
  });
});

describe('ImportReviewScreen — individual toggle for new fields', () => {
  it('toggles a single new field\'s accepted state via its checkbox', () => {
    const { onSave } = renderScreen([newField('a', 'First Name', false)]);
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));

    const saved = onSave.mock.calls[0][0] as FieldChange[];
    expect(saved[0].accepted).toBe(true);
  });
});

describe('ImportReviewScreen — conflict resolution radios', () => {
  it('defaults conflict radios to match each field\'s current accepted state', () => {
    renderScreen([conflictField('c', false)]);
    const [useSuggested, keepCurrent] = screen.getAllByRole('radio') as HTMLInputElement[];
    expect(keepCurrent.checked).toBe(true);
    expect(useSuggested.checked).toBe(false);
  });

  it('choosing "Use suggested" sets accepted true; "Keep current" sets it false', () => {
    const { onSave } = renderScreen([conflictField('c', false)]);
    const [useSuggested, keepCurrent] = screen.getAllByRole('radio');

    fireEvent.click(useSuggested);
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));
    expect((onSave.mock.calls[0][0] as FieldChange[])[0].accepted).toBe(true);

    onSave.mockClear();
    fireEvent.click(keepCurrent);
    fireEvent.click(screen.getByRole('button', {name:/^Import Selected/}));
    expect(onSave).not.toHaveBeenCalled();
    expect((screen.getByRole('button', {name:/^Import Selected/}) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('ImportReviewScreen — section grouping and empty state', () => {
  it('omits unchanged fields from display and hides sections with only unchanged fields', () => {
    renderScreen([unchangedField('a'), newField('b', 'Last Name')]);
    expect(screen.queryByText('Field a')).toBeNull();
    expect(screen.getByText('Last Name')).toBeTruthy();
  });

  it('shows "No changes to review." when every field is unchanged', () => {
    renderScreen([unchangedField('a'), unchangedField('b')]);
    expect(screen.getByText('No changes to review.')).toBeTruthy();
  });

  it('shows New/Conflicts counts in the header badge', () => {
    renderScreen([newField('a', 'A'), newField('b', 'B'), conflictField('c')]);
    expect(screen.getByText('0 of 3 selected')).toBeTruthy();
    expect(screen.getAllByText('New')).toHaveLength(2);
    expect(screen.getByText('Changed')).toBeTruthy();
  });
});

describe('ImportReviewScreen — backdrop and saving state', () => {
  it('calls onBack when the backdrop is clicked, but not when the dialog body is clicked', () => {
    const { onBack } = renderScreen([newField('a', 'A')]);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onBack).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('dialog').parentElement!);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('disables Back/Save and shows "Saving…" while isSaving is true', () => {
    renderScreen([newField('a', 'A')], { isSaving: true });
    expect((screen.getByText('Back') as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Saving…')).toBeTruthy();
    expect((screen.getByText('Saving…').closest('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onBack on Escape', () => {
    const { onBack } = renderScreen([newField('a', 'A')]);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('ignores Escape while isSaving is true, same as the backdrop click', () => {
    const { onBack } = renderScreen([newField('a', 'A')], { isSaving: true });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onBack).not.toHaveBeenCalled();
  });
});


describe('ImportReviewScreen — save isolation', () => {
  it('blocks header close and freezes choices while saving, then allows dismissal afterward', () => {
    const onBack = vi.fn();
    const onSave = vi.fn();
    const changes = [newField('a', 'A'), conflictField('b')];
    const view = render(<ImportReviewScreen changes={changes} onSave={onSave} onBack={onBack} isSaving />);
    fireEvent.click(screen.getByText('×'));
    expect(onBack).not.toHaveBeenCalled();
    expect((screen.getByRole('checkbox') as HTMLInputElement).disabled).toBe(true);
    for (const radio of screen.getAllByRole('radio')) expect((radio as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByText('Select All') as HTMLButtonElement).disabled).toBe(true);
    view.rerender(<ImportReviewScreen changes={changes} onSave={onSave} onBack={onBack} isSaving={false} />);
    fireEvent.click(screen.getByText('×'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

it('shows legacy professional fields and any future section instead of hiding selected changes', () => {
  const legacy = {...newField('summary','Career Summary'),section:'Professional'};
  const future = {...newField('future','Future detail'),section:'Future Section'};
  renderScreen([legacy,future]);
  expect(screen.getByRole('heading',{name:/^Work History/})).toBeTruthy();
  expect(screen.getByText('Career Summary')).toBeTruthy();
  expect(screen.getByRole('heading',{name:/^Future Section/})).toBeTruthy();
  expect(screen.queryByText('Future detail')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Future Section' }));
  expect(screen.getByText('Future detail')).toBeTruthy();
  expect(screen.queryByText('Career Summary')).toBeNull();
});

 it('shows one section at a time and preserves choices across sections and bulk actions', () => {
  const { onSave } = renderScreen([
    conflictField('name'),
    {...conflictField('summary'), section: 'Work History'},
  ]);
  expect(screen.getByRole('button', {name: 'Personal'}).getAttribute('aria-expanded')).toBe('true');
  expect(screen.queryByRole('group', {name: 'Field summary'})).toBeNull();
  fireEvent.click(screen.getByText('Select All'));
  fireEvent.click(screen.getByRole('button', {name: 'Work History'}));
  expect(screen.queryByRole('group', {name: 'Field name'})).toBeNull();
  fireEvent.click(screen.getByRole('radio', {name: /^Keep Current/}));
  fireEvent.click(screen.getByRole('button', {name: 'Personal'}));
  expect((screen.getByRole('radio', {name: /^Imported/}) as HTMLInputElement).checked).toBe(true);
  expect(screen.getByText('1 of 2 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', {name: /^Import Selected/}));
  expect(onSave.mock.calls[0][0].map((change: FieldChange) => change.accepted)).toEqual([true,false]);
});

it('shows complete incoming and current values in reading order', () => {
  renderScreen([conflictField('summary', true)]);
  const group = screen.getByRole('group', {name: 'Field summary'});
  const choices = within(group).getAllByRole('radio');
  expect(choices[0].closest('label')!.textContent).toBe('Importedsuggested-summary');
  expect(choices[1].closest('label')!.textContent).toBe('Keep Currentcurrent-summary');
});

it('counts and imports education entries separately without comparing new entries to empty data', async () => {
  const { generateDiff, applyChanges } = await import('@/src/resume-ai/parser');
  const schools = ['School A', 'School B', 'School C'].map((institution) => ({
    institution,
    degree: 'BA',
    fieldOfStudy: 'Design',
    startDate: '2020',
    endDate: '2024',
  }));
  const changes = generateDiff({}, { education: schools });
  const { onSave } = renderScreen(changes);
  expect(screen.getByText('3 of 3 selected')).toBeTruthy();
  expect(screen.queryByText('Imported')).toBeNull();
  expect(screen.queryByText('Keep Current')).toBeNull();
  expect(screen.queryByLabelText('Show unchanged details')).toBeNull();
  expect(document.querySelector('mark')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Import School B' }));
  expect(screen.getByText('2 of 3 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
  fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
  expect(applyChanges({}, onSave.mock.calls[0][0]).education).toEqual([schools[0], schools[2]]);
  fireEvent.click(screen.getByText('Clear Selection'));
  expect(
    (screen.getByRole('button', { name: /^Import Selected/ }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByText('Select All'));
  expect(screen.getByText('3 of 3 selected')).toBeTruthy();
});

it.each(['Review Resume', 'Review Profile', 'Review Drive Backup'])(
  '%s labels new and changed languages and custom links individually',
  async title => {
    const { generateDiff } = await import('@/src/resume-ai/parser');
    const cases = [
      {
        current: { languages: [{ language: 'en', proficiency: 'full_professional' as const }] },
        incoming: { languages: [
          { language: 'en', proficiency: 'native_bilingual' as const },
          { language: 'my', proficiency: 'native_bilingual' as const },
        ] },
      },
      {
        current: { links: { linkedin: '', custom: [{ label: 'Project', url: 'https://example.test/old' }] } },
        incoming: { links: { linkedin: '', custom: [
          { label: 'Project', url: 'https://example.test/new' },
          { label: 'Writing', url: 'https://example.test/writing' },
        ] } },
      },
    ];
    for (const { current, incoming } of cases) {
      const view = render(<ImportReviewScreen title={title} changes={generateDiff(current, incoming)} onSave={vi.fn()} onBack={vi.fn()} />);
      expect(screen.getByText('New').className).toContain('text-green-700');
      expect(screen.getByText('Changed').className).toContain('text-amber-700');
      expect(screen.getByText('2 of 2 selected')).toBeTruthy();
      view.unmount();
    }
  },
);

it('presents each language with its proficiency and its own selection', async () => {
  const { generateDiff, applyChanges } = await import('@/src/resume-ai/parser');
  const languages = [
    { language: 'en', proficiency: 'full_professional' as const },
    { language: 'my', proficiency: 'native_bilingual' as const },
  ];
  const { onSave } = renderScreen(generateDiff({}, { languages }));
  expect(screen.getByText('English')).toBeTruthy();
  expect(screen.getByText('Fluent')).toBeTruthy();
  expect(screen.getByText('Burmese')).toBeTruthy();
  expect(screen.getByText('Native')).toBeTruthy();
  expect(screen.getAllByText('Languages')).toHaveLength(1);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Import Burmese' }));
  fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
  expect(applyChanges({}, onSave.mock.calls[0][0]).languages).toEqual([languages[0]]);
});

it('shows both proficiency values for changed languages in Replace mode', async () => {
  const { replacementChanges } = await import('@/src/utils/importPolicy');
  const current = { languages: [{ language: 'en', proficiency: 'full_professional' as const }] };
  const incoming = { languages: [{ language: 'en', proficiency: 'native_bilingual' as const }] };
  render(
    <ImportReviewScreen
      changes={replacementChanges(current, incoming)}
      replacement
      onSave={vi.fn()}
      onBack={vi.fn()}
    />,
  );
  expect(screen.getByText('Imported: Native')).toBeTruthy();
  expect(screen.getByText('Current: Fluent')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Import English' })).toBeTruthy();
  expect(screen.queryByRole('radio')).toBeNull();
});

it('shows custom links separately and saves only checked links', async () => {
  const { generateDiff, applyChanges } = await import('@/src/resume-ai/parser');
  const links = {
    linkedin: '',
    custom: [
      { label: 'StudyMe', url: 'https://example.com/study' },
      { label: 'Android', url: 'https://example.com/android' },
    ],
  };
  const { onSave } = renderScreen(generateDiff({}, { links }));
  expect(screen.getByText('2 of 2 selected')).toBeTruthy();
  expect(screen.getByRole('checkbox', { name: 'Import StudyMe' })).toBeTruthy();
  expect(screen.getByText('https://example.com/study')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Import Android' }));
  expect(screen.getByText('1 of 2 selected')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
  expect(applyChanges({}, onSave.mock.calls[0][0]).links?.custom).toEqual([links.custom[0]]);
});

it.each(['Review Resume', 'Review Profile', 'Review Drive Backup'])(
  '%s selects each new work authorization separately',
  async title => {
    const { generateDiff, applyChanges } = await import('@/src/resume-ai/parser');
    const rows = ['US', 'GB'].map(country => ({ country, status: 'citizen_or_pr' as const }));
    const onSave = vi.fn();
    render(<ImportReviewScreen title={title} changes={generateDiff({}, { workAuthorization: rows })} onSave={onSave} onBack={vi.fn()} />);
    expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    expect(screen.getByText('2 of 2 selected')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Import United States' })).toBeTruthy();
    expect(screen.getByText('Citizen / Permanent Resident')).toBeTruthy();
    expect(screen.queryByText('Current')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next entry' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Import United Kingdom' }));
    expect(screen.getByText('1 of 2 selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
    expect(applyChanges({}, onSave.mock.calls[0][0]).workAuthorization).toEqual([rows[0]]);
  },
);

it.each(['update', 'replace'] as const)(
  'shows saved and incoming work authorization details in %s mode',
  async mode => {
    const { generateDiff } = await import('@/src/resume-ai/parser');
    const { replacementChanges } = await import('@/src/utils/importPolicy');
    const current = { workAuthorization: [{ country: 'US', status: 'work_visa' as const, visaType: 'H-1B', expiryDate: '2028-01-31' }] };
    const incoming = { workAuthorization: [{ country: 'US', status: 'requires_sponsorship' as const, visaType: 'O-1', expiryDate: '2029-02-28' }] };
    render(<ImportReviewScreen changes={(mode === 'replace' ? replacementChanges : generateDiff)(current, incoming)} replacement={mode === 'replace'} onSave={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByText('Authorized to work without sponsorship')).toBeTruthy();
    expect(screen.getByText('Requires Sponsorship')).toBeTruthy();
    for (const value of ['H-1B', 'O-1', '2028-01-31', '2029-02-28']) expect(screen.getByText(value)).toBeTruthy();
    fireEvent.click(mode === 'update'
      ? screen.getByRole('radio', { name: 'Keep Current for United States' })
      : screen.getByRole('checkbox', { name: 'Import United States' }));
    expect(screen.getByText('0 of 1 selected')).toBeTruthy();
  },
);

it.each(['update', 'replace'] as const)(
  'shows old and incoming custom link labels and URLs in %s mode',
  async (mode) => {
    const { generateDiff } = await import('@/src/resume-ai/parser');
    const { replacementChanges } = await import('@/src/utils/importPolicy');
    const current = {
      links: { linkedin: '', custom: [{ label: 'Old name', url: 'https://example.com/old' }] },
    };
    const incoming = {
      links: { linkedin: '', custom: [{ label: 'Old name', url: 'https://example.com/new' }] },
    };
    const changes = (mode === 'replace' ? replacementChanges : generateDiff)(current, incoming);
    const onSave = vi.fn();
    render(
      <ImportReviewScreen
        changes={changes}
        replacement={mode === 'replace'}
        onSave={onSave}
        onBack={vi.fn()}
      />,
    );
    expect(screen.getByText('https://example.com/old')).toBeTruthy();
    expect(screen.getByText('https://example.com/new')).toBeTruthy();
    if (mode === 'update')
      fireEvent.click(screen.getByRole('radio', { name: 'Keep Current for Old name' }));
    else fireEvent.click(screen.getByRole('checkbox', { name: 'Import Old name' }));
    expect(
      (screen.getByRole('button', { name: /^Import Selected/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
  },
);

it.each(['workHistory', 'education', 'workAuthorization', 'languages', 'links.custom'] as const)(
  '%s reviews only actionable entries and preserves hidden saved rows',
  async (section) => {
    const { generateDiff, applyChanges } = await import('@/src/resume-ai/parser');
    const records = {
      workHistory: [
        { company: 'Unchanged company', title: 'Engineer', startDate: '2020-01', isCurrent: true },
        { company: 'Changed company', title: 'Engineer', startDate: '2021-01', isCurrent: true },
      ],
      education: [
        {
          institution: 'Unchanged school',
          degree: 'BA',
          fieldOfStudy: 'Design',
          startDate: '2010',
          endDate: '2014',
        },
        {
          institution: 'Changed school',
          degree: 'BA',
          fieldOfStudy: 'Design',
          startDate: '2015',
          endDate: '2019',
        },
      ],
      workAuthorization: [
        { country: 'US', status: 'citizen_or_pr' },
        { country: 'GB', status: 'work_visa' },
      ],
      languages: [
        { language: 'en', proficiency: 'native_bilingual' },
        { language: 'es', proficiency: 'professional_working' },
      ],
      'links.custom': [
        { label: 'Unchanged link', url: 'https://example.test/one' },
        { label: 'Changed link', url: 'https://example.test/two' },
      ],
    }[section];
    const replacement = {
      workHistory: { title: 'Lead Engineer' },
      education: { degree: 'MA' },
      workAuthorization: { status: 'requires_sponsorship' },
      languages: { proficiency: 'full_professional' },
      'links.custom': { url: 'https://example.test/updated' },
    }[section];
    const current =
      section === 'links.custom' ? { links: { custom: records } } : { [section]: records };
    const incomingRows = [records[0], { ...records[1], ...replacement }];
    const incoming =
      section === 'links.custom'
        ? { links: { custom: incomingRows } }
        : { [section]: incomingRows };
    const changes = generateDiff(current as Partial<Profile>, incoming as Partial<Profile>);
    const { onSave } = renderScreen(changes);
    const hiddenLabel = {
      workHistory: 'Unchanged company',
      education: 'Unchanged school',
      workAuthorization: 'United States',
      languages: 'English',
      'links.custom': 'Unchanged link',
    }[section];
    expect(screen.queryByText(new RegExp(hiddenLabel))).toBeNull();
    if (['workHistory', 'education', 'workAuthorization'].includes(section)) {
      expect(screen.getByText('(1 of 1)')).toBeTruthy();
      expect(
        (screen.getByRole('button', { name: 'Next entry' }) as HTMLButtonElement).disabled,
      ).toBe(true);
    }
    fireEvent.click(screen.getByRole('radio', { name: /Keep Current/ }));
    expect(screen.getByText('0 of 1 selected')).toBeTruthy();
    fireEvent.click(screen.getByText('Select All'));
    fireEvent.click(screen.getByRole('button', { name: /^Import Selected/ }));
    const saved = applyChanges(current as Partial<Profile>, onSave.mock.calls[0][0]);
    const rows = section === 'links.custom' ? saved.links?.custom : saved[section];
    expect(rows).toEqual(incomingRows);
  },
);

it.each(['workHistory', 'education', 'workAuthorization', 'languages', 'links.custom'] as const)(
  'keeps identical incoming %s entries selectable when replacing a profile',
  async (section) => {
    const { DEV_PROFILE } = await import('@/src/utils/devProfile');
    const { replacementChanges } = await import('@/src/utils/importPolicy');
    const change = replacementChanges(DEV_PROFILE, DEV_PROFILE).find(
      (change) => change.id === section,
    )!;
    render(<ImportReviewScreen changes={[change]} replacement onSave={vi.fn()} onBack={vi.fn()} />);
    const entries = screen.getAllByRole('checkbox', { name: /^Import / });
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) expect((entry as HTMLInputElement).checked).toBe(true);
  },
);
