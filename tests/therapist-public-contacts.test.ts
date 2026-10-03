import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import type { CmsContentState, CmsTeamRecord } from "@/domain/cms/types";
import { siteConfig } from "@/content/site";
import {
  buildTherapistWhatsAppUrl,
  getContactPhones,
  normalizeTherapistPhone,
  projectPublicTherapistContacts,
} from "@/lib/therapist-contact";
import { prepareBookingSafetyFixture } from "./support/booking-safety-fixture";

registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === "server-only"
      ? { shortCircuit: true, url: pathToFileURL(`${process.cwd()}/tests/support/server-only-stub.mjs`).href }
      : nextResolve(specifier, context);
  },
});

function therapist(id: string, overrides: Partial<CmsTeamRecord> = {}): CmsTeamRecord {
  return {
    id,
    slug: id,
    name: id,
    fullName: id,
    publicRole: "Massage therapist",
    shortBio: "A therapist used only for isolated contact tests.",
    imageUrl: "",
    imageAlt: "",
    serviceIds: ["test-treatment"],
    publicProfile: true,
    operationalActive: true,
    archived: false,
    version: 1,
    updatedAt: "2026-10-04T00:00:00.000Z",
    ...overrides,
  };
}

test("therapist phones preserve display and normalize Irish and international call links", () => {
  for (const [display, e164, internationalDisplay] of [
    ["089 989 4916", "+353899894916", "+353 89 989 4916"],
    ["(01) 234-5678", "+35312345678", "+35312345678"],
    ["+353 (89) 989-4916", "+353899894916", "+353 89 989 4916"],
    ["00353 89 989 4916", "+353899894916", "+353 89 989 4916"],
    ["0871234567", "+353871234567", "+353 87 123 4567"],
    ["+44 20 7946 0958", "+442079460958", "+442079460958"],
    ["+1234567", "+1234567", "+1234567"],
    ["+123456789012345", "+123456789012345", "+123456789012345"],
  ]) {
    assert.deepEqual(normalizeTherapistPhone(` ${display} `), {
      display,
      internationalDisplay,
      e164,
      href: `tel:${e164}`,
    });
  }
  for (const value of ["", " ", "not supplied", "-------", "012345", "+123456", "+1234567890123456", "12345678", "+00353899894916", "089+9894916", "0899894916;ext=1", "tel:0899894916", "000000000", "0".repeat(31)]) {
    assert.equal(normalizeTherapistPhone(value), null, value);
  }
});

test("public projection places Siriranee first, filters unavailable profiles and excludes private email", () => {
  const team = [
    therapist("mon", { name: "Mon (Ubon)" }),
    therapist("siriranee", { name: "Siriranee" }),
    therapist("hidden", { publicProfile: false }),
    therapist("inactive", { operationalActive: false }),
    therapist("archived", { archived: true }),
    therapist("empty"),
    therapist("invalid"),
  ];
  const original = structuredClone(team);
  const contacts = team.map(({ id }) => ({
    id,
    contactPhone: id === "empty" ? "" : id === "invalid" ? "not a phone" : "0899894916",
    notificationEmail: `${id}@private.example.invalid`,
  }));
  const result = projectPublicTherapistContacts(team, contacts, siteConfig.contact.phone);
  assert.deepEqual(result.map(({ name }) => name), ["Siriranee", "Mon (Ubon)"]);
  assert.equal(result.length, 2, "Shared phone numbers must retain both therapist names");
  assert.deepEqual(Object.keys(result[0]).sort(), ["id", "name", "phone"]);
  assert.doesNotMatch(JSON.stringify(result), /notificationEmail|private\.example|fullName|serviceIds/);
  assert.deepEqual(team, original, "Projection must preserve the stored team order");
});

