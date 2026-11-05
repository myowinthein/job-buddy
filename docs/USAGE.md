# Using Job Buddy

Start with the [setup steps in the README](../README.md#how-to-use-it).
This guide explains what happens after setup and how to manage your data.

## Build your profile

Use **Import Resume** to extract details from a PDF or DOCX file, up to 4 MB.
Review the results before importing. Job Buddy checks the file locally before
uploading it to Gemini. Unrelated documents are rejected; uncertain document types
require confirmation before review.

You can also enter or edit details in the nine profile sections. Save each section
before leaving it. The completion bar tracks 10 required checks after saving;
select a missing detail to go to its input. Optional details do not affect the
percentage. Autofill requires a saved first name, a valid email, and a Gemini key.

In **Documents**, add your CV or cover letter for supported upload fields. Use
**View PDF** to open a saved PDF or **Download** to save an attachment. Check that
the right document is attached before submitting an application.

## Fill a form

Open an application page, open Job Buddy, and select **Fill Form**. If answers
already exist, choose **Fill empty fields** to keep them or **Fill all matched
fields** to also replace existing answers with your saved details.

You can close the popup while filling continues. Reopen it to see progress or
results. If a choice about existing answers is needed, the run waits for your
confirmation. Reloading or leaving the page stops the run.

Review the answers and complete any missing fields yourself. Job Buddy does not
submit your application. Some custom controls cannot be filled automatically.

### Field colors

| Color  | Meaning                                                       |
| ------ | ------------------------------------------------------------- |
| Green  | Filled with high confidence or confirmed by you.              |
| Yellow | Filled, but needs your review.                                |
| Red    | Not filled: no safe match was found or the form rejected it.  |
| Gray   | Not filled: a profile match was found, but no data was saved. |

Consent questions are skipped. Existing answers are kept in empty-fields mode.
If Gemini is unavailable during a run, accepted rule-based fills remain and the
popup reports the issue.

**Undo** restores previous values where possible while preserving later manual
edits. Some custom controls may not support a complete restoration.

### Quick Fill

Quick Fill adds a movable **Fill Form** button to likely application pages.
In **Settings → Quick Fill**, turn it on or off and choose whether to fill only
empty fields or also replace existing answers. Empty fields only is the default.

The button's menu can hide it until refresh or hide it for a site. Its position,
fill mode, and hidden sites are saved in this browser across restarts. Search the
hidden-site list in Settings to show the button on a site again. Moving or hiding
the button does not stop a fill already running.

Detection may miss unusual application layouts. You can still use the toolbar popup.

## Understand the results

Open **Tools → Fill Details**, or select **View details** after a fill, to inspect
the latest report. It updates as you edit the source form. Search field titles and
profile fields, filter results, or expand a field to see its learned-mapping,
rule, and AI stages.

Final totals count each field or question group once. Processing counts such as
**Checked by rules** and **Sent to AI** can overlap because a field may pass through
both stages.

The report stays available for the browser session after the source form closes.
A newer fill replaces it; **View details** can select another open form's report.
It contains field metadata rather than answer values, document contents, or keys.
Reports are excluded from exports and Drive backups and are cleared by reset or
profile replacement.

## Learned mappings

When you correct a field after autofill, Job Buddy can remember which saved profile
field you used. The value must uniquely match your saved profile information.
Move to another field to record the correction. Autofill alone does not teach a
mapping.

- **Learning:** one recorded confirmation.
- **Trusted:** two confirmations; the mapping can be used on a later fill.
- **Inactive:** excluded from filling because the saved mapping is no longer safe
  to use, for example when its profile entry was removed or became ambiguous.

Review, edit, or delete mappings in **Tools → Learned Mappings**. An explicit edit
trusts your choice immediately. **Review Mappings** uses Gemini to suggest changes
for you to review; it sends saved questions and profile field names.

## Gemini settings

Create a key in [Google AI Studio](https://aistudio.google.com/api-keys) and save it
in **Settings → AI Features**. **Save Key** verifies the key and finds a working
model. You can replace or remove the key and change the model in Settings.
Resume import tries your selected model first, then other supported models when a
request times out, is rate-limited, or is temporarily unavailable.

Your key and model preference stay in this browser and are excluded from profile
exports and Drive backups. Gemini's
[usage limits](https://ai.google.dev/gemini-api/docs/rate-limits) still apply.

## Back up or import data

**Export Profile** saves your profile and learned mappings as a JSON file.
**Import Profile** loads a Job Buddy export. Valid backups import directly into an
empty profile; existing differences can be reviewed before applying changes.
Identical data leaves the current profile unchanged.

Resume, JSON, and Drive imports offer **Update current profile** and **Replace
current profile** when the incoming name or email may belong to another person.
Update keeps omitted details. Resume updates also preserve saved entries omitted
from the resume; JSON and Drive imports replace supplied lists with the accepted
incoming lists. Review lets you select individual work, education, language, and
custom-link entries. Imported mappings are reconciled with saved mappings.

Replace starts fresh with the selected incoming details. Omitted profile data,
documents, and mappings are cleared. Appearance and Gemini settings stay in this
browser. Replacing from a resume or JSON pauses connected Drive backups until you
review the saved backup in Settings.

### Google Drive

Connect Drive in **Settings** to back up your profile and learned mappings.
Saved profile or mapping changes trigger a backup after a short delay. Temporary
failures retry automatically; you may be asked to reconnect. Use **Back Up Now**
to check and update the backup manually. Different data in Drive requires review.

Disconnecting keeps the last successful backup unless you choose to delete it.
It does not upload pending changes first, so use **Back Up Now** before disconnecting
if you want the latest data saved. Drive connection details, appearance, and Gemini
settings are excluded from the backup.

### Reset data

**Reset All Data** clears this browser's profile, learned mappings, settings, and
retained Fill Details report. If Drive is connected, choose whether to also delete
its backup. A failed Drive deletion must be retried before reset can finish.

## Privacy

Your profile is stored in this browser. Resume import sends the selected file and
extracted hyperlinks to Gemini. Autofill sends relevant profile details and form
fields, excluding stored document files. Personal background details are included
only when a field asks for them. Profile comparison happens locally.

Drive backup is optional. Read the [privacy policy](legal/privacy/index.html) and
[autofill and AI disclaimer](legal/disclaimer/index.html) for details.
