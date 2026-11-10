import test from "node:test";
import assert from "node:assert/strict";
import {
  chooseSyllabusSaveTarget,
  writeSyllabusFile,
} from "../../src/lib/syllabus/save.ts";

test("save picker cancellation never becomes an automatic download", async () => {
  assert.deepEqual(
    await chooseSyllabusSaveTarget("a.pdf", {
      showSaveFilePicker: async () => {
        throw new DOMException("cancel", "AbortError");
      },
    }),
    { kind: "cancelled" },
  );
  assert.deepEqual(await chooseSyllabusSaveTarget("a.pdf", {}), {
    kind: "download",
    pickerBlocked: false,
  });
  assert.deepEqual(
    await chooseSyllabusSaveTarget("a.pdf", {
      showSaveFilePicker: async () => {
        throw new DOMException("blocked", "SecurityError");
      },
    }),
    { kind: "download", pickerBlocked: true },
  );
  await assert.rejects(
    chooseSyllabusSaveTarget("a.pdf", {
      showSaveFilePicker: async () => {
        throw new Error("unknown failure");
      },
    }),
  );
});
test("file save waits for close and aborts failed writes", async () => {
  const calls = [];
  const writable = {
    write: async () => {
      calls.push("write");
    },
    close: async () => {
      calls.push("close");
    },
    abort: async () => {
      calls.push("abort");
    },
  };
  await writeSyllabusFile(
    { createWritable: async () => writable },
    new Blob(["pdf"]),
  );
  assert.deepEqual(calls, ["write", "close"]);
  calls.length = 0;
  await assert.rejects(
    writeSyllabusFile(
      {
        createWritable: async () => ({
          ...writable,
          write: async () => {
            throw new Error("disk full");
          },
        }),
      },
      new Blob(),
    ),
  );
  assert.deepEqual(calls, ["abort"]);
});
