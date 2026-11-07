import { feedback } from '@/src/ui/feedback';
import type { AutofillRun } from '@/src/autofill/runCoordinator';
import { isAISetupError, isProfileSetupError } from '@/src/autofill/errorCodes';
import { quickFillSummary } from './status';
import { QUICK_FILL_HOST } from './detect';
import type { QuickFillPreferences } from './preferences';

interface Actions {
  fill: () => void;
  undo: () => void;
  details: () => void;
  hide: () => void;
  disableSite: () => void;
  settings: () => void;
  position: (position: { x: number; y: number }) => void;
}
const ICON =
  '<svg aria-hidden="true" viewBox="0 0 128 128"><rect width="128" height="128" rx="32" fill="var(--brand)"/><rect x="36" y="28" width="22" height="22" rx="3" fill="white"/><path d="M80 28H102V69C102 91 86 104 65 104C48 104 33 96 26 84L42 70C47 79 54 84 65 84C74 84 80 78 80 68V28Z" fill="white"/></svg>';
const CSS = `
:host { all:initial; position:fixed!important; z-index:2147483646!important; display:block; width:max-content; max-width:calc(100vw - 24px); color-scheme:light; --brand:#4b79f7; --bg:#fff; --fg:#182231; --muted:#596477; --line:#d8dee8; --hover:#eef2f9; --review:#946200; --success:#15803d; --error:#b91c1c; }
:host([data-dev]) { --brand:#d99b12; }
:host([data-dark]) { color-scheme:dark; --bg:#172132; --fg:#f1f5f9; --muted:#b1bdce; --line:#42516a; --hover:#25344b; --review:#fbbf24; --success:#4ade80; --error:#fca5a5; }
* { box-sizing:border-box; }
.shell { font:13px/1.45 system-ui,-apple-system,sans-serif; color:var(--fg); background:var(--bg); border:1px solid var(--line); border-radius:15px; box-shadow:0 3px 18px #0002; max-width:328px; }
.controls { display:flex; align-items:center; padding:5px; gap:2px; }
button { appearance:none; font:inherit; border:0; margin:0; background:transparent; color:inherit; cursor:pointer; border-radius:9px; padding:8px; line-height:1.3; }
button:hover { background:var(--hover); }
button:focus-visible { outline:2px solid var(--brand); outline-offset:1px; }
button:disabled { cursor:default; opacity:.65; }
.fill { display:flex; align-items:center; gap:8px; font-weight:600; padding:7px 10px 7px 6px; white-space:nowrap; }
.brand,.brand svg { display:block; width:22px; height:22px; flex:none; }
.grip { cursor:grab; touch-action:none; padding:9px 3px; color:var(--muted); letter-spacing:-2px; }
.grip:active { cursor:grabbing; }
.more { width:30px; font-size:20px; padding:5px; color:var(--muted); }
.status { padding:0 12px 10px; font-size:12px; max-width:min(328px,calc(100vw - 24px)); }
.status p { margin:1px 0 5px; }
.status[data-complete] { padding:0 10px 6px; }
.status[data-complete] p { line-height:1.35; margin:0 0 2px; }
.status[data-tone=neutral] { color:var(--muted); }
.attention { color:var(--review); }
.status[data-tone=working],.status[data-tone=setup] { color:var(--brand); }
.status[data-tone=success] { color:var(--success); }
.status[data-tone=review] { color:var(--review); }
.status[data-tone=error] { color:var(--error); }
.links { display:flex; gap:10px; color:var(--muted); }
.links button { font-size:11px; padding:3px 0; text-decoration:none; text-underline-offset:3px; }
.links button:hover,.links button:focus-visible { color:var(--fg); text-decoration:underline; }
.menu { position:absolute; bottom:calc(100% + 8px); width:210px; max-width:calc(100vw - 24px); overflow-y:auto; overscroll-behavior:contain; background:var(--bg); border:1px solid var(--line); border-radius:12px; box-shadow:0 4px 18px #0002; padding:5px; }
.menu[data-below] { top:calc(100% + 8px); bottom:auto; }
.menu button { display:block; text-align:left; width:100%; padding:9px 10px; }
[hidden] { display:none!important; }
.spin { display:inline-block; width:22px; height:22px; border:2px solid currentColor; border-right-color:transparent; border-radius:50%; animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .spin { animation:none; border-style:dotted; } }
`;
export class QuickFillWidget {
  readonly host = document.createElement('div');
  private root: ShadowRoot;
  private primary: HTMLButtonElement;
  private label: HTMLElement;
  private status: HTMLElement;
  private text: HTMLElement;
  private undo: HTMLButtonElement;
  private details: HTMLButtonElement;
  private menu: HTMLElement;
  private more: HTMLButtonElement;
  private position?: QuickFillPreferences['position'];
  private fillMode: QuickFillPreferences['fillMode'] = 'overwrite';
  private drag?: { x: number; y: number; left: number; top: number; moved: boolean };
  private busy = false;
  private resize = () => this.place();
  private outside = (event: Event) => {
    if (!event.composedPath().includes(this.host)) this.closeMenu();
  };

