import { afterEach, expect, it, vi } from 'vitest';
import * as drive from './driveSync';
import * as gemini from './gemini';
import { DEV_PROFILE } from '@/src/utils/devProfile';
import { DEFAULT_GEMINI_MODEL } from '@/src/resume-ai/types';
import previewConfig from '../../vite.preview.config';
import { resolveConfig } from 'vite';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it('never makes a network request or starts OAuth through preview integration functions', async () => {
  const fetch = vi.fn();
  const launchWebAuthFlow = vi.fn();
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('chrome', { identity: { launchWebAuthFlow } });

  expect(drive.isDriveConfigured()).toBe(false);
  expect((await drive.getFullDriveState()).connected).toBe(false);
  expect(await drive.syncProfileToDrive(DEV_PROFILE)).toEqual({ success: false, errorCode: null });
  await expect(drive.connectDrive()).rejects.toThrow('disabled');
  await expect(drive.overwriteDriveWithLocal(DEV_PROFILE)).rejects.toThrow('disabled');
  await drive.disconnectDrive(true);
  await drive.retryPendingDriveSync();
  await drive.syncIfConnected();
  expect(await gemini.checkApiKey('synthetic-key')).toBe('network_error');
  expect(await gemini.validateApiKey('synthetic-key')).toMatchObject({ valid: false });
  await expect(
    gemini.extractFromResume(
      'synthetic-key',
      DEFAULT_GEMINI_MODEL,
      '',
      'application/pdf',
      DEV_PROFILE,
    ),
  ).rejects.toMatchObject({ message: expect.stringContaining('disabled') });
  await expect(
    gemini.resolveFieldsWithAI('synthetic-key', DEFAULT_GEMINI_MODEL, [], DEV_PROFILE),
  ).rejects.toThrow('disabled');
  await expect(
    gemini.reviewMappingsWithAI(
      'synthetic-key',
      DEFAULT_GEMINI_MODEL,
      [],
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow('disabled');
  expect(fetch).not.toHaveBeenCalled();
  expect(launchWebAuthFlow).not.toHaveBeenCalled();
});

it('excludes inherited integration variables and resolves both integration modules to preview stubs', async () => {
  vi.stubEnv('VITE_GEMINI_API_KEY', 'synthetic-inherited-secret');
  vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'synthetic-inherited-client');
  const config = await resolveConfig({ ...previewConfig, configFile: false }, 'serve');
  expect(config.envDir).toBe(false);
  expect(config.env).not.toHaveProperty('VITE_GEMINI_API_KEY');
  expect(config.env).not.toHaveProperty('VITE_GOOGLE_CLIENT_ID');
  expect(config.resolve.alias).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        find: '@/src/utils/driveSync',
        replacement: expect.stringContaining('/src/preview/driveSync.ts'),
      }),
      expect.objectContaining({
        find: '@/src/resume-ai/gemini',
        replacement: expect.stringContaining('/src/preview/gemini.ts'),
      }),
    ]),
  );
});
