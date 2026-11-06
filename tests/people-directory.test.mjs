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
  directoryNameQueries,
  parseDepartmentProfile,
  DIRECTORY_SOURCE_BUDGET_MS,
} from "../src/lib/people/directory.ts";
import {
  compactDirectoryRole,
  distinctDirectoryAppointments,
  instructorDirectoryQuery,
  selectDirectoryCandidate,
  visibleDirectoryRoles,
} from "../src/lib/people/identity.ts";

test("compact badges group academic rank and contract variants without changing appointments", () => {
  const cases = [
    ["Professor (9M)", "professor", "Professor", "教授"],
    ["Associate Professor", "professor", "Professor", "教授"],
    [
      "Assistant Professor - Clinical (9M) · Assistant Professor of Teaching Practice",
      "professor",
      "Professor",
      "教授",
    ],
    ["Senior Lecturer (9M)", "lecturer", "Lecturer", "讲师"],
    ["Graduate Teaching Associate", "teaching-assistant", "TA", "助教"],
    ["Undergraduate Teaching Assistant", "teaching-assistant", "TA", "助教"],
    ["Graduate Research Associate", "assistant", "Assistant", "助理"],
    ["Research Assistant", "assistant", "Assistant", "助理"],
    ["Student Assistant", "assistant", "Assistant", "助理"],
    ["Instructor", "faculty", "Instructor", "教师"],
    ["Assistant Director", "employee", "Staff", "职员"],
  ];
  for (const [title, category, en, zh] of cases) {
    const person = {
      name: "Badge Fixture",
      roles: inferRoles([{ title, organization: "Department" }], [], false),
      appointments: [{ title, organization: "Department" }],
    };
    const before = structuredClone(person);
    assert.deepEqual(compactDirectoryRole(person), {
      category,
      label: { en, zh },
    });
    assert.deepEqual(person, before);
  }
});

test("compact badges choose one supported role and leave absent evidence unknown", () => {
  assert.deepEqual(
    compactDirectoryRole({
      name: "Badge Fixture",
      roles: ["student", "teaching-assistant", "employee"],
      appointments: [],
    }),
    { category: "teaching-assistant", label: { en: "TA", zh: "助教" } },
  );
  assert.deepEqual(
    compactDirectoryRole({
      name: "Student",
      roles: ["student"],
      appointments: [],
    }),
    { category: "student", label: { en: "Student", zh: "学生" } },
  );
  assert.equal(
    compactDirectoryRole({ name: "Unknown", roles: [], appointments: [] }),
    null,
  );
});

test("appointment highlights collapse duplicate contract and college labels while keeping distinct jobs", () => {
  const preferred = {
    title: "Lecturer (9M)",
    organization: "Arts and Sciences - Mathematics",
  };
  const research = { title: "Research Associate", organization: "Mathematics" };
  assert.deepEqual(
    distinctDirectoryAppointments([
      preferred,
      { title: "Lecturer", organization: "Mathematics" },
      research,
    ]),
    [preferred, research],
  );
});

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

test("assistant identities omit the redundant student badge", () => {
  assert.deepEqual(
    visibleDirectoryRoles(["teaching-assistant", "student", "employee"]),
    ["teaching-assistant"],
  );
  assert.deepEqual(
    visibleDirectoryRoles(["student-assistant", "student", "employee"]),
    ["student-assistant"],
  );
  assert.deepEqual(visibleDirectoryRoles(["student"]), ["student"]);
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
  assert.equal(selectDirectoryCandidate([candidate], instructor), null);
  assert.equal(
    selectDirectoryCandidate([candidate], { name: "Casey Morgan Example" }),
    candidate,
  );
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
    const result = await lookupDirectory("identityfixture.987654321");
    assert.equal(result.status, "available");
    assert.equal(result.source, "osu-search");
    assert.equal(result.cache, "source");
    assert.deepEqual(result.results, []);
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

test("bounded name queries skip middle names and include joined compound families", () => {
  assert.deepEqual(directoryNameQueries("Julian Alonso Mejia Cordero"), [
    "Julian Cordero",
    "Julian MejiaCordero",
    "Julian Mejia Cordero",
  ]);
  assert.deepEqual(directoryNameQueries("Neil John DeBoer"), ["Neil DeBoer"]);
  assert.deepEqual(directoryNameQueries("Tena I. Katsaounis"), [
    "Tena Katsaounis",
  ]);
});

test("the entire upstream fallback chain shares one source deadline", async () => {
  const originalNow = Date.now;
  const originalFetch = globalThis.fetch;
  const originalSocket = globalThis.WebSocket;
  let now = originalNow();
  let legacyRequests = 0;
  Date.now = () => now;
  globalThis.WebSocket = class {
    constructor() {
      throw new Error("unavailable fixture");
    }
  };
  globalThis.fetch = async () => {
    legacyRequests++;
    now += DIRECTORY_SOURCE_BUDGET_MS + 1;
    return Response.json({ data: { people: [] } });
  };
  try {
    const result = await lookupDirectory("Deadline Middle Compound Fixture");
    assert.equal(result.status, "available");
    assert.equal(legacyRequests, 1);
    assert.ok(DIRECTORY_SOURCE_BUDGET_MS < 30_000);
  } finally {
    Date.now = originalNow;
    globalThis.fetch = originalFetch;
    globalThis.WebSocket = originalSocket;
  }
});

test("department profiles accept only the exact official account and scoped job title", () => {
  const profile = `<link rel="canonical" href="https://math.osu.edu/people/fixture.1">
    <nav>Professor directory</nav><section class="user-profile__contact-information">
      <div class="field field--name-field-your-title"><div class="field--label">Job Title</div>
      <div class="field--item">Lecturer</div></div>
      <a href="mailto:fixture.1@osu.edu">Email</a></section>`;
  assert.deepEqual(parseDepartmentProfile(profile, "fixture.1", "MATH"), [
    { title: "Lecturer", organization: "Department of Mathematics" },
  ]);
  assert.equal(
    parseDepartmentProfile(
      profile.replace("mailto:fixture.1@osu.edu", "mailto:other.1@osu.edu"),
      "fixture.1",
      "MATH",
    ),
    null,
  );
  assert.equal(
    parseDepartmentProfile(
      profile.replace("field--name-field-your-title", "unrelated-title"),
      "fixture.1",
      "MATH",
    ),
    null,
  );
  assert.equal(
    parseDepartmentProfile(
      profile.replace(
        "https://math.osu.edu/people/fixture.1",
        "https://outside.invalid/people/fixture.1",
      ),
      "fixture.1",
      "MATH",
    ),
    null,
  );
  assert.equal(parseDepartmentProfile(profile, "fixture.1", "CSE"), null);
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
