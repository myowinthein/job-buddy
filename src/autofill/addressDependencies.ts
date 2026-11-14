import type { FieldMatch } from './mapper';
import { countryName } from '../data/countries';
import type { FieldSignals } from './signals';
import { bestLabel, extractSignals } from './signals';
import { controlForm, hasVisibleSurface, isControlAvailable, queryOpenElements } from './dom';
import { menuSelect, selectMenu } from './menuSelect';
import { isSkippableOption, normalize } from './normalizer';
import { readFieldValue } from './fieldValue';
import { captureField } from './fieldState';
import { restore, type FillFieldContext } from './filler';

interface AddressField {
  element: HTMLElement;
  signals: FieldSignals;
  match: FieldMatch;
}
const regionQuestion = (element: HTMLElement) =>
  [
    'state',
    'province',
    'region',
    'stateprovince',
    'stateorprovince',
    'provinceorterritory',
  ].includes(normalize(bestLabel(extractSignals(element))));
const ADDRESS_TRANSITION_WAIT_MS = 2_000;

/** Follow only an identified address region's stable name after its country changes. */
export function addressDependencies<T extends AddressField>(fields: T[]) {
  return fields
    .filter((field) => field.match.fieldPath === 'address.country')
    .flatMap((country) => {
      const form = controlForm(country.element);
      const root = country.element.getRootNode();
      if (!form) return [];
      const scoped = fields.filter(
        (field) => controlForm(field.element) === form && field.element.getRootNode() === root,
      );
      const regions = scoped.filter(
        (field) => field.match.fieldPath === 'address.state' && regionQuestion(field.element),
      );
      if (
        regions.length !== 1 ||
        scoped.filter((field) => field.match.fieldPath === 'address.country').length !== 1
      )
        return [];
      const region = regions[0];
      const name = region.signals.name;
      const id = region.signals.id;
      if (!name && !id) return [];
      const original = region.element;
      const countryValue = readFieldValue(country.element);
      const countryDisplay =
        country.element instanceof HTMLSelectElement
          ? (country.element.selectedOptions[0]?.textContent?.trim() ?? '')
          : countryValue;
      const countryTargets = [
        country.match.value ?? '',
        countryName(country.match.value ?? ''),
      ].map(normalize);
      const changesCountry = ![countryValue, countryDisplay].some((value) =>
        countryTargets.includes(normalize(value)),
      );
      const optionsBefore =
        original instanceof HTMLSelectElement
          ? JSON.stringify([...original.options].map((option) => [option.value, option.text]))
          : '';
      const originalMenu = menuSelect(original);
      const originalLabel = normalize(bestLabel(region.signals));
      const originalValue = readFieldValue(original);
      const nativeValue =
        originalMenu?.select.value ??
        (original instanceof HTMLSelectElement ? original.value : originalValue);
      const displayValue =
        original instanceof HTMLSelectElement
          ? originalValue
            ? (original.selectedOptions[0]?.textContent?.trim() ?? '')
            : ''
          : originalValue;
      const find = () => {
        if (!form.isConnected || country.element.getRootNode() !== root) return null;
        const candidates = queryOpenElements(
          form,
          'input[name],textarea[name],select[name],input[id],textarea[id],select[id],button[data-menu-id]',
        ).filter(
          (element) =>
            element.getRootNode() === root &&
            controlForm(element) === form &&
            (name
              ? (element.getAttribute('name') || menuSelect(element)?.select.name) === name
              : (menuSelect(element)?.select.id || element.id) === id) &&
            !(element instanceof HTMLInputElement && !['text', 'search'].includes(element.type)) &&
            isControlAvailable(element) &&
            hasVisibleSurface(element) &&
            regionQuestion(element),
        );
        return candidates.length === 1 ? candidates[0] : null;
      };
      const originalKind = (element: HTMLElement) =>
        originalMenu
          ? !!menuSelect(element)
          : original instanceof HTMLSelectElement
            ? element instanceof HTMLSelectElement
            : element instanceof HTMLInputElement;
      const waitForOriginal = (active: () => boolean): Promise<HTMLElement | null> =>
        new Promise((resolve) => {
          const start = Date.now();
          let timer: ReturnType<typeof setTimeout>;
          const observer = new MutationObserver(check);
          const finish = (element: HTMLElement | null) => {
            observer.disconnect();
            clearTimeout(timer);
            resolve(element);
          };
          function check() {
            clearTimeout(timer);
            if (!active()) return finish(null);
            const element = find();
            if (
              element &&
              originalKind(element) &&
              normalize(bestLabel(extractSignals(element))) === originalLabel
            )
              return finish(element);
            if (Date.now() - start >= ADDRESS_TRANSITION_WAIT_MS) return finish(null);
            timer = setTimeout(check, 50);
          }
          observer.observe(form, { subtree: true, childList: true, attributes: true });
          check();
        });
      const context: FillFieldContext = {
        dependencies: {
          target: root,
          matches: (event) => {
            const current = find();
            if (!current) return false;
            if (event.type !== 'click') return event.composedPath().includes(current);
            const menu = selectMenu(current);
            return (
              !!menu &&
              event
                .composedPath()
                .some(
                  (node) =>
                    node instanceof HTMLElement &&
                    node.matches('[role="menuitem"],[role="menuitemradio"],[role="option"]') &&
                    menu.contains(node),
                )
            );
          },
        },
        restoreAfter: async (active) => {
          if (!active()) return false;
          const current = await waitForOriginal(active);
          if (!current) return !displayValue;
          const snapshot = captureField(current);
          if (current instanceof HTMLSelectElement) {
            const options = [...current.options].filter(
              (option) =>
                option.value === nativeValue ||
                (!!displayValue && option.text.trim() === displayValue),
            );
            if (options.length !== 1) return false;
            snapshot.value = options[0].value;
            snapshot.options = [...current.options].map((option) => ({
              option,
              selected: option === options[0],
            }));
          } else snapshot.value = displayValue;
          if (readFieldValue(current) === snapshot.value) return true;
          return restore(current, snapshot, active);
        },
      };
      const waitForReplacement = async (active: () => boolean): Promise<void> => {
        if (!changesCountry) return;
        const start = Date.now();
        while (active() && Date.now() - start < ADDRESS_TRANSITION_WAIT_MS) {
          const current = find();
          if (
            current instanceof HTMLSelectElement &&
            ![...current.options].some((option) => !isSkippableOption(option))
          ) {
            await new Promise((resolve) => setTimeout(resolve, 50));
            continue;
          }
          if (current && current !== original) return;
          if (
            current instanceof HTMLSelectElement &&
            JSON.stringify([...current.options].map((option) => [option.value, option.text])) !==
              optionsBefore
          )
            return;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      };
      return [
        {
          country,
          region,
          context,
          waitForReplacement,
          replacement: () => (original.isConnected ? null : find()),
        },
      ];
    });
}
