import { readdir, readFile, appendFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { parseDocument } from "htmlparser2";
import { inferRoles } from "../../src/lib/people/directory.ts";
import {
  createCatalogClient,
  loadCatalogEnvironment,
} from "../catalog/database.mjs";
import { foldName } from "./scan_directory.mjs";
import { verifiedOfficialProfileSource } from "../../src/lib/people/profile-source.ts";

export function officialProfileUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:") url.protocol = "https:";
    url.hash = "";
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      !url.port &&
      (url.hostname === "osu.edu" ||
        url.hostname.endsWith(".osu.edu") ||
        url.hostname === "ohio-state.edu" ||
        url.hostname.endsWith(".ohio-state.edu"))
      ? url
      : null;
  } catch {
    return null;
  }
}
export async function fetchOfficialProfile(value, fetcher = fetch) {
  let url = officialProfileUrl(value);
  if (!url) throw Error("Untrusted profile source");
  const deadline = Date.now() + 20000;
  for (let hop = 0; hop <= 3; hop++) {
    const response = await fetcher(url.href, {
      signal: AbortSignal.timeout(
        Math.max(1, Math.min(12000, deadline - Date.now())),
      ),
      redirect: "manual",
      headers: { "User-Agent": "osu-eval-identity-research/1.0" },
    });
    if (![301, 302, 303, 307, 308].includes(response.status))
      return { response, finalUrl: url.href };
    const location = response.headers.get("location");
    await response.body?.cancel();
    url = location ? officialProfileUrl(new URL(location, url).href) : null;
    if (!url || Date.now() >= deadline)
      throw Error("Profile redirect is outside the official source boundary");
  }
  throw Error("Profile redirect limit exceeded");
}
const nodeText = (node) =>
  node.type === "text"
    ? node.data
    : (node.children ?? []).map(nodeText).join(" ").replace(/\s+/g, " ").trim();
function nodes(root) {
  const result = [];
  const visit = (node) => {
    result.push(node);
    for (const child of node.children ?? []) visit(child);
  };
  visit(root);
  return result;
}
const emails = (text) => [
  ...new Set(
    [
      ...text.matchAll(
        /\b([a-z][a-z0-9_-]*\.\d+)@(?:buckeyemail\.)?osu\.edu\b/gi,
      ),
    ].map((m) => m[1].toLowerCase()),
  ),
];