test("only the exact Siriranee slug can use the confirmed business number when blank", () => {
  const team = [
    therapist("owner-id", { slug: "siriranee", name: "Siriranee" }),
    therapist("same-name", { slug: "other", name: "Siriranee" }),
    therapist("other"),
  ];
  const projected = projectPublicTherapistContacts(team, [], siteConfig.contact.phone);
  assert.deepEqual(projected.map(({ id }) => id), ["owner-id"]);
  assert.equal(projected[0].phone.e164, siteConfig.contact.phone.e164);
  assert.deepEqual(projectPublicTherapistContacts(team, [], null), []);
  assert.deepEqual(projectPublicTherapistContacts(team, [{ id: "owner-id", contactPhone: "invalid" }], siteConfig.contact.phone), []);
});

test("all call surfaces use the therapist list and a single business fallback", () => {
  const contacts = projectPublicTherapistContacts(
    [therapist("mon", { name: "Mon (Ubon)" })],
    [{ id: "mon", contactPhone: "0899894916" }],
    siteConfig.contact.phone,
  );
  assert.equal(getContactPhones({ alternateName: "Siriranee", contact: { phone: null, therapists: contacts } }), contacts);
  assert.deepEqual(getContactPhones(siteConfig), [{ id: "business", name: siteConfig.alternateName, phone: siteConfig.contact.phone }]);
  assert.deepEqual(getContactPhones({ alternateName: "Siriranee", contact: { phone: null, therapists: [] } }), []);
  const whatsapp = new URL(buildTherapistWhatsAppUrl(contacts[0], "Siriranee Thai Massage"));
  assert.equal(whatsapp.origin + whatsapp.pathname, "https://wa.me/353899894916");
  assert.equal(whatsapp.searchParams.get("text"), "Hello Siriranee Thai Massage, I would like to contact Mon (Ubon) about booking a massage.");
});

test("contact read failures preserve successful contacts and the confirmed owner fallback", async () => {
  const [{ createDefaultContentState }, { readPublicTherapistContacts }] = await Promise.all([
    import("@/server/cms/default-content"),
    import("@/server/cms/public-therapist-contacts"),
  ]);
  const content: CmsContentState = {
    ...createDefaultContentState(),
    team: [therapist("siriranee"), therapist("mon"), therapist("failed"), therapist("hidden", { publicProfile: false })],
  };
  const readIds: string[] = [];
  const result = await readPublicTherapistContacts(content, async (id) => {
    readIds.push(id);
    if (id !== "mon") throw new Error("Temporary contact read failure");
    return { contactPhone: "0899894916", notificationEmail: "private@example.invalid" };
  });
  assert.deepEqual(readIds.sort(), ["failed", "mon", "siriranee"]);
  assert.deepEqual(result.map(({ id }) => id), ["siriranee", "mon"]);
  assert.equal(result.find(({ id }) => id === "siriranee")?.phone.internationalDisplay, "+353 89 948 4585");
  assert.doesNotMatch(JSON.stringify(result), /private@example/);
  const unconfirmed = await readPublicTherapistContacts({ ...content, site: { ...content.site, phoneConfirmed: false } }, async () => { throw new Error("Unavailable"); });
  assert.deepEqual(unconfirmed, []);
});

test("CMS phone validation rejects numbers without a usable country code", async () => {
  const { CmsValidationError, parseTherapistContactPhone } = await import("@/server/cms/content-validation");
  for (const value of ["899894916", "+000000000", "089 12", "tel:+353899894916"]) {
    assert.throws(() => parseTherapistContactPhone(value), CmsValidationError);
  }
  for (const value of ["089 989 4916", "+353 89 989 4916", "00353 89 989 4916"]) {
    assert.equal(parseTherapistContactPhone(value), value);
  }
  assert.equal(parseTherapistContactPhone(""), "");
  assert.equal(parseTherapistContactPhone(undefined, "089 989 4916"), "089 989 4916");
});

