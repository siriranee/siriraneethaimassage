export const CMS_USERNAME_MIN_LENGTH = 4;
export const CMS_USERNAME_MAX_LENGTH = 32;
export const CMS_PASSWORD_MIN_LENGTH = 12;
export const CMS_PASSWORD_MAX_LENGTH = 256;
export const CMS_DISPLAY_NAME_MIN_LENGTH = 2;
export const CMS_DISPLAY_NAME_MAX_LENGTH = 80;

export const CMS_USERNAME_HTML_PATTERN = "[A-Za-z0-9]{4,32}";
export const CMS_PASSWORD_HTML_PATTERN = "[A-Za-z0-9]{12,256}";

const cmsUsernamePattern = /^[a-z0-9]{4,32}$/;
const cmsPasswordPattern = /^[A-Za-z0-9]{12,256}$/;

export function normalizeCmsUsername(value: string) {
  return value.trim().toLowerCase();
}

export function validateCmsUsername(value: string) {
  const username = normalizeCmsUsername(value);
  const errors: string[] = [];

  if (
    username.length < CMS_USERNAME_MIN_LENGTH ||
    username.length > CMS_USERNAME_MAX_LENGTH
  ) {
    errors.push(
      `Use ${CMS_USERNAME_MIN_LENGTH} to ${CMS_USERNAME_MAX_LENGTH} characters.`,
    );
  }
  if (username && !/^[a-z0-9]+$/.test(username)) {
    errors.push("Use only letters and numbers.");
  }

  return errors;
}

export function isValidCmsUsername(value: string) {
  const username = normalizeCmsUsername(value);
  return cmsUsernamePattern.test(username);
}

export function validateCmsDisplayName(value: string) {
  const displayName = value.trim();
  const errors: string[] = [];

  if (
    displayName.length < CMS_DISPLAY_NAME_MIN_LENGTH ||
    displayName.length > CMS_DISPLAY_NAME_MAX_LENGTH
  ) {
    errors.push(
      `Use ${CMS_DISPLAY_NAME_MIN_LENGTH} to ${CMS_DISPLAY_NAME_MAX_LENGTH} characters.`,
    );
  }

  return errors;
}

export function validateCmsPasswordValue(password: string) {
  const errors: string[] = [];

  if (password.length < CMS_PASSWORD_MIN_LENGTH) {
    errors.push(`Use at least ${CMS_PASSWORD_MIN_LENGTH} characters.`);
  }
  if (password.length > CMS_PASSWORD_MAX_LENGTH) {
    errors.push(`Use at most ${CMS_PASSWORD_MAX_LENGTH} characters.`);
  }
  if (password && !/^[A-Za-z0-9]+$/.test(password)) {
    errors.push("Use only letters and numbers.");
  }

  return errors;
}

export function isValidCmsPassword(value: string) {
  return cmsPasswordPattern.test(value);
}
