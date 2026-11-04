import { expect, it } from 'vitest';
import ts from 'typescript';
import { settingsReviewProfile } from '../components/options/settingsReviewFixture';
import { calculateDerivedFields } from '../utils/derivedFields';
import { profileData, backupProfileData } from '../utils/profileData';
import { validateImportedProfile } from '../utils/profileValidator';
import { validateResumeProfile } from '../resume-ai/validateResume';
import { generateDiff, applyChanges, FIELD_DEFS } from '../resume-ai/parser';
import { selectChange } from '../resume-ai/entrySelection';
import { autofillProfilePayload } from '../resume-ai/profilePayload';
import { buildPrompt } from '../resume-ai/prompt';
import { PROFILE_STORAGE_PATHS } from './fieldCatalog';
import { PROFILE_POLICY_PATHS, RESUME_PROFILE_PATHS, profileFieldPolicy } from './fieldPolicies';
import { profileReviewMetadata } from './fieldMetadata';

function paths(value: unknown, prefix = ''): string[] {
  if (Array.isArray(value)) return value.flatMap((entry) => paths(entry, `${prefix}.$`));
  if (value && typeof value === 'object')
    return Object.entries(value).flatMap(([key, entry]) =>
      paths(entry, prefix ? `${prefix}.${key}` : key),
    );
  return value === undefined ? [] : [prefix];
}
const sorted = (values: readonly string[]) => [...new Set(values)].sort();
function completeProfile() {
  const profile = settingsReviewProfile();
  profile.derived = calculateDerivedFields(profile);
  return profile;
}

it('covers every canonical storage field with fixture data and an explicit feature policy', () => {
  expect(sorted(paths(completeProfile()))).toEqual(sorted(PROFILE_STORAGE_PATHS));
  expect(sorted(PROFILE_POLICY_PATHS)).toEqual(sorted(PROFILE_STORAGE_PATHS));
});

it('keeps every backup/import field through projection, validation, and shared review', () => {
  const profile = completeProfile();
  expect(profileData(profile)).toEqual(profile);
  expect(sorted(paths(backupProfileData(profile)))).toEqual(
    sorted(PROFILE_POLICY_PATHS.filter((path) => profileFieldPolicy(path).backup)),
  );
  const validation = validateImportedProfile(profile);
  expect(validation.invalidFields).toEqual([]);
  const validationPaths = PROFILE_POLICY_PATHS.filter((path) => profileFieldPolicy(path).validate);
  expect(sorted(paths(validation.sanitized))).toEqual(sorted(validationPaths));
  const accepted = generateDiff({}, validation.sanitized).map((change) =>
    selectChange(change, true),
  );
  const imported = applyChanges({}, accepted);
  const { id: _id, ...expected } = validation.sanitized;
  expect(imported).toEqual(expected);
  expect(FIELD_DEFS.map((field) => field.label)).toEqual(
    FIELD_DEFS.map((field) => profileReviewMetadata(field.id)!.label),
  );
});

it('keeps extraction validation aligned with every explicitly extractable raw field', () => {
  const extracted = validateResumeProfile(completeProfile());
  expect(sorted(paths(extracted))).toEqual(sorted(RESUME_PROFILE_PATHS));
});

it('enforces every declared text limit at the shared JSON, Drive and resume validation boundary', () => {
  for (const path of PROFILE_POLICY_PATHS) {
    const policy = profileFieldPolicy(path);
    if (!policy.validate || policy.maxLength === undefined) continue;
    const profile = completeProfile();
    const parts = path.replaceAll('$', '0').split('.');
    let parent: unknown = profile;
    for (const part of parts.slice(0, -1)) parent = (parent as Record<string, unknown>)[part];
    (parent as Record<string, unknown>)[parts.at(-1)!] = 'x'.repeat(policy.maxLength + 1);
    expect(validateImportedProfile(profile).invalidFields.length, path).toBeGreaterThan(0);
  }
});

