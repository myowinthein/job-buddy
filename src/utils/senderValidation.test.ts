import { describe, expect, it } from 'vitest';
import { senderDomain, validLabelSignals } from './senderValidation';

const sender = (fields: Partial<chrome.runtime.MessageSender>) =>
  fields as chrome.runtime.MessageSender;

describe('senderDomain', () => {
  it('uses the sender URL host', () => {
    expect(senderDomain(sender({ url: 'https://jobs.example.test/apply?x=1' }))).toBe(
      'jobs.example.test',
    );
  });

  it('falls back to the origin for inherited-origin frames', () => {
    expect(senderDomain(sender({ url: 'about:blank', origin: 'https://ats.example.test' }))).toBe(
      'ats.example.test',
    );
  });

  it('rejects non-HTTP senders', () => {
    expect(senderDomain(sender({ url: 'chrome-extension://abc/popup.html' }))).toBeNull();
  });

  it('rejects a non-HTTP origin', () => {
    expect(
      senderDomain(sender({ url: 'about:blank', origin: 'chrome-extension://abc' })),
    ).toBeNull();
  });

  it('rejects a missing URL and origin', () => {
    expect(senderDomain(sender({}))).toBeNull();
  });
});

describe('validLabelSignals', () => {
  it('accepts legacy strings and counted entries for the domain', () => {
    const signals = { a: 'work.title', b: { path: 'personal.email', count: 2 } };
    expect(validLabelSignals({ 'x.test': signals }, 'x.test')).toBe(signals);
  });

  it('ignores other domains', () => {
    expect(validLabelSignals({ 'y.test': { a: 'work.title' } }, 'x.test')).toBeNull();
  });

  it('rejects arrays and non-objects', () => {
    expect(validLabelSignals({ 'x.test': ['work.title'] }, 'x.test')).toBeNull();
  });

  it('rejects entries without a string path', () => {
    expect(validLabelSignals({ 'x.test': { a: { path: 3 } } }, 'x.test')).toBeNull();
  });

  it('rejects a missing payload', () => {
    expect(validLabelSignals(undefined, 'x.test')).toBeNull();
  });
});
