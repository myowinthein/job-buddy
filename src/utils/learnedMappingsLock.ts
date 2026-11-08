import { createNamedLock } from './namedLock';

export const withLearnedMappingsLock = createNamedLock('job-buddy:learned-mappings');
