import { Fragment, type ComponentPropsWithRef, type ReactNode } from 'react';
import {
  PROFILE_FIELD_LAYOUTS,
  type CatalogField,
  type CatalogNode,
  type ProfileFieldKey,
  type ProfileFieldScope,
} from '@/src/profile/fieldCatalog';
import { stableDisclosureFocus } from './stableControlFocus';

type FieldRenderers<Scope extends ProfileFieldScope> = {
  [Key in ProfileFieldKey<Scope>]: (field: CatalogField) => ReactNode;
};

export function ProfileFields<Scope extends ProfileFieldScope>({
  scope,
  renderers,
  disclosureProps,
  values,
}: {
  scope: Scope;
  renderers: FieldRenderers<Scope>;
  values?: Record<string, unknown>;
  disclosureProps?: Record<string, ComponentPropsWithRef<'details'>>;
}) {
  const controls = renderers as Record<string, (field: CatalogField) => ReactNode>;
  const render = (nodes: readonly CatalogNode[]): ReactNode =>
    nodes.map((node) => {
      if (node.kind === 'field') {
        if (node.when && values?.[node.when.key] !== node.when.value) return null;
        return <Fragment key={node.key}>{controls[node.key](node)}</Fragment>;
      }
      if (node.disclosure)
        return (
          <details key={node.key} className={node.className} {...disclosureProps?.[node.key]}>
            <summary
              {...stableDisclosureFocus}
              className="cursor-pointer text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              {node.disclosure}
            </summary>
            <div className="mt-3">{render(node.children)}</div>
          </details>
        );
      return (
        <div key={node.key} className={node.className}>
          {render(node.children)}
        </div>
      );
    });
  return <>{render(PROFILE_FIELD_LAYOUTS[scope])}</>;
}
