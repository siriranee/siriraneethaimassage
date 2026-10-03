import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

async function source(path: string) {
  return readFile(resolve(process.cwd(), path), "utf8");
}

test("the shared CMS form reports accessible field errors while a value is corrected", async () => {
  const [form, styles] = await Promise.all([
    source("src/components/cms/CmsValidatedForm.tsx"),
    source("src/components/cms/CmsValidatedForm.module.css"),
  ]);

  assert.match(form, /onBlurCapture=\{handleBlurCapture\}/);
  assert.match(form, /onInputCapture=\{handleInputCapture\}/);
  assert.match(form, /onInvalidCapture=\{handleInvalidCapture\}/);
  assert.match(form, /onSubmitCapture=\{handleSubmitCapture\}/);
  assert.match(form, /for \(const element of Array\.from\(form\.elements\)\)/);
  assert.match(form, /form\.reportValidity\(\)/);
  assert.match(form, /safeCmsFieldErrors/);
  assert.match(form, /aria-invalid/);
  assert.match(form, /aria-errormessage/);
  assert.match(form, /role="alert"/);
  assert.match(form, /focusIssue\(pendingIssue\)/);
  assert.match(form, /dataset\.cmsMatchField/);
  assert.match(form, /dataset\.cmsAfterField/);
  assert.match(form, /dataset\.cmsNotBeforeField/);
  assert.match(form, /dataset\.cmsMaxLines/);
  assert.match(form, /const exact = controls\.find/);
  assert.match(form, /findControl\(form, field, true\)/);
  assert.match(form, /pendingServerFocusRef/);
  assert.match(form, /dataset\.cmsRevalidateWhen/);
  assert.match(styles, /label\[data-cms-validation-error\]/);
  assert.doesNotMatch(form, /styles\.summary|summaryRef|Please correct these|Please correct this field/);
  assert.doesNotMatch(styles, /\.summary|position: sticky/);
  assert.match(form, /id=\{`\$\{instanceId\}-validation-\$\{index\}`\}/);
  assert.match(form, /issue\.unmapped \? styles\.formError : styles\.accessibleError/);
  assert.match(form, /unmapped: !control/);
  assert.match(form, /formError\.focus\(\)/);
  assert.match(styles, /\.accessibleError/);
});

test("every CMS editor form uses inline validation or the therapist-specific equivalent", async () => {
  const sharedForms = [
    "AdminBookingForm.tsx",
    "BookingEditorForm.tsx",
    "BookingSettingsForm.tsx",
    "ClosureForm.tsx",
    "CmsAdminUserForm.tsx",
    "CmsLoginForm.tsx",
    "OpeningHoursForm.tsx",
    "PromotionEditorForm.tsx",
    "ServiceEditorForm.tsx",
    "SiteBusinessForm.tsx",
    "VoucherEditorForm.tsx",
  ];

  for (const name of sharedForms) {
    const form = await source(`src/components/cms/${name}`);
    assert.match(form, /CmsValidatedForm/, `${name} must use the shared validator`);
    assert.doesNotMatch(form, /<form\b/, `${name} must not bypass the shared validator`);
  }

  const team = await source("src/components/cms/TeamEditorForm.tsx");
  assert.match(team, /collectClientFieldErrors\(form\)/);
  assert.match(team, /onBlur=\{handleFieldBlur\}/);
  assert.match(team, /onChange=\{handleFieldChange\}/);
  assert.match(team, /aria-invalid/);
  assert.match(team, /focusErrorSummary/);

  const bookingFilters = await source("src/app/cms/(protected)/bookings/page.tsx");
  assert.match(bookingFilters, /CmsValidatedForm/);
  assert.doesNotMatch(bookingFilters, /<form\b/);
  assert.match(bookingFilters, /data-cms-not-before-field="from"/);
});

test("cross-field CMS rules identify the field that needs correction", async () => {
  const [adminBooking, hours, closure, promotion, users, site, contentValidation, bookingValidation] =
    await Promise.all([
      source("src/components/cms/AdminBookingForm.tsx"),
      source("src/components/cms/OpeningHoursForm.tsx"),
      source("src/components/cms/ClosureForm.tsx"),
      source("src/components/cms/PromotionEditorForm.tsx"),
      source("src/components/cms/CmsAdminUserForm.tsx"),
      source("src/components/cms/SiteBusinessForm.tsx"),
      source("src/server/cms/content-validation.ts"),
      source("src/server/cms/booking-service.ts"),
    ]);

  assert.match(hours, /data-cms-after-field=\{`weeklyHours\.\$\{index\}\.opens`\}/);
  assert.match(hours, /data-cms-after-when-checked/);
  assert.match(closure, /data-cms-after-field="startsAtLocal"/);
  assert.match(promotion, /data-cms-not-before-field="startsOn"/);
  assert.match(users, /data-cms-match-field=\{name === "confirmPassword" \? "newPassword"/);
  assert.match(site, /data-cms-max-lines="20"/);
  assert.match(site, /required=\{phoneConfirmed\}/);
  assert.match(site, /data-cms-revalidate-when="phoneConfirmed"/);
  assert.match(adminBooking, /data-cms-field-aliases="durationMinutes"/);
  assert.match(contentValidation, /\[`weeklyHours\.\$\{index\}\.closes`\]/);
  assert.match(contentValidation, /endsOn: "End date must be on or after start date\."/);
  assert.match(bookingValidation, /changeReason: "Choose a reason for changing the appointment\."/);
});

test("forms with deferred media validate before uploading", async () => {
  for (const name of ["ServiceEditorForm.tsx", "VoucherEditorForm.tsx"]) {
    const form = await source(`src/components/cms/${name}`);
    const validationIndex = form.indexOf("form.reportValidity()");
    const uploadIndex = form.indexOf("await uploadCmsMediaSequentially");
    assert.ok(validationIndex >= 0, `${name} must validate before save`);
    assert.ok(uploadIndex > validationIndex, `${name} must validate before uploading media`);
  }
});