  constructor(private actions: Actions) {
    this.host.setAttribute(QUICK_FILL_HOST, '');
    this.host.setAttribute('role', 'region');
    this.host.setAttribute('aria-label', 'Job Buddy quick fill');
    if (import.meta.env.DEV) this.host.setAttribute('data-dev', '');
    this.root = this.host.attachShadow({ mode: 'open' });
    // Static markup only. Page text and stored data always use textContent.
    this.root.innerHTML = `<style>${CSS}</style><div class="shell"><div class="controls"><button type="button" class="grip" aria-label="Move Job Buddy" title="Drag to move. Use arrow keys when focused.">⠿</button><button type="button" class="fill"><span class="brand" aria-hidden="true">${ICON}</span><span class="label">Fill Form</span></button><button type="button" class="more" aria-label="Quick fill options" aria-expanded="false" aria-controls="quick-menu">⋯</button></div><div class="status" hidden><p role="status" aria-live="polite"></p><div class="links"><button type="button" class="undo" hidden>Undo</button><button type="button" class="details" hidden>View details</button></div></div><div id="quick-menu" class="menu" hidden><button type="button" data-action="hide">Hide until refresh</button><button type="button" data-action="disableSite">Disable on this site</button><button type="button" data-action="settings">Quick fill settings</button></div></div>`;
    const get = <T extends HTMLElement>(selector: string) => this.root.querySelector<T>(selector)!;
    this.primary = get('.fill');
    this.primary.title = feedback.quickFillEmptyFieldsHint;
    this.label = get('.label');
    this.status = get('.status');
    this.text = get('.status p');
    this.undo = get('.undo');
    this.details = get('.details');
    this.menu = get('.menu');
    this.more = get('.more');
    this.primary.addEventListener('click', (e) => {
      if (e.isTrusted && !this.busy) {
        this.closeMenu();
        actions.fill();
      }
    });
    this.undo.addEventListener('click', (e) => {
      if (e.isTrusted) actions.undo();
    });
    this.details.addEventListener('click', (e) => {
      if (e.isTrusted) actions.details();
    });
    this.more.addEventListener('click', (e) => {
      if (!e.isTrusted) return;
      const opening = this.menu.hidden;
      this.menu.hidden = !opening;
      this.more.setAttribute('aria-expanded', String(opening));
      this.placeMenu();
      if (opening) this.menu.querySelector('button')?.focus();
    });
    this.root.addEventListener('focusout', (event) => {
      const next = (event as FocusEvent).relatedTarget;
      if (!(next instanceof Node) || !this.root.contains(next)) this.closeMenu();
    });
    this.root.addEventListener('keydown', (event) => {
      const e = event as KeyboardEvent;
      if (e.key === 'Escape' && !this.menu.hidden) {
        e.stopPropagation();
        this.closeMenu();
        this.more.focus();
      }
    });
    for (const button of this.root.querySelectorAll<HTMLButtonElement>('[data-action]')) {
      button.addEventListener('click', (e) => {
        if (!e.isTrusted) return;
        this.closeMenu();
        actions[button.dataset.action as 'hide' | 'disableSite' | 'settings']();
      });
    }
    const grip = get<HTMLButtonElement>('.grip');
    grip.addEventListener('pointerdown', (e) => {
      if (!e.isTrusted || e.button !== 0) return;
      e.preventDefault();
      this.closeMenu();
      const rect = this.host.getBoundingClientRect();
      this.drag = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top, moved: false };
      grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
      if (!e.isTrusted || !this.drag) return;
      const d = this.drag;
      const dx = e.clientX - d.x,
        dy = e.clientY - d.y;
      d.moved ||= Math.abs(dx) + Math.abs(dy) > 4;
      if (d.moved) this.move(d.left + dx, d.top + dy);
    });
    const endDrag = () => {
      if (this.drag?.moved && this.position) actions.position(this.position);
      this.drag = undefined;
    };
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);
    grip.addEventListener('keydown', (e) => {
      if (!e.isTrusted || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key))
        return;
      e.preventDefault();
      const rect = this.host.getBoundingClientRect();
      const delta = e.shiftKey ? 40 : 10;
      this.move(
        rect.left + (e.key === 'ArrowLeft' ? -delta : e.key === 'ArrowRight' ? delta : 0),
        rect.top + (e.key === 'ArrowUp' ? -delta : e.key === 'ArrowDown' ? delta : 0),
      );
      if (this.position) actions.position(this.position);
    });
    window.addEventListener('resize', this.resize);
    document.addEventListener('pointerdown', this.outside, true);
    document.documentElement.append(this.host);
    this.place();
  }
  private closeMenu() {
    this.menu.hidden = true;
    this.more.setAttribute('aria-expanded', 'false');
  }
  private placeMenu() {
    if (this.menu.hidden) return;
    const rect = this.host.getBoundingClientRect();
    const width = this.menu.getBoundingClientRect().width;
    const above = Math.max(0, rect.top - 20);
    const below = Math.max(0, innerHeight - rect.bottom - 20);
    const openBelow = above < this.menu.scrollHeight + 2 && below > above;
    this.menu.toggleAttribute('data-below', openBelow);
    this.menu.style.maxHeight = `${openBelow ? below : above}px`;
    const left = Math.max(12, Math.min(rect.right - width, innerWidth - width - 12));
    this.menu.style.left = `${left - rect.left}px`;
  }
  private move(left: number, top: number) {
    const rect = this.host.getBoundingClientRect();
    const width = Math.max(1, innerWidth - rect.width - 24),
      height = Math.max(1, innerHeight - rect.height - 24);
    this.position = {
      x: Math.max(0, Math.min(1, (left - 12) / width)),
      y: Math.max(0, Math.min(1, (top - 12) / height)),
    };
    this.place();
  }
  private place() {
    const rect = this.host.getBoundingClientRect();
    const x = this.position?.x ?? 1,
      y = this.position?.y ?? 1;
    this.host.style.setProperty(
      'left',
      `${12 + x * Math.max(0, innerWidth - rect.width - 24)}px`,
      'important',
    );
    this.host.style.setProperty(
      'top',
      `${12 + y * Math.max(0, innerHeight - rect.height - 24)}px`,
      'important',
    );
    this.host.style.setProperty('right', 'auto', 'important');
    this.host.style.setProperty('bottom', 'auto', 'important');
    this.placeMenu();
  }
  preferences(prefs: QuickFillPreferences, dark: boolean) {
    this.position = prefs.position;
    this.fillMode = prefs.fillMode;
    this.primary.title =
      prefs.fillMode === 'overwrite'
        ? 'Fill empty and existing fields with your Job Buddy profile.'
        : feedback.quickFillEmptyFieldsHint;
    this.host.toggleAttribute('data-dark', dark);
    this.place();
  }
  render(run: AutofillRun | null, starting = false) {
    this.busy = starting || run?.stage === 'scanning' || run?.stage === 'filling';
    this.primary.disabled = this.busy;
    this.label.textContent = this.busy
      ? 'Filling…'
      : run?.stage === 'confirming'
        ? this.fillMode === 'overwrite'
          ? 'Fill All Fields'
          : 'Fill Empty Fields'
        : 'Fill Form';
    const spinner = this.primary.querySelector('.spin');
    spinner?.remove();
    this.primary.querySelector<HTMLElement>('.brand')!.hidden = this.busy;
    if (this.busy) {
      const icon = document.createElement('span');
      icon.className = 'spin';
      icon.setAttribute('aria-hidden', 'true');
      this.primary.insertBefore(icon, this.label);
    }
    this.status.hidden = !run || this.busy;
    this.status.toggleAttribute('data-complete', run?.stage === 'completed' && !this.busy);
    this.undo.hidden = true;
    this.details.hidden = true;
    if (run?.stage === 'completed') {
      const summary = quickFillSummary(run);
      if (summary.attentionText) {
        const filled = document.createElement('span');
        filled.textContent = `${summary.filled} filled`;
        const attention = document.createElement('span');
        attention.className = 'attention';
        attention.textContent = summary.attentionText;
        this.text.replaceChildren(filled, document.createTextNode(', '), attention);
        this.status.dataset.tone = 'neutral';
      } else {
        this.text.textContent = summary.text;
        this.status.dataset.tone = summary.review
          ? 'review'
          : summary.filled
            ? 'success'
            : 'neutral';
      }
      this.undo.hidden = summary.filled === 0;
      this.details.hidden = summary.filled === 0 && !summary.review;
    } else if (run?.stage === 'confirming') {
      this.text.textContent = 'Existing answers will be kept.';
      this.status.dataset.tone = 'neutral';
    } else if (run?.stage === 'error') {
      const profile = isProfileSetupError(run.error);
      const ai = isAISetupError(run.error);
      this.status.dataset.tone = profile || ai ? 'setup' : 'error';
      this.label.textContent = profile ? 'Set Up Profile' : ai ? 'Set Up AI Autofill' : 'Try Again';
      this.text.textContent = profile
        ? 'Add your first name and email to start.'
        : ai
          ? feedback.autofillKeyRequired
          : feedback.autofillFailed;
    }
    this.place();
  }
  error(text: string) {
    this.busy = false;
    this.primary.disabled = false;
    this.label.textContent = 'Try Again';
    this.primary.querySelector<HTMLElement>('.brand')!.hidden = false;
    this.primary.querySelector('.spin')?.remove();
    this.status.hidden = false;
    this.status.removeAttribute('data-complete');
    this.status.dataset.tone = 'error';
    this.text.textContent = text;
    this.place();
  }
  destroy() {
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('pointerdown', this.outside, true);
    this.host.remove();
  }
}
