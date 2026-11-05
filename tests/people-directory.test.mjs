import assert from "node:assert/strict";
import test from "node:test";
import {
  inferRoles,
  lookupDirectory,
  normalizeLegacyRecord,
  normalizeNewRecord,
  searchSocketIo,
  validDirectoryFallbackName,
  validDirectorySearchTerm,
} from "../src/lib/people/directory.ts";
import {
  instructorDirectoryQuery,
  selectDirectoryCandidate,
} from "../src/lib/people/identity.ts";

test("directory role inference requires explicit teaching appointment evidence", () => {
  assert.deepEqual(
    inferRoles(
      [{ title: "Graduate Teaching Associate", organization: "Mathematics" }],
      [],
      true,
    ),
    ["teaching-assistant", "student", "employee"],
  );

  assert.deepEqual(
    inferRoles(
      [{ title: "Graduate Research Associate", organization: "Research" }],
      [],
      false,
    ),
    ["employee"],
  );
});

test("directory roles can overlap when the official record supports them", () => {
  assert.deepEqual(
    inferRoles(
      [{ title: "Assistant Professor", organization: "Engineering" }],
      ["Student"],
      false,
    ),
    ["professor", "student", "employee"],
  );
  assert.deepEqual(inferRoles([], [], false), []);
  assert.deepEqual(
    inferRoles(
      [{ title: "Office Assistant", organization: "Faculty Support Office" }],
      [],
      false,
    ),
    ["employee"],
  );
});

test("new OSU Search records normalize only public role evidence", () => {
  assert.deepEqual(
    normalizeNewRecord({
      attributes: {
        first_name: "Casey",
        middle_name: null,
        last_name: "Example",
        email: "private@example.invalid",
        affiliations: [],
        majors: [],
        appointments: [
          {
            job_title: "Graduate Teaching Associate",
            working_title: null,
            organization: "Department of Mathematics",
            org_code: "MATH",
            vp_college_name: null,
          },
        ],
      },
    }),
    {
      name: "Casey Example",
      roles: ["teaching-assistant", "employee"],
      appointments: [
        {
          title: "Graduate Teaching Associate",
          organization: "Department of Mathematics",
        },
      ],
    },
  );
});

test("legacy Content API records normalize to the same minimal shape", () => {
  assert.deepEqual(
    normalizeLegacyRecord({
      displayName: "Taylor Sample",
      username: "sensitive-id",
      email: "private@example.invalid",
      affiliations: [],
      majors: [],
      appointments: [
        {
          jobTitle: "Assistant Professor",
          workingTitle: "Professor",
          organization: "Department of Physics",
          orgCode: "PHYS",
          vpCollegeName: null,
        },
      ],
    }),
    {
      name: "Taylor Sample",
      roles: ["professor", "employee"],
      appointments: [
        {
          title: "Assistant Professor · Professor",
          organization: "Department of Physics",
        },
      ],
    },
  );
});

test("professors and lecturers have distinct labels while TA evidence remains explicit", () => {
  assert.deepEqual(
    inferRoles([{ title: "Senior Lecturer", organization: null }], [], false),
    ["lecturer", "employee"],
  );
  assert.deepEqual(
    inferRoles(
      [{ title: "Undergraduate Teaching Assistant", organization: null }],
      [],
      true,
    ),
    ["teaching-assistant", "student", "employee"],
  );
  assert.deepEqual(
    inferRoles([{ title: "Student Assistant", organization: null }], [], true),
    ["student-assistant", "student", "employee"],
  );
});

test("automatic instructor badges accept only an unambiguous identity or name match", () => {
  const candidate = {
    name: "Casey Morgan Example",
    roles: ["lecturer"],
    appointments: [],
  };
  const instructor = { name: "Casey Example", email: null };
  assert.equal(selectDirectoryCandidate([candidate], instructor), candidate);
  assert.equal(
    selectDirectoryCandidate(
      [candidate, { ...candidate, name: "Casey N Example" }],
      instructor,
    ),
    null,
  );
  assert.equal(
    selectDirectoryCandidate(
      [{ ...candidate, name: "Casey Exampleson" }],
      instructor,
    ),
    null,
  );
  assert.equal(
    selectDirectoryCandidate([candidate, { ...candidate }], {
      name: candidate.name,
    }),
    null,
  );
  assert.equal(
    instructorDirectoryQuery({
      name: "Casey Example",
      email: "example.123@osu.edu",
    }),
    "example.123",
  );
  assert.equal(
    instructorDirectoryQuery({
      name: "Casey Example",
      email: "outside@example.invalid",
    }),
    "Casey Example",
  );
});

