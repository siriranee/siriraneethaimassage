import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getTeamSaveErrorMessage,
  TEAM_SAVE_AMBIGUOUS_MESSAGE,
  TEAM_SAVE_FAILED_MESSAGE,
  TeamSaveError,
} from "../src/components/cms/team-save-feedback";

test("therapist feedback preserves approved API guidance through throw/catch", () => {
  for (const message of [
    "Reassign future booking SRN-20260919-6981B0 before deactivating, archiving or removing this therapist's treatment eligibility.",
    "This therapist contact was changed by another request.",
    "A therapist already uses this URL slug.",
  ]) {
    try {
      throw new TeamSaveError(`  ${message}  `);
    } catch (error) {
      assert.equal(getTeamSaveErrorMessage(error, "definite-failure"), message);
    }
  }
});

test("therapist feedback normalizes malformed approved responses safely", () => {
  for (const message of [undefined, null, "", "   ", 123, {}, new Error("internal")]) {
    assert.equal(
      getTeamSaveErrorMessage(new TeamSaveError(message), "definite-failure"),
      TEAM_SAVE_FAILED_MESSAGE,
    );
  }
});

test("therapist feedback does not expose arbitrary exception details", () => {
  for (const error of [
    new Error("Internal database connection and credential details"),
    new TypeError("Internal fetch error"),
    { name: "TeamSaveError", message: "Unapproved internal details" },
    "Unapproved internal details",
    null,
  ]) {
    for (const state of ["not-started", "definite-failure"] as const) {
      assert.equal(getTeamSaveErrorMessage(error, state), TEAM_SAVE_FAILED_MESSAGE);
    }
  }
});

test("uncertain or already committed therapist saves always require verification", () => {
  for (const state of ["ambiguous", "succeeded"] as const) {
    for (const error of [new Error("Network disconnected"), new TeamSaveError("Retry now"), null]) {
      assert.equal(getTeamSaveErrorMessage(error, state), TEAM_SAVE_AMBIGUOUS_MESSAGE);
    }
  }
});

test("therapist form uses approved errors and preserves the no-cleanup ambiguity branch", async () => {
  const source = await readFile("src/components/cms/TeamEditorForm.tsx", "utf8");
  assert.match(source, /throw new TeamSaveError\(result\.error\)/);
  assert.match(source, /requestState === "ambiguous" \|\| requestState === "succeeded"[\s\S]*?getTeamSaveErrorMessage\(error, requestState\)[\s\S]*?return;[\s\S]*?const retryAssets/);
  assert.match(source, /getTeamSaveErrorMessage\(error, requestState\)\}\$\{cleanupWarning\}/);
  assert.doesNotMatch(source, /safeMessage\(error\)/);
});

test("therapist form gives complete accessible validation feedback without losing the draft", async () => {
  const [source, styles] = await Promise.all([
    readFile("src/components/cms/TeamEditorForm.tsx", "utf8"),
    readFile("src/components/cms/TeamEditorForm.module.css", "utf8"),
  ]);

  assert.match(
    source,
    /name === "serviceIds" \|\| name\.startsWith\("serviceIds\."\)[\s\S]*?"serviceIds"/,
  );
  assert.match(source, /const clientErrors = collectClientFieldErrors\(form\)/);
  assert.match(source, /onBlur=\{handleFieldBlur\}/);
  assert.match(source, /onChange=\{handleFieldChange\}/);
  assert.match(source, /touchedFieldsRef\.current\.has\(field\) \|\| fieldErrors\[field\]/);
  assert.match(source, /setFieldErrors\(\(current\) =>[\s\S]*?delete next\[field\]/);

  assert.match(
    source,
    /aria-invalid=\{Boolean\(fieldError\("fullName"\)\)\}[\s\S]*?name="fullName"/,
  );
  assert.match(source, /id="fullName-error">\{fieldError\("fullName"\)\}/);
  assert.match(source, /Object\.entries\(fieldErrors\)\.map/);
  assert.match(source, /ref=\{errorSummaryRef\}/);
  assert.match(source, /tabIndex=\{-1\}/);
  assert.match(source, /onClick=\{\(\) => focusField\(field\)\}/);
  assert.match(source, /requestAnimationFrame/);
  assert.match(source, /noValidate/);

  assert.doesNotMatch(source, /form\.reset\(/);
  assert.match(styles, /\.serviceFieldset\[aria-invalid="true"\]/);
  assert.match(styles, /input\[aria-invalid="true"\]/);
  assert.match(styles, /\.errorSummary:focus/);
});
