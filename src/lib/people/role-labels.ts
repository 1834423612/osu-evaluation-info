import type { DirectoryCandidate } from "./directory";

export type CompactDirectoryRoleCategory =
  | "professor"
  | "associate-professor"
  | "assistant-professor"
  | "emeritus"
  | "lecturer"
  | "senior-lecturer"
  | "teaching-assistant"
  | "researcher"
  | "research-associate"
  | "research-assistant"
  | "research-engineer"
  | "postdoctoral"
  | "scientist"
  | "engineer"
  | "assistant"
  | "director"
  | "chair"
  | "dean"
  | "manager"
  | "specialist"
  | "technologist"
  | "faculty"
  | "student"
  | "employee"
  | "appointment";

export type CompactDirectoryRole = {
  category: CompactDirectoryRoleCategory;
  label: { en: string; zh: string };
};

const TITLE_SEPARATOR =
  /\s*[·;+]\s*|(?:\s+(?:and|&)\s+|[,/]\s*)(?=(?:(?:senior|sr\.?|assistant|associate|visiting|adjunct|clinical|research|graduate|undergraduate|teaching|office|administrative|executive|program|lab|laboratory|student)\s+)*(?:professor|lecturer|researcher|scientist|engineer|director|chair|dean|instructor|assistant|associate|technologist|specialist|manager)\b)/i;

function role(
  category: CompactDirectoryRoleCategory,
  en: string,
  zh: string,
): CompactDirectoryRole {
  return { category, label: { en, zh } };
}

function titleRole(raw: string): CompactDirectoryRole | null {
  const title = raw
    .replace(/\((?:\d+\s*M|SEM)\)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\.$/, "");
  if (!title || /^chair titles$/i.test(title)) return null;
  const senior = /\b(?:senior|sr\.?)\b/i.test(title);
  if (/\bprofessor\b/i.test(title)) {
    const base = /\bassociate\s+professor\b/i.test(title)
      ? role("associate-professor", "Associate Professor", "副教授")
      : /\bassistant\s+professor\b/i.test(title)
        ? role("assistant-professor", "Assistant Professor", "助理教授")
        : role("professor", "Professor", "教授");
    if (/\bemerit(?:us|a)\b/i.test(title))
      return role(
        "emeritus",
        `${base.label.en} Emeritus`,
        `荣休${base.label.zh}`,
      );
    const modifiers: [RegExp, string, string][] = [
      [/\bvisiting\b/i, "Visiting", "访问"],
      [/\badjunct\b/i, "Adjunct", "兼职"],
      [/\bclinical\b/i, "Clinical", "临床"],
      [
        /\b(?:professional practice|teaching practice|of practice)\b/i,
        "Practice",
        "实践",
      ],
      [/\bresearch\b/i, "Research", "研究"],
    ];
    const matchedModifiers = modifiers.filter(([pattern]) =>
      pattern.test(title),
    );
    return matchedModifiers.length
      ? role(
          base.category,
          `${matchedModifiers.map((modifier) => modifier[1]).join(" ")} ${base.label.en}`,
          `${matchedModifiers.map((modifier) => modifier[2]).join("")}${base.label.zh}`,
        )
      : base;
  }
  if (/\bemerit(?:us|a)\b/i.test(title))
    return role("emeritus", "Emeritus", "荣休");
  if (/\blecturer\b/i.test(title))
    return senior
      ? role("senior-lecturer", "Senior Lecturer", "高级讲师")
      : role("lecturer", "Lecturer", "讲师");
  if (/\bteaching\s+(?:assistant|associate)\b/i.test(title)) {
    if (/\bundergraduate\b/i.test(title))
      return role("teaching-assistant", "Undergraduate TA", "本科生助教");
    if (/\bgraduate\b/i.test(title))
      return role("teaching-assistant", "Graduate TA", "研究生助教");
    return role("teaching-assistant", "TA", "助教");
  }
  if (/\bpost[ -]?doc(?:toral)?\b/i.test(title))
    return role("postdoctoral", "Postdoctoral researcher", "博士后研究员");
  if (
    /\b(?:graduate|undergraduate)\s+research\s+(?:associate|assistant)\b/i.test(
      title,
    )
  )
    return /\bundergraduate\b/i.test(title)
      ? role(
          "research-assistant",
          "Undergraduate Research Assistant",
          "本科生研究助理",
        )
      : role(
          "research-assistant",
          "Graduate Research Associate",
          "研究生研究助理",
        );
  if (/\bresearch\s+assistant\b/i.test(title))
    return role("research-assistant", "Research Assistant", "研究助理");
  if (/\bresearch\s+assoc(?:iate)?\b/i.test(title))
    return role(
      "research-associate",
      senior ? "Senior Research Associate" : "Research Associate",
      senior ? "高级研究专员" : "研究专员",
    );
  if (/\bresearcher\b/i.test(title))
    return role(
      "researcher",
      senior ? "Senior Researcher" : "Researcher",
      senior ? "高级研究员" : "研究员",
    );
  if (/\bscientist\b/i.test(title))
    return role(
      "scientist",
      senior ? "Senior Scientist" : "Scientist",
      senior ? "高级科研人员" : "科研人员",
    );
  if (/\bengineer\b/i.test(title))
    return /\bresearch\b/i.test(title)
      ? role("research-engineer", "Research Engineer", "研究工程师")
      : role("engineer", "Engineer", "工程师");
  for (const [pattern, en, zh] of [
    [
      /\b(?:assistant to (?:the )?dean)\b/i,
      "Assistant to the Dean",
      "院长助理",
    ],
    [
      /\b(?:assistant to (?:the )?director)\b/i,
      "Assistant to the Director",
      "主任助理",
    ],
    [/\b(?:office assistant)\b/i, "Office Assistant", "办公室助理"],
    [
      /\b(?:administrative assistant)\b/i,
      "Administrative Assistant",
      "行政助理",
    ],
    [/\b(?:executive assistant)\b/i, "Executive Assistant", "执行助理"],
    [/\b(?:lab|laboratory) assistant\b/i, "Laboratory Assistant", "实验室助理"],
    [/\bprogram assistant\b/i, "Program Assistant", "项目助理"],
    [/\bstudent assistant\b/i, "Student Assistant", "学生助理"],
    [/\bundergraduate assistant\b/i, "Undergraduate Assistant", "本科生助理"],
    [/\bgraduate assistant\b/i, "Graduate Assistant", "研究生助理"],
  ] as const)
    if (pattern.test(title)) return role("assistant", en, zh);
  for (const [pattern, category, en, zh] of [
    [/\bdirector\b/i, "director", "Director", "主任"],
    [/\bchair\b/i, "chair", "Chair", "系主任"],
    [/\bdean\b/i, "dean", "Dean", "院长"],
  ] as const)
    if (pattern.test(title)) {
      if (/\bassistant\b/i.test(title))
        return role(category, `Assistant ${en}`, `助理${zh}`);
      if (/\bassociate\b/i.test(title))
        return role(category, `Associate ${en}`, `副${zh}`);
      return role(category, en, zh);
    }
  if (/\bmanager\b/i.test(title)) return role("manager", "Manager", "主管");
  if (/\btechnologist\b/i.test(title))
    return role(
      "technologist",
      senior ? "Senior Technologist" : "Technologist",
      senior ? "高级技术专家" : "技术专家",
    );
  if (/\bspecialist\b/i.test(title))
    return role("specialist", "Specialist", "专员");
  if (/\binstructor\b/i.test(title))
    return role("faculty", "Instructor", "教师");
  // An unfamiliar explicit job title is more accurate than guessing Professor or Staff.
  return role("appointment", title, title);
}