test("OSU account lookups exclude similar accounts returned by the search provider", async () => {
  const original = globalThis.WebSocket;
  class IdentitySocket {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: '0{"sid":"fixture"}' }));
    }
    send(message) {
      if (message === "40")
        queueMicrotask(() => this.onmessage?.({ data: "40" }));
      if (message.startsWith("42"))
        queueMicrotask(() =>
          this.onmessage?.({
            data: `42${JSON.stringify([
              "results",
              {
                meta: {
                  provider: "people",
                  query: "identityfixture.987654321",
                },
                data: [
                  {
                    id: "identityfixture.987654322",
                    attributes: {
                      first_name: "Different",
                      last_name: "Person",
                      appointments: [{ job_title: "Professor" }],
                    },
                  },
                ],
              },
            ])}`,
          }),
        );
    }
    close() {
      this.readyState = 3;
    }
  }
  globalThis.WebSocket = IdentitySocket;
  try {
    assert.deepEqual(await lookupDirectory("identityfixture.987654321"), {
      status: "available",
      source: "osu-search",
      results: [],
    });
  } finally {
    globalThis.WebSocket = original;
  }
});

test("name lookup falls back to the legacy endpoint when the primary transport fails", async () => {
  const originalSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("fixture unavailable");
    }
  };
  globalThis.fetch = async (url) => {
    assert.equal(url.origin, "https://content.osu.edu");
    assert.equal(url.searchParams.get("firstname"), "Directory");
    assert.equal(url.searchParams.get("lastname"), "Fixture");
    return Response.json({
      data: {
        people: [
          {
            displayName: "Directory Legacy Fixture",
            appointments: [
              {
                jobTitle: "Graduate Teaching Associate",
                organization: "Mathematics",
              },
            ],
          },
        ],
      },
    });
  };
  try {
    const result = await lookupDirectory("Directory Legacy Fixture");
    assert.equal(result.status, "available");
    assert.equal(result.source, "content-api-v2");
    assert.deepEqual(result.results[0].roles, [
      "teaching-assistant",
      "employee",
    ]);
  } finally {
    globalThis.WebSocket = originalSocket;
    globalThis.fetch = originalFetch;
  }
});

test("account fallback checks exact legacy username or OSU email and drops same-name accounts", async () => {
  const originalSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("fixture unavailable");
    }
  };
  globalThis.fetch = async (url) => {
    assert.equal(url.searchParams.get("firstname"), "Verified");
    assert.equal(url.searchParams.get("lastname"), "Fixture");
    return Response.json({
      data: {
        people: [
          {
            displayName: "Verified Account Fixture",
            username: "ACCOUNTFALLBACK.987654321",
            appointments: [{ jobTitle: "Professor" }],
          },
          {
            displayName: "Verified Account Fixture",
            username: "accountfallback.987654322",
            appointments: [{ jobTitle: "Graduate Teaching Associate" }],
          },
          {
            displayName: "Verified Account Fixture",
            email: "accountfallback.987654321@outside.invalid",
            appointments: [{ jobTitle: "Lecturer" }],
          },
          {
            displayName: "Verified Account Fixture",
            appointments: [{ jobTitle: "Instructor" }],
          },
        ],
      },
    });
  };
  try {
    const result = await lookupDirectory(
      "accountfallback.987654321",
      "Verified Account Fixture",
    );
    assert.equal(result.source, "content-api-v2");
    assert.deepEqual(result.results, [
      {
        name: "Verified Account Fixture",
        roles: ["professor", "employee"],
        appointments: [{ title: "Professor", organization: null }],
      },
    ]);
    assert.equal(JSON.stringify(result).includes("987654321"), false);
  } finally {
    globalThis.WebSocket = originalSocket;
    globalThis.fetch = originalFetch;
  }
});

test("account lookup caches distinguish an absent or changed fallback name", async () => {
  const originalSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("fixture unavailable");
    }
  };
  globalThis.fetch = async (url) => {
    calls++;
    const matched = url.searchParams.get("firstname") === "Verified";
    return Response.json({
      data: {
        people: matched
          ? [
              {
                displayName: "Verified Cache Fixture",
                email: "CACHEFALLBACK.987654321@OSU.EDU",
                appointments: [{ jobTitle: "Lecturer" }],
              },
            ]
          : [],
      },
    });
  };
  try {
    assert.equal(
      (await lookupDirectory("cachefallback.987654321")).status,
      "unavailable",
    );
    assert.equal(calls, 0);
    const matched = await lookupDirectory(
      "cachefallback.987654321",
      "Verified Cache Fixture",
    );
    assert.equal(matched.source, "content-api-v2");
    assert.deepEqual(matched.results[0].roles, ["lecturer", "employee"]);
    await lookupDirectory("cachefallback.987654321", "Verified Cache Fixture");
    assert.equal(calls, 1);
    assert.deepEqual(
      (await lookupDirectory("cachefallback.987654321", "Other Cache Fixture"))
        .results,
      [],
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.WebSocket = originalSocket;
    globalThis.fetch = originalFetch;
  }
});

