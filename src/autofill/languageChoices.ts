import { LANGUAGES } from '../data/languages';
import type { FieldSignals } from './signals';

const names = LANGUAGES.map((language) => ({
  code: language.code,
  pattern: new RegExp(
    `(?<![\\p{L}\\p{N}])${language.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`,
    'iu',
  ),
}));
export function proficiencyQuestion(
  signals: Pick<FieldSignals, 'label' | 'ariaLabel' | 'placeholder'>,
): string {
  const question = [signals.label, signals.ariaLabel, signals.placeholder]
    .filter(Boolean)
    .join(' ');
  return /\b(proficiency|fluency|language\s+level)\b/i.test(question) ? question : '';
}
export function questionLanguageCodes(question: string): string[] {
  return names
    .filter((language) => language.pattern.test(question))
    .map((language) => language.code);
}

/** These are equivalent or broader proficiency labels, never a higher tier. */
export function languageChoiceAliases(signals: FieldSignals, value: string): readonly string[] {
  const question = proficiencyQuestion(signals);
  if (/\b(programming|coding|computer|markup|scripting)\b/i.test(question)) return [];
  if (!question || (!/\blanguage\b/i.test(question) && !questionLanguageCodes(question).length))
    return [];
  const aliases: Record<string, string[]> = {
    Native: ['Native or bilingual', 'Native / bilingual proficiency', 'Native proficiency'],
    Fluent: ['Full professional proficiency', 'Full professional', 'Professional'],
    Advanced: ['Professional working proficiency', 'Professional working', 'Professional'],
    Intermediate: ['Limited working proficiency', 'Limited working', 'Conversational'],
    Basic: ['Elementary proficiency', 'Elementary', 'Beginner'],
  };
  return aliases[value] ?? [];
}
