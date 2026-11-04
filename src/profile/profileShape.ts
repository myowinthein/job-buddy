import type { ProfileStoragePath } from './fieldCatalog';

export type ProfileShape<Leaf> =
  | Leaf
  | { [key: string]: ProfileShape<Leaf> }
  | [ProfileShape<Leaf>];

/** Only catalog-owned raw paths may construct a projection or extraction shape. */
export function profileShape<Leaf>(
  paths: readonly ProfileStoragePath[],
  leaf: (path: ProfileStoragePath) => Leaf,
): ProfileShape<Leaf> {
  const root: Record<string, ProfileShape<Leaf>> = {};
  for (const path of paths) {
    const parts = path.split('.');
    let node = root;
    for (let index = 0; index < parts.length; index++) {
      const key = parts[index];
      if (index === parts.length - 1) node[key] = leaf(path);
      else if (parts[index + 1] === '$') {
        const child = (node[key] ??= [{}]);
        node = (child as [Record<string, ProfileShape<Leaf>>])[0];
        index++;
      } else {
        node[key] ??= {};
        node = node[key] as Record<string, ProfileShape<Leaf>>;
      }
    }
  }
  return root;
}
