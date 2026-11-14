import {
  MODEL_DISPLAY_NAMES,
  type GeminiModel,
  type ResumeModelAttempt,
} from '@/src/resume-ai/types';
import { feedback } from '@/src/ui/feedback';

export function ModelFallbackNotice({
  model,
  reason,
}: {
  model: GeminiModel;
  reason: NonNullable<ResumeModelAttempt['reason']>;
}) {
  return (
    <div role="status" className="mt-5 text-center text-xs text-amber-700 dark:text-amber-400">
      <p>
        {
          {
            rate_limit: feedback.mappingReviewLimitFallback,
            timeout: feedback.mappingReviewTimeoutFallback,
            unavailable: feedback.mappingReviewUnavailableFallback,
          }[reason]
        }
      </p>
      <p>Trying {MODEL_DISPLAY_NAMES[model]}.</p>
    </div>
  );
}