/** A heading and its own contact block must identify the same account. */
export function profileEvidence(html, url, profiles) {
  if (!officialProfileUrl(url)) return [];
  const root = parseDocument(html),
    all = nodes(root);
  const pathUser = new URL(url).pathname
    .match(/\/(?:people\/)?([a-z][a-z0-9_-]*\.\d+)(?:\/|$)/i)?.[1]
    ?.toLowerCase();
  const contact = all.find((n) =>
    String(n.attribs?.class ?? "").includes(
      "user-profile__contact-information",
    ),
  );
  const contactEmails = contact ? emails(nodeText(contact)) : [];
  const result = [];
  for (const profile of profiles) {
    const first = profile.first_name
        .replace(/\([^)]*\)/g, "")
        .trim()
        .split(/\s+/)[0],
      last = profile.last_name;
    if (first.length < 2 || !last) continue;
    const heading = all.find(
      (n) =>
        /^h[1-4]$/.test(n.name ?? "") &&
        (() => {
          const text = nodeText(n)
            .replace(/^Dr\.?\s+/i, "")
            .replace(/,?\s*(?:Ph\.?D\.?|M\.?D\.?)\s*$/i, "");
          const parts = text.split(/\s+/);
          return (
            parts.length <= 8 &&
            foldName(parts[0]) === foldName(first) &&
            foldName(text).endsWith(foldName(last))
          );
        })(),
    );
    if (!heading) continue;
    let block = heading,
      scoped = [];
    for (let level = 0; block && level < 5; level++, block = block.parent) {
      const text = nodeText(block);
      if (text.length > 2500) break;
      const found = emails(text);
      if (found.length === 1) {
        scoped = found;
        break;
      }
    }
    if (!scoped.length && /^h1$/.test(heading.name)) {
      if (pathUser && emails(html).includes(pathUser)) scoped = [pathUser];
      else if (contactEmails.length === 1) scoped = contactEmails;
    }
    if (scoped.length !== 1) continue;
    const user = scoped[0];
    if (pathUser && user !== pathUser) continue;
    const name = nodeText(heading)
      .replace(/^Dr\.?\s+/i, "")
      .replace(/,?\s*(?:Ph\.?D\.?|M\.?D\.?)\s*$/i, "");
    const scopedRoot =
      heading.name === "h1" && contact
        ? contact
        : block && nodeText(block).length <= 2500
          ? block
          : heading;
    const titleContainer = nodes(scopedRoot).find((n) =>
      String(n.attribs?.class ?? "").includes("field--name-field-your-title"),
    );
    const titleNode =
      titleContainer &&
      nodes(titleContainer).find((n) =>
        String(n.attribs?.class ?? "")
          .split(/\s+/)
          .includes("field--item"),
      );
    const ownText = nodeText(scopedRoot);
    const title = titleNode ? nodeText(titleNode) : "";
    const pageTitle = nodeText(
      all.find((n) => n.name === "title") ?? { children: [] },
    );
    const organization =
      all.find(
        (n) => n.name === "meta" && n.attribs?.property === "og:site_name",
      )?.attribs?.content ??
      (pageTitle.includes("|") ? pageTitle.split("|").at(-1).trim() : null);
    const appointments =
      title && title.length <= 180 ? [{ title, organization }] : [];
    const middle = name
      .split(/\s+/)
      .slice(1, -last.trim().split(/\s+/).length)
      .join(" ");
    const campuses = [];
    for (const [code, label] of [
      ["COL", "Columbus"],
      ["MNS", "Mansfield"],
      ["LMA", "Lima"],
      ["MRN", "Marion"],
      ["NWK", "Newark"],
      ["WST", "Wooster"],
    ])
      if (
        new URL(url).hostname.split(".").includes(label.toLowerCase()) ||
        new RegExp("\\b" + label + "\\b", "i").test(ownText)
      )
        campuses.push(code);
    result.push({
      professor_id: String(profile.id),
      person: {
        user,
        name,
        first,
        middle,
        last,
        roles: inferRoles(appointments, [], false),
        appointments,
        campuses,
        source_url: url,
      },
    });
  }
  return result;
}

