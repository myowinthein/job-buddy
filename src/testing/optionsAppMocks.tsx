import { vi } from 'vitest';

/*
 * Module mock factories shared by the options App unit and integration
 * tests. Use them as `vi.mock(path, async () => (await import(...)).name())`.
 */

export const storageMock = () => ({
  getProfile: vi.fn(),
  saveProfile: vi.fn().mockResolvedValue(undefined),
});

export const fillNavigationMock = async () => ({
  ...(await vi.importActual<typeof import('@/src/fill-log/navigation')>(
    '@/src/fill-log/navigation',
  )),
  lastFillDetailsSource: vi.fn().mockResolvedValue(null),
  takeFillDetailsRequest: vi.fn().mockResolvedValue(null),
});

export const sessionStorageMock = () => ({
  sessionGet: vi.fn().mockResolvedValue({}),
  sessionRemove: vi.fn().mockResolvedValue(undefined),
});

export const derivedFieldsMock = () => ({
  calculateDerivedFields: vi.fn(() => ({ fullName: 'Jane Doe' })),
});

export const driveSyncMock = () => ({
  claimDriveWarning: vi.fn().mockResolvedValue(true),
  syncProfileToDrive: vi.fn().mockResolvedValue({ success: true, errorCode: null }),
});

export const completionBannerMock = () => ({
  CompletionBanner: (props: {
    onNavigate: (id: string) => void;
    onFocusField: (id: string, field: string) => void;
  }) => (
    <div>
      <button onClick={() => props.onFocusField('address', 'City')}>focus-city</button>
    </div>
  ),
});

export const addressSectionMock = () => ({
  AddressSection: () => (
    <div>
      <span>address-section</span>
      <input id="field-city" aria-label="City" />
    </div>
  ),
});
