export interface DevContext {
  id: string;
  extensionId: string;
  version: string;
  quickPreview?: import('./quickPreview').PreviewPreset;
}

export const DEV_SAMPLE_API_KEY = 'simulated-key';

declare global {
  var __JB_DEV_CONTEXT__: DevContext | undefined;
}

export function devContext(): DevContext | undefined {
  return import.meta.env.DEV ? globalThis.__JB_DEV_CONTEXT__ : undefined;
}

export function devLockName(name: string): string {
  const context = devContext();
  return context ? `${name}:simulation:${context.id}` : name;
}
