import { useState, type ComponentPropsWithRef } from 'react';

/** Seed expansion once so edits preserve the user's native disclosure choice. */
export function ProfileDisclosure({ open = false, ...props }: ComponentPropsWithRef<'details'>) {
  const [initialOpen] = useState(open);
  return <details {...props} open={initialOpen} />;
}
