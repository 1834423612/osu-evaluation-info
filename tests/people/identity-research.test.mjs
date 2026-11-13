import assert from "node:assert/strict";
import { it } from "node:test";
import {
  profileEvidence,
  officialProfileUrl,
  fetchOfficialProfile,
} from "../../scripts/rmp/research_web_profiles.mjs";
import { projectPerson } from "../../scripts/rmp/scan_directory.mjs";
import { verifiedOfficialProfileSource } from "../../src/lib/people/profile-source.ts";

const profile = { id: "1", first_name: "Alex", last_name: "Example" };
const html = `<h1>Alex Taylor Example</h1><section class="user-profile__contact-information">
  <div class="field--name-field-your-title"><div class="field--item">Senior Lecturer</div></div>
  <a href="mailto:example.1@osu.edu">Email</a><p>Mansfield</p></section>`;
it("upgrades old official links and follows only bounded official redirects", async () => {
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    return calls.length === 1
      ? new Response(null, {
          status: 301,
          headers: { location: "https://math.osu.edu/people/example.1" },
        })
      : new Response(html, { headers: { "content-type": "text/html" } });
  };
  const result = await fetchOfficialProfile(
    "http://www.math.ohio-state.edu/old",
    fetcher,
  );
  assert.equal(calls[0], "https://www.math.ohio-state.edu/old");
  assert.equal(result.finalUrl, "https://math.osu.edu/people/example.1");
  await assert.rejects(
    fetchOfficialProfile(
      "https://math.osu.edu/old",
      async () =>
        new Response(null, {
          status: 302,
          headers: { location: "https://evil.test/person" },
        }),
    ),
    /outside/,
  );
});
it("binds an official profile heading, account contact and scoped appointment", () => {
  const [record] = profileEvidence(
    html,
    "https://math.osu.edu/people/example.1",
    [profile],
  );
  assert.equal(record.person.user, "example.1");
  assert.equal(record.person.middle, "Taylor");
  assert.equal(record.person.appointments[0].title, "Senior Lecturer");
  assert.deepEqual(record.person.campuses, ["MNS"]);
});
it("rejects wrong-account contact, untrusted host and unrelated heading", () => {
  assert.deepEqual(
    profileEvidence(html, "https://math.osu.edu/people/wrong.1", [profile]),
    [],
  );
  assert.deepEqual(
    profileEvidence(html, "https://math.osu.edu.evil.test/people/example.1", [
      profile,
    ]),
    [],
  );
  assert.deepEqual(
    profileEvidence(
      html.replace("Alex Taylor Example", "Other Person"),
      "https://math.osu.edu/people/example.1",
      [profile],
    ),
    [],
  );
  assert.equal(
    officialProfileUrl("https://user:pass@math.osu.edu/people/example.1"),
    null,
  );
});
it("does not take a second faculty member's title or a site footer as appointment/campus evidence", () => {
  const page = `<h1>Alex Example</h1><section class="user-profile__contact-information"><a href="mailto:example.1@osu.edu">Email</a></section>
    <aside><h2>Another Person</h2><div class="field--name-field-your-title"><div class="field--item">Professor</div></div></aside><footer>Columbus</footer>`;
  const [record] = profileEvidence(
    page,
    "https://math.osu.edu/people/example.1",
    [profile],
  );
  assert.deepEqual(record.person.appointments, []);
  assert.deepEqual(record.person.campuses, []);
});
it("keeps two contacts ambiguous on a name-slug profile", () => {
  assert.deepEqual(
    profileEvidence(
      html.replace(
        "</section>",
        '<a href="mailto:other.2@osu.edu">Other</a></section>',
      ),
      "https://mansfield.osu.edu/people/alex-example",
      [profile],
    ),
    [],
  );
});
it("supports source-verified departmental cache provenance without accepting another account URL", () => {
  assert.equal(
    verifiedOfficialProfileSource(
      "https://physics.osu.edu/people/example.1",
      "example.1",
    ),
    true,
  );
  assert.equal(
    verifiedOfficialProfileSource(
      "https://mansfield.osu.edu/people/alex-example",
      "example.1",
    ),
    true,
  );
  assert.equal(
    verifiedOfficialProfileSource(
      "https://math.osu.edu/people/wrong.1",
      "example.1",
    ),
    false,
  );
  assert.equal(
    verifiedOfficialProfileSource(
      "https://evil.test/people/example.1",
      "example.1",
    ),
    false,
  );
});
it("projects only needed public identity facts and campus, excluding contact details", () => {
  const person = projectPerson({
    id: "example.1",
    attributes: {
      first_name: "Alex",
      last_name: "Example",
      address: { city: "Mansfield", street1: "private" },
      phone: "private",
      email: "private",
      appointments: [],
    },
  });
  assert.deepEqual(person.campuses, ["MNS"]);
  assert.equal(person.phone, undefined);
  assert.equal(person.email, undefined);
  assert.equal(person.address, undefined);
});
