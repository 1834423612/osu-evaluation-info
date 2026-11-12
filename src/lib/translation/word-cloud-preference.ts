export const WORD_CLOUD_AUTO_KEY =
  "course-atlas:translation-word-cloud-auto:v1";

/** This is a separate opt-in: legacy text-auto preferences never enable clouds. */
export function readWordCloudAuto(storage: Pick<Storage, "getItem">) {
  try {
    return storage.getItem(WORD_CLOUD_AUTO_KEY) === "true";
  } catch {
    return false;
  }
}
