import { useState } from 'react';
import type { Profile } from '@/src/types/profile';
import type { FieldChange } from '@/src/resume-ai/types';
import ImportReviewScreen from '@/src/components/shared/ImportReviewScreen';
import { ImportProfileChangedError } from '@/src/utils/importPolicy';
import { profileRecoveryChanges } from '@/src/utils/profileRecovery';
import { ReportedSaveError } from './shared/saveSection';
import { feedback } from '@/src/ui/feedback';

export interface ProfileRecovery {
  original: Partial<Profile>;
  draft: Partial<Profile>;
  current: Partial<Profile>;
}

export function ProfileRecoveryDialog({
  recovery,
  onApply,
  onClose,
}: {
  recovery: ProfileRecovery;
  onApply: (base: Partial<Profile>, changes: FieldChange[]) => Promise<void>;
  onClose: () => void;
}) {
  const [current, setCurrent] = useState(recovery.current);
  const [changes, setChanges] = useState(() =>
    profileRecoveryChanges(recovery.original, recovery.draft, recovery.current),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <ImportReviewScreen
      title="Review Unsaved Changes"
      description="Your profile changed in another tab. Choose which unsaved edits to keep."
      incomingLabel="Your unsaved changes"
      saveLabel="Save Selected"
      emptySelectionLabel="Use Saved Profile"
      backLabel="Keep Editing"
      error={error}
      errorTone={error === feedback.profileRecoveryChanged ? 'review' : 'error'}
      changes={changes}
      onChangesChange={setChanges}
      isSaving={saving}
      onBack={onClose}
      onDismiss={onClose}
      onSave={async (selected) => {
        setSaving(true);
        setError('');
        try {
          await onApply(current, selected);
        } catch (error) {
          if (error instanceof ImportProfileChangedError) {
            setCurrent(error.current);
            setChanges(profileRecoveryChanges(recovery.original, recovery.draft, error.current));
            setError(feedback.profileRecoveryChanged);
          } else if (!(error instanceof ReportedSaveError)) setError(feedback.sectionSaveFailed);
        } finally {
          setSaving(false);
        }
      }}
    />
  );
}