test("disabled and invalid CMS modes keep only the confirmed exact-owner fallback", async (context) => {
  const previousMode = process.env.CMS_MODE;
  context.after(() => {
    if (previousMode === undefined) delete process.env.CMS_MODE;
    else process.env.CMS_MODE = previousMode;
  });
  const [{ createDefaultContentState }, { getPublicTherapistContacts }] = await Promise.all([
    import("@/server/cms/default-content"),
    import("@/server/cms/public-therapist-contacts"),
  ]);
  const content = { ...createDefaultContentState(), team: [therapist("siriranee"), therapist("mon")] };
  for (const mode of ["disabled", "invalid-config"]) {
    process.env.CMS_MODE = mode;
    assert.deepEqual((await getPublicTherapistContacts(content)).map(({ id }) => id), ["siriranee"]);
    assert.deepEqual(await getPublicTherapistContacts({ ...content, team: [] }), []);
    assert.deepEqual(await getPublicTherapistContacts({ ...content, site: { ...content.site, phoneConfirmed: false } }), []);
  }
});

test("CMS contact add and edit immediately update the public site projection", async (context) => {
  const environmentKeys = ["CMS_MODE", "NODE_ENV", "CI", "VERCEL", "NETLIFY"] as const;
  const previousEnvironment = Object.fromEntries(environmentKeys.map((key) => [key, process.env[key]]));
  const cmsGlobal = globalThis as typeof globalThis & {
    __siriraneeCmsRepository?: unknown;
    __siriraneeCmsMockState?: unknown;
    __siriraneeCmsMockQueue?: Promise<void>;
  };
  context.after(() => {
    for (const key of environmentKeys) {
      if (previousEnvironment[key] === undefined) delete process.env[key];
      else Reflect.set(process.env, key, previousEnvironment[key]);
    }
    delete cmsGlobal.__siriraneeCmsRepository;
    delete cmsGlobal.__siriraneeCmsMockState;
    delete cmsGlobal.__siriraneeCmsMockQueue;
  });
  process.env.CMS_MODE = "mock";
  Reflect.set(process.env, "NODE_ENV", "test");
  delete process.env.CI;
  delete process.env.VERCEL;
  delete process.env.NETLIFY;
  delete cmsGlobal.__siriraneeCmsRepository;
  delete cmsGlobal.__siriraneeCmsMockState;
  delete cmsGlobal.__siriraneeCmsMockQueue;

  const [{ getCmsRepository }, { createCmsTeamMember, updateCmsTeamMember }, { getPublicSiteData }] = await Promise.all([
    import("@/server/cms/repositories"),
    import("@/server/cms/content-service"),
    import("@/server/cms/public-adapter"),
  ]);
  const repository = getCmsRepository();
  const fixture = await prepareBookingSafetyFixture(repository);
  const created = await createCmsTeamMember({
    ...therapist("new-contact", { slug: "new-contact", name: "New Contact Therapist", fullName: "New Contact Therapist", serviceIds: [fixture.service.id] }),
    notificationEmail: "new.therapist@example.invalid",
    contactPhone: "089 989 4916",
  }, { actor: fixture.actor });
  let site = await getPublicSiteData();
  assert.equal(site.contact.therapists.find(({ id }) => id === created.id)?.phone.href, "tel:+353899894916");
  assert.doesNotMatch(JSON.stringify(site), /new\.therapist@example|notificationEmail/);

  const edited = await updateCmsTeamMember(created.id, {
    name: created.name,
    fullName: created.fullName,
    publicRole: created.publicRole,
    contactPhone: "+353 87 123 4567",
    expectedContactVersion: created.contactVersion,
  }, created.version, { actor: fixture.actor });
  site = await getPublicSiteData();
  assert.equal(site.contact.therapists.find(({ id }) => id === edited.id)?.phone.href, "tel:+353871234567");
  assert.equal((await repository.getTherapistContact(edited.id))?.notificationEmail, "new.therapist@example.invalid");
  assert.equal((await repository.getPublishedContent())?.snapshot.team.find(({ id }) => id === edited.id)?.name, "New Contact Therapist");

  await updateCmsTeamMember(edited.id, {
    name: edited.name,
    fullName: edited.fullName,
    publicRole: edited.publicRole,
    contactPhone: "",
    expectedContactVersion: edited.contactVersion,
  }, edited.version, { actor: fixture.actor });
  assert.equal((await getPublicSiteData()).contact.therapists.some(({ id }) => id === edited.id), false);
});
