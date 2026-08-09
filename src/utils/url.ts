// Adds a scheme if given a bare domain (e.g. "linkedin.com/in/you"). A
// scheme-less stored URL looks "filled" but fails native type="url"
// constraint validation on job sites, silently blocking submission even
// though autofill visibly wrote a value into the field. Callers must guard
// against an empty string themselves — withScheme('') would otherwise
// produce the bogus value "https://".
export function withScheme(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}
