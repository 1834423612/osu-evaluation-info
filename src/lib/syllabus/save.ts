export type SyllabusSaveHandle = {
  createWritable: () => Promise<{
    write: (blob: Blob) => Promise<void>;
    close: () => Promise<void>;
    abort: () => Promise<void>;
  }>;
};
export type SyllabusSaveTarget =
  | { kind: "cancelled" }
  | { kind: "file"; handle: SyllabusSaveHandle }
  | { kind: "download"; pickerBlocked: boolean };

/** Invoked during the click, before lazy PDF imports consume the user activation. */
export async function chooseSyllabusSaveTarget(
  fileName: string,
  scope: {
    showSaveFilePicker?: (options: object) => Promise<SyllabusSaveHandle>;
  },
): Promise<SyllabusSaveTarget> {
  if (!scope.showSaveFilePicker)
    return { kind: "download", pickerBlocked: false };
  try {
    return {
      kind: "file",
      handle: await scope.showSaveFilePicker({
        suggestedName: fileName,
        types: [
          { description: "PDF", accept: { "application/pdf": [".pdf"] } },
        ],
      }),
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : "";
    if (name === "AbortError") return { kind: "cancelled" };
    if (name === "NotAllowedError" || name === "SecurityError")
      return { kind: "download", pickerBlocked: true };
    throw error;
  }
}

export async function writeSyllabusFile(
  handle: SyllabusSaveHandle,
  blob: Blob,
) {
  const writable = await handle.createWritable();
  try {
    await writable.write(blob);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => {});
    throw error;
  }
}
