// Limits for newly uploaded documents and imported profile files.
export const MAX_DOCUMENT_FILE_BYTES = 4 * 1024 * 1024;
export const DOCUMENT_FILE_SIZE_LABEL = '4 MB';
export const DOCUMENT_FILE_SIZE_ERROR = `File exceeds ${DOCUMENT_FILE_SIZE_LABEL} limit`;

// Base64 expands raw bytes by 4/3. Allow room for the data URI prefix.
export const MAX_DOCUMENT_BASE64_LENGTH = Math.ceil(MAX_DOCUMENT_FILE_BYTES / 3) * 4 + 100;

export function documentFileSizeError(size: number): string {
  return size > MAX_DOCUMENT_FILE_BYTES
    ? `${DOCUMENT_FILE_SIZE_ERROR} (${(size / (1024 * 1024)).toFixed(1)} MB)`
    : '';
}
