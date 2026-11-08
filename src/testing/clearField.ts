import { captureField } from '@/src/autofill/fieldState';
import { restore } from '@/src/autofill/filler';

/** Clears a control through the real restore path, as the filler tests exercise it. */
export async function clearFieldValue(element: HTMLElement): Promise<boolean> {
  try {
    const state = captureField(element);
    if (state.choices)
      state.choices = state.choices.map((item) => ({
        ...item,
        checked: false,
        indeterminate: false,
      }));
    if (state.options) state.options = state.options.map((item) => ({ ...item, selected: false }));
    if (state.files) state.files = [];
    state.value = '';
    if (state.content) state.content = [];
    return await restore(element, state, () => true);
  } catch {
    return false;
  }
}