it('rejects a work arrangement that the editor cannot represent', () => {
  const profile = completeProfile();
  Object.assign(profile.workHistory[0], { arrangement: 'freelance' });
  expect(validateImportedProfile(profile).invalidFields).toContainEqual({
    path: 'workHistory[0].arrangement',
    reason: 'expected onsite | remote | hybrid',
  });
});

it('requires the Gemini prompt schema to cover every extraction field and exclude local-only data', () => {
  const prompt = buildPrompt('{}');
  const schema = prompt.slice(prompt.indexOf('{'), prompt.indexOf('\n\nCurrent profile'));
  // The documented JSON-like schema uses type identifiers and union expressions.
  // Parse its structure without executing any of those expressions.
  const source = ts.createSourceFile(
    'schema.ts',
    `const schema = ${schema}`,
    ts.ScriptTarget.Latest,
    true,
  );
  const statement = source.statements[0] as ts.VariableStatement;
  function collect(node: ts.Expression, prefix = ''): string[] {
    if (ts.isBinaryExpression(node)) return collect(node.left, prefix);
    if (ts.isObjectLiteralExpression(node))
      return node.properties.flatMap((property) => {
        if (!ts.isPropertyAssignment(property)) return [];
        const key = property.name.getText(source).replace(/^"|"$/g, '');
        return collect(property.initializer, prefix ? `${prefix}.${key}` : key);
      });
    if (ts.isArrayLiteralExpression(node))
      return node.elements.flatMap((entry) => collect(entry as ts.Expression, `${prefix}.$`));
    return [prefix];
  }
  const schemaEnums = new Map<string, string>();
  function collectEnums(node: ts.Expression, prefix = ''): void {
    if (ts.isBinaryExpression(node)) {
      if (ts.isObjectLiteralExpression(node.left)) collectEnums(node.left, prefix);
      else schemaEnums.set(prefix, node.getText(source));
    } else if (ts.isObjectLiteralExpression(node))
      for (const property of node.properties) {
        if (ts.isPropertyAssignment(property)) {
          const key = property.name.getText(source).replace(/^"|"$/g, '');
          collectEnums(property.initializer, prefix ? `${prefix}.${key}` : key);
        }
      }
    else if (ts.isArrayLiteralExpression(node))
      for (const entry of node.elements) collectEnums(entry as ts.Expression, `${prefix}.$`);
    else if (ts.isStringLiteral(node)) schemaEnums.set(prefix, node.text);
  }
  collectEnums(statement.declarationList.declarations[0].initializer!);
  for (const path of RESUME_PROFILE_PATHS) {
    const options = profileFieldPolicy(path).options;
    if (options && path !== 'personal.ethnicity')
      for (const option of options) expect(schemaEnums.get(path), path).toContain(option);
  }
  const schemaPaths = collect(statement.declarationList.declarations[0].initializer!);
  expect(sorted(schemaPaths.filter((path) => path !== 'documentType'))).toEqual(
    sorted(RESUME_PROFILE_PATHS),
  );
});

it('applies the per-field AI policy before any profile data reaches a request', () => {
  const profile = completeProfile();
  const payload = autofillProfilePayload(profile, [
    { fieldId: 'name', type: 'text', label: 'First Name' },
  ]);
  const permitted = PROFILE_POLICY_PATHS.filter(
    (path) => profileFieldPolicy(path).autofill === 'public',
  );
  expect(sorted(paths(payload))).toEqual(sorted(permitted));
  for (const [label, scope] of [
    ['Date of birth', 'birth'],
    ['Age', 'age'],
    ['Gender', 'gender'],
    ['Ethnicity', 'ethnicity'],
    ['Veteran status', 'veteran'],
    ['Disability', 'disability'],
  ]) {
    const scoped = autofillProfilePayload(profile, [{ fieldId: 'sensitive', type: 'text', label }]);
    const expected = PROFILE_POLICY_PATHS.filter((path) => {
      const policy = profileFieldPolicy(path).autofill;
      return policy === 'public' || policy === scope || (scope === 'birth' && policy === 'age');
    });
    expect(sorted(paths(scoped)), label).toEqual(sorted(expected));
  }
});
