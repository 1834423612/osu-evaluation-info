export type SyncFeature = "favorites" | "planning" | "calendars";
export type SyncFeatures = Record<SyncFeature, boolean>;
export const defaultSyncFeatures: SyncFeatures = {
  favorites: true,
  planning: true,
  calendars: true,
};
export function syncFeatures(state: {
  features?: Partial<SyncFeatures>;
}): SyncFeatures {
  return { ...defaultSyncFeatures, ...state.features };
}
