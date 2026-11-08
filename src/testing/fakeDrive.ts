import type { DriveBackupFile } from '@/src/types/storage';

type Call = { method: string; url: string; payload?: DriveBackupFile };

/**
 * An in-memory Google Drive appdata server for the Drive integration tests.
 * Tests read and change `remote`, and flip the failure switches, directly.
 * `fetch` rejects any destination other than Google's Drive and OAuth hosts.
 */
export function createFakeDrive(seed: () => DriveBackupFile) {
  const drive = {
    remote: null as DriveBackupFile | null,
    version: 1,
    email: undefined as string | undefined,
    silentAuth: false,
    deleteFails: false,
    lookupFailures: 0,
    corruptDownload: false,
    patchMissing: false,
    holdUploads: false,
    pendingUploads: [] as Array<() => void>,
    calls: [] as Call[],
    reset() {
      Object.assign(drive, {
        remote: seed(),
        version: 1,
        email: undefined,
        silentAuth: false,
        deleteFails: false,
        lookupFailures: 0,
        corruptDownload: false,
        patchMissing: false,
        holdUploads: false,
        pendingUploads: [],
        calls: [],
      });
    },
    response(body: unknown, status = 200) {
      return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers({ etag: `"v${drive.version}"` }),
        json: async () => structuredClone(body),
        text: async () => JSON.stringify(body),
      };
    },
    async fetch(input: string, options: RequestInit = {}) {
      const method = options.method ?? 'GET';
      const url = String(input);
      const call: Call = { method, url };
      drive.calls.push(call);
      if (url.startsWith('https://oauth2.googleapis.com/revoke')) return drive.response({});
      if (!url.startsWith('https://www.googleapis.com/'))
        throw new Error('Unexpected audit network destination');
      if (url.includes('/about?')) return drive.response({ user: { emailAddress: drive.email } });
      if (method === 'DELETE') {
        if (drive.deleteFails) return drive.response('offline', 503);
        drive.remote = null;
        return drive.response({});
      }
      if (method === 'PATCH' || method === 'POST') {
        if (drive.patchMissing && method === 'PATCH') return drive.response('not found', 404);
        const body = options.body as string;
        const payload =
          method === 'PATCH'
            ? JSON.parse(body)
            : JSON.parse(
                body.split('Content-Type: application/json\r\n\r\n')[1].split('\r\n--')[0],
              );
        call.payload = payload;
        const finish = () => {
          const match = new Headers(options.headers).get('If-Match');
          if (match && match !== `"v${drive.version}"`) return drive.response('changed', 412);
          drive.remote = structuredClone(payload);
          drive.version++;
          return drive.response({ id: 'audit-file' });
        };
        if (drive.holdUploads)
          return new Promise((resolve) => drive.pendingUploads.push(() => resolve(finish())));
        return finish();
      }
      if (url.includes('alt=media'))
        return drive.response(drive.corruptDownload ? 'invalid backup' : drive.remote);
      if (drive.lookupFailures-- > 0) return drive.response('temporary lookup error', 503);
      return drive.response({
        files: drive.remote ? [{ id: 'audit-file', name: 'job-buddy-profile.json' }] : [],
      });
    },
  };
  return drive;
}
