// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DebugPanel } from '@/entrypoints/popup/DebugPanel';
import type { DebugSession } from '@/src/autofill/debug';

afterEach(cleanup);

function emptySession(overrides: Partial<DebugSession> = {}): DebugSession {
  return {
    timestamp: Date.now(),
    scanner: [],
    mapping: [],
    ai: [],
    summary: { green: 0, yellow: 0, red: 0, gray: 0 },
    aiSkipped: false,
    ...overrides,
  };
}

describe('DebugPanel — empty states', () => {
  it('shows "No mapping data." when there are no mapping entries', () => {
    render(<DebugPanel session={emptySession()} onClose={vi.fn()} />);
    expect(screen.getByText('No mapping data.')).toBeTruthy();
  });

  it('shows "AI layer skipped…" when aiSkipped is true, even with ai entries present', () => {
    render(<DebugPanel session={emptySession({ aiSkipped: true })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('AI Mapping'));
    expect(screen.getByText('AI layer skipped — no API key configured.')).toBeTruthy();
  });

  it('shows "No fields sent to AI." when aiSkipped is false and ai is empty', () => {
    render(<DebugPanel session={emptySession({ aiSkipped: false, ai: [] })} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('AI Mapping'));
    expect(screen.getByText('No fields sent to AI.')).toBeTruthy();
  });
});

describe('DebugPanel — mapping entries', () => {
  it('renders a mapping entry joined with its scanner label, layer, confidence, and state', () => {
    const session = emptySession({
      scanner: [{ fieldId: 'f1', label: 'First Name', type: 'text', name: 'first_name', id: 'fn' }],
      mapping: [{ fieldId: 'f1', matchLayer: 'dictionary_exact', confidence: 0.85, profilePath: 'personal.firstName', finalState: 'green' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);

    expect(screen.getByText('First Name')).toBeTruthy();
    expect(screen.getByText('Dictionary')).toBeTruthy();
    expect(screen.getByText('conf=0.85')).toBeTruthy();
    expect(screen.getByText('Green')).toBeTruthy();
    expect(screen.getByText('personal.firstName')).toBeTruthy();
  });

  it('falls back to "(no label)" when the field has no scanner match', () => {
    const session = emptySession({
      mapping: [{ fieldId: 'orphan', matchLayer: 'none', confidence: 0, profilePath: null, finalState: 'red' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);
    expect(screen.getByText('(no label)')).toBeTruthy();
  });

  it('omits the profile path line when profilePath is null', () => {
    const session = emptySession({
      mapping: [{ fieldId: 'f1', matchLayer: 'none', confidence: 0, profilePath: null, finalState: 'gray' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);
    expect(screen.queryByText(/personal\./)).toBeNull();
  });
});

describe('DebugPanel — AI entries', () => {
  it('renders an AI entry with its type, confidence, state, and result', () => {
    const session = emptySession({
      ai: [{ fieldId: 'f2', label: 'Cover Letter', type: 'text', aiResult: 'personal.summary', aiConfidence: 'high', finalState: 'yellow' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('AI Mapping'));

    expect(screen.getByText('Cover Letter')).toBeTruthy();
    expect(screen.getByText('[text]')).toBeTruthy();
    expect(screen.getByText('ai conf=high')).toBeTruthy();
    expect(screen.getByText('Yellow')).toBeTruthy();
    expect(screen.getByText('personal.summary')).toBeTruthy();
  });

  it('shows "ai conf=null" when aiConfidence is null', () => {
    const session = emptySession({
      ai: [{ fieldId: 'f2', label: 'x', type: 'text', aiResult: null, aiConfidence: null, finalState: 'unchanged' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);
    fireEvent.click(screen.getByText('AI Mapping'));
    expect(screen.getByText('ai conf=null')).toBeTruthy();
  });
});

describe('DebugPanel — accordion sections', () => {
  it('starts with Manual Mapping expanded and AI Mapping collapsed', () => {
    const session = emptySession({
      mapping: [{ fieldId: 'f1', matchLayer: 'dictionary_exact', confidence: 0.85, profilePath: 'personal.firstName', finalState: 'green' }],
      ai: [{ fieldId: 'f2', label: 'Cover Letter', type: 'text', aiResult: null, aiConfidence: 'low', finalState: 'yellow' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);

    expect(screen.getByText('personal.firstName')).toBeTruthy(); // Manual Mapping content visible
    expect(screen.queryByText('Cover Letter')).toBeNull(); // AI Mapping content hidden until expanded
  });

  it('expands AI Mapping on click, revealing its content', () => {
    const session = emptySession({
      ai: [{ fieldId: 'f2', label: 'Cover Letter', type: 'text', aiResult: null, aiConfidence: 'low', finalState: 'yellow' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);

    fireEvent.click(screen.getByText('AI Mapping'));
    expect(screen.getByText('Cover Letter')).toBeTruthy();
  });

  it('shows the field count as each section\'s subtitle', () => {
    const session = emptySession({
      mapping: [
        { fieldId: 'f1', matchLayer: 'dictionary_exact', confidence: 0.85, profilePath: 'personal.firstName', finalState: 'green' },
        { fieldId: 'f2', matchLayer: 'none', confidence: 0, profilePath: null, finalState: 'red' },
      ],
      ai: [{ fieldId: 'f3', label: 'x', type: 'text', aiResult: null, aiConfidence: null, finalState: 'unchanged' }],
    });
    render(<DebugPanel session={session} onClose={vi.fn()} />);

    expect(screen.getByText('2 fields')).toBeTruthy();
    expect(screen.getByText('1 field')).toBeTruthy();
  });
});

describe('DebugPanel — close interactions', () => {
  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<DebugPanel session={emptySession()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Autofill Debug').closest('.fixed')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('does not call onClose when the panel body is clicked', () => {
    const onClose = vi.fn();
    render(<DebugPanel session={emptySession()} onClose={onClose} />);
    fireEvent.click(screen.getByText('Autofill Debug'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when the × button is clicked', () => {
    const onClose = vi.fn();
    render(<DebugPanel session={emptySession()} onClose={onClose} />);
    fireEvent.click(screen.getByText('×'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose on Escape', () => {
    const onClose = vi.fn();
    render(<DebugPanel session={emptySession()} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
