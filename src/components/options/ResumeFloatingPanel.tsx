import { useState, useRef, useEffect, useCallback } from 'react';
import type { ExtractedResume, TextChunk } from '@/src/types/storage';

export interface DraggedItem {
  type: 'detectedField' | 'textChunk';
  fieldPath?: string;
  value: string;
  chunkId?: string;
  label?: string;
}

export interface PanelCallbacks {
  markChipUsed: (fieldPath: string) => void;
  markChunkUsed: (chunkId: string) => void;
}

interface Props {
  resume: ExtractedResume;
  onDismiss: () => void;
  draggedItemRef: React.MutableRefObject<DraggedItem | null>;
  callbacksRef: React.MutableRefObject<PanelCallbacks | null>;
}

function formatSectionLabel(raw: string): string {
  return raw
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

function getFieldIcon(fieldPath: string): string {
  if (fieldPath.includes('email')) return '📧';
  if (fieldPath.includes('phone')) return '📞';
  if (fieldPath.includes('linkedin')) return '💼';
  if (fieldPath.includes('portfolio')) return '🌐';
  if (fieldPath.includes('github')) return '⌨';
  if (fieldPath.includes('firstName') || fieldPath.includes('lastName')) return '👤';
  return '📋';
}

export function ResumeFloatingPanel({ resume, onDismiss, draggedItemRef, callbacksRef }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - 280 - 24,
    y: Math.max(24, window.innerHeight - 600 - 24),
  }));
  const [usedFieldPaths, setUsedFieldPaths] = useState<Set<string>>(new Set());
  const [usedChunkIds, setUsedChunkIds] = useState<Set<string>>(new Set());
  const [expandedChunks, setExpandedChunks] = useState<Set<string>>(new Set());
  const [confirmClose, setConfirmClose] = useState(false);
  const [showRawModal, setShowRawModal] = useState(false);
  const [pendingSelection, setPendingSelection] = useState('');
  const [localChunks, setLocalChunks] = useState<TextChunk[]>(resume.textChunks);

  const panelRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const markChipUsed = useCallback((fieldPath: string) => {
    setUsedFieldPaths((prev) => new Set([...prev, fieldPath]));
  }, []);

  const markChunkUsed = useCallback((chunkId: string) => {
    setUsedChunkIds((prev) => new Set([...prev, chunkId]));
  }, []);

  useEffect(() => {
    callbacksRef.current = { markChipUsed, markChunkUsed };
  }, [markChipUsed, markChunkUsed, callbacksRef]);

  // Panel drag logic — uses refs so the mousemove listener never re-registers
  const handleHeaderMouseDown = (e: React.MouseEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current) return;
      const panelHeight = panelRef.current?.offsetHeight ?? 400;
      const x = Math.max(0, Math.min(window.innerWidth - 280, e.clientX - dragOffset.current.x));
      const y = Math.max(0, Math.min(window.innerHeight - panelHeight, e.clientY - dragOffset.current.y));
      setPos({ x, y });
    };
    const onMouseUp = () => { dragging.current = false; };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalItems = resume.detectedFields.length + localChunks.length;
  const usedCount = usedFieldPaths.size + usedChunkIds.size;
  const unusedCount = Math.max(0, totalItems - usedCount);
  const allUsed = totalItems > 0 && usedCount >= totalItems;

  const handleDismissClick = () => {
    if (unusedCount > 0) {
      setConfirmClose(true);
    } else {
      onDismiss();
    }
  };

  const handleRawMouseUp = () => {
    const sel = window.getSelection()?.toString().trim() ?? '';
    setPendingSelection(sel);
  };

  const handleAddChunk = () => {
    if (!pendingSelection) return;
    const newChunk: TextChunk = {
      id: `manual-${Date.now()}`,
      text: pendingSelection,
      used: false,
    };
    setLocalChunks((prev) => [...prev, newChunk]);
    setPendingSelection('');
    setShowRawModal(false);
  };

  // Group chunks by sectionLabel for display
  const groupedChunks = localChunks.reduce<Array<{ label: string; chunks: TextChunk[] }>>(
    (acc, chunk) => {
      const label = chunk.sectionLabel ?? 'Other';
      const last  = acc[acc.length - 1];
      if (last && last.label === label) {
        last.chunks.push(chunk);
      } else {
        acc.push({ label, chunks: [chunk] });
      }
      return acc;
    },
    [],
  );

  // Collapsed floating icon
  if (collapsed) {
    return (
      <div style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 1000 }}>
        <button
          title="Resume data ready to drag"
          onClick={() => setCollapsed(false)}
          className="relative w-12 h-12 rounded-full bg-white dark:bg-gray-800 shadow-lg dark:shadow-black/40 border border-gray-200 dark:border-gray-700 flex items-center justify-center hover:shadow-xl transition-shadow"
        >
          <span className="text-xl">📄</span>
          {unusedCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center leading-none">
              {unusedCount > 9 ? '9+' : unusedCount}
            </span>
          )}
        </button>
      </div>
    );
  }

  return (
    <>
      {/* Floating panel */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: 280,
          maxHeight: '70vh',
          zIndex: 1000,
        }}
        className="bg-white dark:bg-gray-800 rounded-xl shadow-xl dark:shadow-black/60 border border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden"
      >
        {/* Header / drag handle */}
        <div
          onMouseDown={handleHeaderMouseDown}
          style={{ cursor: 'grab' }}
          className="flex items-center justify-between px-3 py-2.5 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 select-none shrink-0"
        >
          <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Resume Data</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              title="Minimize"
              onClick={(e) => { e.stopPropagation(); setCollapsed(true); setConfirmClose(false); }}
              className="w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-sm font-bold leading-none"
            >
              —
            </button>
            <button
              type="button"
              title="Done / Close"
              onClick={(e) => { e.stopPropagation(); handleDismissClick(); }}
              className="w-6 h-6 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors text-lg leading-none"
            >
              ×
            </button>
          </div>
        </div>

        {/* Confirm-close bar */}
        {confirmClose && (
          <div className="px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 shrink-0">
            <p className="text-xs text-amber-800 dark:text-amber-200 mb-2">
              You still have {unusedCount} unused item{unusedCount !== 1 ? 's' : ''}. Close anyway?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onDismiss()}
                className="px-2.5 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => setConfirmClose(false)}
                className="px-2.5 py-1 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                Keep open
              </button>
            </div>
          </div>
        )}

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {allUsed ? (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <div className="text-5xl mb-3 text-green-500">✓</div>
              <p className="text-sm font-semibold text-green-700 mb-4">All resume data mapped!</p>
              <button
                type="button"
                onClick={onDismiss}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 transition-colors"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Detected fields */}
              {resume.detectedFields.length > 0 && (
                <div className="px-3 pt-3">
                  <p className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-2">
                    Detected Fields
                  </p>
                  {resume.detectedFields.map((field) => {
                    const used = usedFieldPaths.has(field.fieldPath);
                    return (
                      <div
                        key={field.fieldPath}
                        draggable={!used}
                        onDragStart={
                          used
                            ? undefined
                            : () => {
                                draggedItemRef.current = {
                                  type: 'detectedField',
                                  fieldPath: field.fieldPath,
                                  value: field.value,
                                  label: field.label,
                                };
                              }
                        }
                        onDragEnd={() => { draggedItemRef.current = null; }}
                        className={[
                          'border rounded-lg px-2.5 py-2 mb-2 transition-colors',
                          used
                            ? 'opacity-40 cursor-default border-gray-200 dark:border-gray-700'
                            : 'cursor-grab border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                        ].join(' ')}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-300 flex items-center gap-1">
                            <span>{getFieldIcon(field.fieldPath)}</span>
                            {field.label}
                          </span>
                          {used ? (
                            <span className="text-xs text-green-600 font-medium">✓ Used</span>
                          ) : (
                            <span
                              className={[
                                'w-2 h-2 rounded-full',
                                field.confidence === 'high' ? 'bg-green-400' : 'bg-yellow-400',
                              ].join(' ')}
                            />
                          )}
                        </div>
                        <p className="text-xs text-gray-700 dark:text-gray-300 mt-0.5 truncate">{field.value}</p>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Text chunks — grouped by section */}
              {groupedChunks.length > 0 && (
                <div className="px-3 pt-2">
                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">Drag a chunk onto any profile field</p>
                  {groupedChunks.map(({ label, chunks }, groupIdx) => (
                    <div key={label}>
                      {groupIdx > 0 && <div className="border-t border-gray-100 dark:border-gray-700 my-2" />}
                      <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wide mb-1.5">
                        {formatSectionLabel(label)}
                      </p>
                      {chunks.map((chunk) => {
                        const used      = usedChunkIds.has(chunk.id);
                        const isLong    = chunk.text.length > 150 || chunk.text.split('\n').length > 3;
                        const isExpanded = expandedChunks.has(chunk.id);
                        const displayText =
                          isLong && !isExpanded ? chunk.text.slice(0, 150) + '…' : chunk.text;

                        return (
                          <div
                            key={chunk.id}
                            draggable={!used}
                            onDragStart={
                              used
                                ? undefined
                                : () => {
                                    draggedItemRef.current = {
                                      type:    'textChunk',
                                      chunkId: chunk.id,
                                      value:   chunk.text,
                                    };
                                  }
                            }
                            onDragEnd={() => { draggedItemRef.current = null; }}
                            className={[
                              'border rounded-lg px-2.5 py-2 mb-2 transition-colors',
                              used
                                ? 'opacity-40 cursor-default border-gray-200 dark:border-gray-700'
                                : 'cursor-grab border-gray-200 dark:border-gray-700 hover:border-indigo-300 dark:hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30',
                            ].join(' ')}
                          >
                            <div className="flex items-center justify-between mb-1">
                              {used ? (
                                <span className="text-xs text-green-600 font-medium">✓ Used</span>
                              ) : (
                                <span className="text-xs text-gray-300">⠿</span>
                              )}
                            </div>
                            <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words leading-relaxed">
                              {displayText}
                            </p>
                            {isLong && (
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedChunks((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(chunk.id)) next.delete(chunk.id);
                                    else next.add(chunk.id);
                                    return next;
                                  })
                                }
                                className="text-xs text-indigo-500 hover:text-indigo-700 mt-1 transition-colors"
                              >
                                {isExpanded ? 'show less' : 'show more'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}

              {/* Manual selection fallback */}
              <div className="px-3 pb-3 pt-2 border-t border-gray-100 dark:border-gray-700 mt-1">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-1.5">Chunk not right?</p>
                <button
                  type="button"
                  onClick={() => { setPendingSelection(''); setShowRawModal(true); }}
                  className="text-xs px-3 py-1.5 border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 rounded-lg hover:border-gray-300 dark:hover:border-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors w-full"
                >
                  Select from raw text
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Raw text modal */}
      {showRawModal && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/40"
          onClick={() => { setShowRawModal(false); setPendingSelection(''); }}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl dark:shadow-black/60 flex flex-col"
            style={{ width: 600, maxHeight: '70vh' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">Raw Resume Text</span>
              <button
                type="button"
                onClick={() => { setShowRawModal(false); setPendingSelection(''); }}
                className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xl leading-none transition-colors"
              >
                ×
              </button>
            </div>
            <div
              className="flex-1 overflow-y-auto px-4 py-3 text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono select-text leading-relaxed min-h-0"
              onMouseUp={handleRawMouseUp}
            >
              {resume.rawText}
            </div>
            {pendingSelection && (
              <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-indigo-50 dark:bg-indigo-900/30 shrink-0">
                <p className="text-xs text-gray-600 dark:text-gray-300 mb-2 truncate">
                  Selected: <em>&ldquo;{pendingSelection.slice(0, 80)}{pendingSelection.length > 80 ? '…' : ''}&rdquo;</em>
                </p>
                <button
                  type="button"
                  onClick={handleAddChunk}
                  className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  Add as chunk
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