export async function researchProfiles({
  indexDirectory = "data/local/rmp/web-search-index",
  output = "data/local/rmp/identity-web-profile-scan.jsonl",
} = {}) {
  loadCatalogEnvironment();
  const client = createCatalogClient("rmp-official-web-research");
  await client.connect();
  output = resolve(output);
  await mkdir(dirname(output), { recursive: true });
  try {
    const profiles = new Map();
    let after = 0;
    for (;;) {
      const { rows } = await client.query(
        "SELECT legacy_id::text AS id,first_name,last_name FROM osu_rmp.professor WHERE legacy_id>$1 ORDER BY legacy_id LIMIT 500",
        [after],
      );
      if (!rows.length) break;
      for (const p of rows) profiles.set(Number(p.id), p);
      after = rows.at(-1).id;
    }
    const pages = [];
    for (const file of (await readdir(indexDirectory)).filter((f) =>
      f.endsWith(".json"),
    ))
      pages.push(
        ...JSON.parse(await readFile(resolve(indexDirectory, file), "utf8")),
      );
    const urls = new Map();
    for (const batch of pages)
      for (const source of batch.sources) {
        if (
          !officialProfileUrl(source.url) ||
          /\.(?:pdf|docx?|xlsx?|pptx?)(?:[?#]|$)/i.test(source.url)
        )
          continue;
        const related = batch.profiles
          .map((id) => profiles.get(id))
          .filter(Boolean);
        if (
          !/(?:people|faculty|staff|directory|profile|members|\/bio|\.\d+\/)/i.test(
            source.url,
          ) &&
          !related.some((p) =>
            foldName(source.title).includes(foldName(p.last_name)),
          )
        )
          continue;
        const normalized = officialProfileUrl(source.url).href;
        const entry = urls.get(normalized) ?? new Set();
        for (const id of batch.profiles) entry.add(id);
        urls.set(normalized, entry);
      }
    const done = new Map();
    try {
      for (const line of (await readFile(output, "utf8"))
        .split("\n")
        .filter(Boolean)) {
        const row = JSON.parse(line);
        if (row.status === "available" && row.parser_version === 2)
          done.set(row.url, new Set(row.profiles));
      }
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    const queue = [...urls].filter(
      ([url, ids]) =>
        !done.has(url) || [...ids].some((id) => !done.get(url).has(id)),
    );
    console.log(
      JSON.stringify({
        event: "web-start",
        searchedProfiles: new Set(pages.flatMap((p) => p.profiles)).size,
        uniqueOfficialPages: urls.size,
        queued: queue.length,
      }),
    );
    let index = 0,
      finished = 0,
      found = 0,
      nextStart = 0,
      cacheWrites = Promise.resolve();
    const writeCache = (sql, values) => {
      const request = cacheWrites.then(() => client.query(sql, values));
      cacheWrites = request.catch(() => {});
      return request;
    };
    async function worker() {
      for (;;) {
        const item = queue[index++];
        if (!item) return;
        const [url, ids] = item,
          slot = Math.max(Date.now(), nextStart);
        nextStart = slot + 250;
        await delay(Math.max(0, slot - Date.now()));
        let status = "unavailable",
          records = [];
        try {
          const { response, finalUrl } = await fetchOfficialProfile(url);
          if (
            response.ok &&
            /text\/html/i.test(response.headers.get("content-type") ?? "")
          ) {
            const reader = response.body.getReader();
            let bytes = 0,
              parts = [];
            try {
              for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.length;
                if (bytes > 2_000_000) throw Error("Page exceeds limit");
                parts.push(value);
              }
            } finally {
              await reader.cancel().catch(() => {});
            }
            const html = Buffer.concat(parts).toString("utf8");
            records = profileEvidence(
              html,
              finalUrl,
              [...ids].map((id) => profiles.get(id)).filter(Boolean),
            );
            status = "available";
          } else {
            await response.body?.cancel();
            status =
              response.status === 404
                ? "missing"
                : response.status >= 300 && response.status < 400
                  ? "redirect"
                  : "unavailable";
          }
        } catch {
          status = "unavailable";
        }
        const checkedAt = new Date().toISOString();
        for (const { person } of records)
          if (
            person.appointments.length &&
            verifiedOfficialProfileSource(person.source_url, person.user)
          )
            await writeCache(
              `INSERT INTO osu_directory.person_cache(name_dot_number,display_name,roles,appointments,source,source_url,verified_at,cache_version)
          VALUES($1,$2,$3::jsonb,$4::jsonb,'department-profile',$5,$6,3) ON CONFLICT(name_dot_number) DO UPDATE SET
          display_name=excluded.display_name,roles=excluded.roles,appointments=excluded.appointments,source=excluded.source,
          source_url=excluded.source_url,verified_at=excluded.verified_at,cache_version=3,updated_at=now()
          WHERE jsonb_array_length(osu_directory.person_cache.appointments)=0`,
              [
                person.user,
                person.name,
                JSON.stringify(person.roles),
                JSON.stringify(person.appointments),
                person.source_url,
                checkedAt,
              ],
            );
        await appendFile(
          output,
          JSON.stringify({
            url,
            profiles: [...ids],
            status,
            records,
            parser_version: 2,
            checked_at: checkedAt,
          }) + "\n",
        );
        finished++;
        found += records.length;
        if (finished % 100 === 0 || finished === queue.length)
          console.log(
            JSON.stringify({
              event: "web-progress",
              finished,
              total: queue.length,
              identityEvidence: found,
            }),
          );
      }
    }
    await Promise.all(Array.from({ length: 6 }, worker));
    return { fetched: finished, identityEvidence: found };
  } finally {
    await client.end();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  console.log(JSON.stringify(await researchProfiles()));