/** Derive all distinct positions from the saved official titles, including old caches. */
export function compactDirectoryRoles(
  person: DirectoryCandidate,
): CompactDirectoryRole[] {
  const found = person.appointments.flatMap(({ title }) =>
    title
      .split(TITLE_SEPARATOR)
      .map(titleRole)
      .filter((value): value is CompactDirectoryRole => value !== null),
  );
  if (!found.length) {
    if (person.roles.includes("professor"))
      found.push(role("professor", "Professor", "教授"));
    if (person.roles.includes("lecturer"))
      found.push(role("lecturer", "Lecturer", "讲师"));
    if (person.roles.includes("teaching-assistant"))
      found.push(role("teaching-assistant", "TA", "助教"));
    if (person.roles.includes("student-assistant"))
      found.push(role("assistant", "Student Assistant", "学生助理"));
    if (person.roles.includes("faculty") && !found.length)
      found.push(role("faculty", "Instructor", "教师"));
    if (person.roles.includes("student") && !found.length)
      found.push(role("student", "Student", "学生"));
    if (person.roles.includes("employee") && !found.length)
      found.push(role("employee", "Staff", "职员"));
  }
  const generalLabels = new Set([
    "Professor",
    "Associate Professor",
    "Assistant Professor",
    "Lecturer",
    "Researcher",
    "Research Associate",
  ]);
  const family = (value: CompactDirectoryRole) =>
    value.category === "senior-lecturer" ? "lecturer" : value.category;
  const unique = [
    ...new Map(
      found.map((value) => [value.label.en.toLowerCase(), value]),
    ).values(),
  ];
  return unique.filter(
    (value) =>
      !generalLabels.has(value.label.en) ||
      !unique.some(
        (other) =>
          other !== value &&
          family(other) === family(value) &&
          !generalLabels.has(other.label.en),
      ),
  );
}

export function compactDirectoryRole(
  person: DirectoryCandidate,
): CompactDirectoryRole | null {
  return compactDirectoryRoles(person)[0] ?? null;
}

export function directoryRoleTone(category?: CompactDirectoryRoleCategory) {
  if (category === "emeritus") return "emeritus";
  if (
    [
      "professor",
      "associate-professor",
      "assistant-professor",
      "lecturer",
      "senior-lecturer",
      "faculty",
    ].includes(category ?? "")
  )
    return "faculty";
  if (
    [
      "researcher",
      "research-associate",
      "research-engineer",
      "postdoctoral",
      "scientist",
    ].includes(category ?? "")
  )
    return "research";
  if (
    ["teaching-assistant", "research-assistant", "assistant"].includes(
      category ?? "",
    )
  )
    return "assistant";
  return "staff";
}