test("empty primary account results still try the verified legacy account fallback", async () => {
  const originalSocket = globalThis.WebSocket;
  const originalFetch = globalThis.fetch;
  globalThis.WebSocket = class {
    static OPEN = 1;
    readyState = 1;
    constructor() {
      queueMicrotask(() => this.onmessage?.({ data: '0{"sid":"fixture"}' }));
    }
    send(message) {
      if (message === "40")
        queueMicrotask(() => this.onmessage?.({ data: "40" }));
      if (message.startsWith("42")) {
        const [, { term }] = JSON.parse(message.slice(2));
        queueMicrotask(() =>
          this.onmessage?.({
            data: `42${JSON.stringify(["results", { meta: { provider: "people", query: term }, data: [] }])}`,
          }),
        );
      }
    }
    close() {
      this.readyState = 3;
    }
  };
  globalThis.fetch = async () =>
    Response.json({
      data: {
        people: [
          {
            displayName: "Empty Primary Fixture",
            username: "emptyfallback.987654321",
            appointments: [{ jobTitle: "Professor" }],
          },
        ],
      },
    });
  try {
    const result = await lookupDirectory(
      "emptyfallback.987654321",
      "Empty Primary Fixture",
    );
    assert.equal(result.source, "content-api-v2");
    assert.equal(result.results.length, 1);
  } finally {
    globalThis.WebSocket = originalSocket;
    globalThis.fetch = originalFetch;
  }
});

test("directory lookup accepts names and OSU name-dot-number terms only", () => {
  assert.equal(validDirectorySearchTerm("Jane Smith"), true);
  assert.equal(validDirectorySearchTerm("smith.1234"), true);
  assert.equal(validDirectorySearchTerm("<script>alert(1)</script>"), false);
  assert.equal(validDirectorySearchTerm("x"), false);
  assert.equal(validDirectorySearchTerm("x".repeat(121)), false);
  assert.equal(validDirectoryFallbackName("Rajiv Ramnath"), true);
  assert.equal(validDirectoryFallbackName("ramnath.6"), false);
  assert.equal(validDirectoryFallbackName("<script> not a name"), false);
});

test("Socket.IO search waits for the people provider and sends only the query", async () => {
  const original = globalThis.WebSocket;
  const sent = [];
  class TestWebSocket {
    static OPEN = 1;
    readyState = 1;
    onopen = null;
    onmessage = null;
    onerror = null;
    onclose = null;

    constructor(url) {
      assert.equal(
        url,
        "wss://search-api.intcomm.osu.edu/socket.io/?EIO=3&transport=websocket",
      );
      queueMicrotask(() => {
        this.onmessage?.({ data: '0{"sid":"synthetic-session"}' });
      });
    }

    send(packet) {
      sent.push(packet);
      if (packet === "40") {
        queueMicrotask(() => this.onmessage?.({ data: "40" }));
      } else if (packet.startsWith("42")) {
        queueMicrotask(() => {
          this.onmessage?.({
            data: '42["results",{"meta":{"provider":"majors","query":"Casey Example"},"data":[]}]',
          });
          this.onmessage?.({
            data: '42["results",{"meta":{"provider":"people","query":"different"},"data":[]}]',
          });
          this.onmessage?.({
            data: '42["results",{"meta":{"provider":"people","query":"Casey Example"},"data":[{"attributes":{"first_name":"Casey","last_name":"Example"}}]}]',
          });
        });
      }
    }

    close() {
      this.readyState = 3;
    }
  }
  globalThis.WebSocket = TestWebSocket;
  try {
    assert.deepEqual(await searchSocketIo("Casey Example"), [
      { attributes: { first_name: "Casey", last_name: "Example" } },
    ]);
    assert.deepEqual(sent, [
      "40",
      '42["search",{"term":"Casey Example","providers":["people"]}]',
    ]);
  } finally {
    globalThis.WebSocket = original;
  }
});
