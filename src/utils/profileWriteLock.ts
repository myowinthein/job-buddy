import { createNamedLock } from './namedLock';

/** Import decisions and editor saves share a lock so a person switch cannot race an old form. */
export const withProfileWriteLock = createNamedLock('job-buddy:profile-write');
