"use client";

import {
  Eye,
  EyeOff,
  KeyRound,
  LogOut,
  Save,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useState,
  type FormEvent,
} from "react";

import {
  CMS_DISPLAY_NAME_MAX_LENGTH,
  CMS_DISPLAY_NAME_MIN_LENGTH,
  CMS_PASSWORD_HTML_PATTERN,
  CMS_PASSWORD_MAX_LENGTH,
  CMS_PASSWORD_MIN_LENGTH,
  CMS_USERNAME_HTML_PATTERN,
  CMS_USERNAME_MAX_LENGTH,
  CMS_USERNAME_MIN_LENGTH,
} from "@/domain/cms/account-policy";
import { getCmsRoleDescription } from "@/domain/cms/permissions";
import type { CmsRole, CmsUserSummary } from "@/domain/cms/types";

import formStyles from "./CmsEditorForm.module.css";
import styles from "./CmsAdminUserForm.module.css";

type ApiResult = {
  readonly error?: string;
  readonly fields?: Readonly<Record<string, string>>;
  readonly user?: CmsUserSummary;
  readonly sessionsRevoked?: boolean;
  readonly signedOut?: boolean;
};

type Feedback = {
  readonly tone: "success" | "error";
  readonly text: string;
};

async function readApiResult(response: Response): Promise<ApiResult> {
  try {
    return (await response.json()) as ApiResult;
  } catch {
    return { error: "The server returned an unexpected response." };
  }
}

function PasswordField({
  autoComplete,
  error,
  hint,
  id,
  label,
  name,
  newPassword = false,
  required = true,
}: Readonly<{
  autoComplete: "current-password" | "new-password";
  error?: string;
  hint: string;
  id: string;
  label: string;
  name: string;
  newPassword?: boolean;
  required?: boolean;
}>) {
  const [visible, setVisible] = useState(false);
  const describedBy = error ? `${id}-hint ${id}-error` : `${id}-hint`;

  return (
    <label className={formStyles.field} htmlFor={id}>
      {label}
      <span className={styles.passwordControl}>
        <input
          aria-describedby={describedBy}
          aria-invalid={Boolean(error)}
          autoCapitalize="none"
          autoComplete={autoComplete}
          id={id}
          maxLength={CMS_PASSWORD_MAX_LENGTH}
          minLength={newPassword ? CMS_PASSWORD_MIN_LENGTH : undefined}
          name={name}
          pattern={newPassword ? CMS_PASSWORD_HTML_PATTERN : undefined}
          required={required}
          spellCheck={false}
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </button>
      </span>
      <small id={`${id}-hint`}>{hint}</small>
      {error ? (
        <small className={styles.fieldError} id={`${id}-error`}>
          {error}
        </small>
      ) : null}
    </label>
  );
}

function FormFeedback({ feedback }: Readonly<{ feedback: Feedback | null }>) {
  if (!feedback) return <span>All sensitive changes are audited.</span>;
  return (
    <span
      className={
        feedback.tone === "error" ? formStyles.error : formStyles.success
      }
      role={feedback.tone === "error" ? "alert" : "status"}
    >
      {feedback.text}
    </span>
  );
}

function currentPasswordHint(mockMode: boolean) {
  return mockMode
    ? "Not required for the fictional local mock administrator."
    : "Required to confirm this administrator action.";
}

function redirectIfSignedOut(
  result: ApiResult,
  router: ReturnType<typeof useRouter>,
) {
  if (!result.signedOut) return false;
  router.replace("/cms/login");
  router.refresh();
  return true;
}

export function CmsAdminUserCreateForm({
  mockMode,
}: Readonly<{ mockMode: boolean }>) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Readonly<Record<string, string>>>({});

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;

    setBusy(true);
    setFeedback(null);
    setFieldErrors({});
    const data = new FormData(form);

    try {
      const response = await fetch("/api/cms/users", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: data.get("displayName"),
          username: data.get("username"),
          role: data.get("role"),
          newPassword: data.get("newPassword"),
          confirmPassword: data.get("confirmPassword"),
          currentPassword: data.get("currentPassword"),
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.user) {
        if (response.status === 401) {
          router.replace("/cms/login");
          router.refresh();
          return;
        }
        setFieldErrors(result.fields ?? {});
        setFeedback({
          tone: "error",
          text: result.error ?? "The account could not be created.",
        });
        return;
      }

      setFeedback({ tone: "success", text: "CMS account created securely." });
      router.push(`/cms/admin/${result.user.id}/edit`);
      router.refresh();
    } catch {
      setFeedback({
        tone: "error",
        text: "The account could not be created. Check your connection and try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form aria-busy={busy} className={styles.form} onSubmit={createAccount}>
      <fieldset className={formStyles.formFields} disabled={busy}>
        <section className={formStyles.section}>
          <header className={formStyles.sectionHeader}>
            <h2>Account details</h2>
            <p>Give each person their own account. Shared usernames weaken the audit trail.</p>
          </header>
          <div className={formStyles.grid}>
            <label className={formStyles.field} htmlFor="create-display-name">
              Display name
              <input
                aria-describedby="create-display-name-hint"
                aria-invalid={Boolean(fieldErrors.displayName)}
                id="create-display-name"
                maxLength={CMS_DISPLAY_NAME_MAX_LENGTH}
                minLength={CMS_DISPLAY_NAME_MIN_LENGTH}
                name="displayName"
                required
              />
              <small id="create-display-name-hint">
                {CMS_DISPLAY_NAME_MIN_LENGTH}–{CMS_DISPLAY_NAME_MAX_LENGTH} characters. This name appears in the audit log.
              </small>
              {fieldErrors.displayName ? <small className={styles.fieldError}>{fieldErrors.displayName}</small> : null}
            </label>

            <label className={formStyles.field} htmlFor="create-username">
              Username
              <input
                aria-describedby="create-username-hint"
                aria-invalid={Boolean(fieldErrors.username)}
                autoCapitalize="none"
                autoComplete="off"
                id="create-username"
                maxLength={CMS_USERNAME_MAX_LENGTH}
                minLength={CMS_USERNAME_MIN_LENGTH}
                name="username"
                pattern={CMS_USERNAME_HTML_PATTERN}
                required
                spellCheck={false}
              />
              <small id="create-username-hint">
                {CMS_USERNAME_MIN_LENGTH}–{CMS_USERNAME_MAX_LENGTH} letters and numbers. It cannot be changed later.
              </small>
              {fieldErrors.username ? <small className={styles.fieldError}>{fieldErrors.username}</small> : null}
            </label>

            <label className={formStyles.fullField} htmlFor="create-role">
              Role
              <select
                aria-describedby="create-role-hint"
                aria-invalid={Boolean(fieldErrors.role)}
                defaultValue="staff"
                id="create-role"
                name="role"
              >
                <option value="administrator">Administrator</option>
                <option value="staff">Staff</option>
              </select>
              <small id="create-role-hint">
                Administrators control users, publishing and settings. Staff manage bookings and calendar availability.
              </small>
              {fieldErrors.role ? <small className={styles.fieldError}>{fieldErrors.role}</small> : null}
            </label>
          </div>
        </section>

        <section className={formStyles.section}>
          <header className={formStyles.sectionHeader}>
            <h2>Initial password</h2>
            <p>Send the password privately. The CMS stores only its salted hash.</p>
          </header>
          <div className={formStyles.grid}>
            <PasswordField
              autoComplete="new-password"
              error={fieldErrors.newPassword}
              hint={`${CMS_PASSWORD_MIN_LENGTH}–${CMS_PASSWORD_MAX_LENGTH} letters and numbers.`}
              id="create-password"
              label="Password"
              name="newPassword"
              newPassword
            />
            <PasswordField
              autoComplete="new-password"
              error={fieldErrors.confirmPassword}
              hint="Enter the same password again."
              id="create-password-confirmation"
              label="Confirm password"
              name="confirmPassword"
              newPassword
            />
          </div>
        </section>

        <section className={formStyles.section}>
          <header className={formStyles.sectionHeader}>
            <h2>Confirm administrator action</h2>
            <p>Your password confirms that this account was intentionally created.</p>
          </header>
          <PasswordField
            autoComplete="current-password"
            error={fieldErrors.currentPassword}
            hint={currentPasswordHint(mockMode)}
            id="create-current-password"
            label="Your current password"
            name="currentPassword"
            required={!mockMode}
          />
        </section>
      </fieldset>

      <div className={styles.actionBar}>
        <span aria-live="polite"><FormFeedback feedback={feedback} /></span>
        <button className={styles.primaryButton} disabled={busy} type="submit">
          <UserPlus aria-hidden="true" /> {busy ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}

export function CmsAdminUserEditor({
  current,
  mockMode,
  user: initialUser,
}: Readonly<{
  current: boolean;
  mockMode: boolean;
  user: CmsUserSummary;
}>) {
  const router = useRouter();
  const [user, setUser] = useState(initialUser);
  const [displayName, setDisplayName] = useState(initialUser.displayName);
  const [role, setRole] = useState<CmsRole>(initialUser.role);
  const [active, setActive] = useState(initialUser.active);
  const [confirmAccessChange, setConfirmAccessChange] = useState(false);
  const [busySection, setBusySection] = useState<"account" | "password" | "sessions" | null>(null);
  const [accountFeedback, setAccountFeedback] = useState<Feedback | null>(null);
  const [passwordFeedback, setPasswordFeedback] = useState<Feedback | null>(null);
  const [sessionFeedback, setSessionFeedback] = useState<Feedback | null>(null);
  const [accountErrors, setAccountErrors] = useState<Readonly<Record<string, string>>>({});
  const [passwordErrors, setPasswordErrors] = useState<Readonly<Record<string, string>>>({});
  const [sessionErrors, setSessionErrors] = useState<Readonly<Record<string, string>>>({});
  const busy = busySection !== null;
  const accessChanged = role !== user.role || active !== user.active;
  const needsAccessConfirmation =
    (user.active && !active) ||
    (user.role === "administrator" && role !== "administrator");

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;
    setBusySection("account");
    setAccountFeedback(null);
    setAccountErrors({});
    const data = new FormData(form);

    try {
      const response = await fetch(`/api/cms/users/${user.id}`, {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: user.version,
          displayName,
          role,
          active,
          confirmAccessChange,
          currentPassword: data.get("currentPassword"),
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.user) {
        if (response.status === 401) {
          router.replace("/cms/login");
          router.refresh();
          return;
        }
        setAccountErrors(result.fields ?? {});
        setAccountFeedback({ tone: "error", text: result.error ?? "The account could not be saved." });
        return;
      }

      setUser(result.user);
      setDisplayName(result.user.displayName);
      setRole(result.user.role);
      setActive(result.user.active);
      setConfirmAccessChange(false);
      const passwordInput = form.elements.namedItem("currentPassword");
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = "";
      setAccountFeedback({
        tone: "success",
        text: result.sessionsRevoked
          ? "Account saved. Existing sessions were revoked."
          : "Account details saved.",
      });
      router.refresh();
    } catch {
      setAccountFeedback({ tone: "error", text: "The account could not be saved. Check your connection and try again." });
    } finally {
      setBusySection(null);
    }
  }

  async function resetPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;
    setBusySection("password");
    setPasswordFeedback(null);
    setPasswordErrors({});
    const data = new FormData(form);

    try {
      const response = await fetch(`/api/cms/users/${user.id}/password`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: user.version,
          newPassword: data.get("newPassword"),
          confirmPassword: data.get("confirmPassword"),
          currentPassword: data.get("currentPassword"),
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.user) {
        if (response.status === 401) {
          router.replace("/cms/login");
          router.refresh();
          return;
        }
        setPasswordErrors(result.fields ?? {});
        setPasswordFeedback({ tone: "error", text: result.error ?? "The password could not be reset." });
        return;
      }
      if (redirectIfSignedOut(result, router)) return;

      setUser(result.user);
      form.reset();
      setPasswordFeedback({ tone: "success", text: "Password reset. Existing sessions were revoked." });
      router.refresh();
    } catch {
      setPasswordFeedback({ tone: "error", text: "The password could not be reset. Check your connection and try again." });
    } finally {
      setBusySection(null);
    }
  }

  async function revokeSessions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (busy || !form.reportValidity()) return;
    setBusySection("sessions");
    setSessionFeedback(null);
    setSessionErrors({});
    const data = new FormData(form);

    try {
      const response = await fetch(`/api/cms/users/${user.id}/revoke-sessions`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: user.version,
          confirmRevoke: data.get("confirmRevoke") === "on",
          currentPassword: data.get("currentPassword"),
        }),
      });
      const result = await readApiResult(response);
      if (!response.ok || !result.user) {
        if (response.status === 401) {
          router.replace("/cms/login");
          router.refresh();
          return;
        }
        setSessionErrors(result.fields ?? {});
        setSessionFeedback({ tone: "error", text: result.error ?? "Sessions could not be revoked." });
        return;
      }
      if (redirectIfSignedOut(result, router)) return;

      setUser(result.user);
      form.reset();
      setSessionFeedback({ tone: "success", text: "All existing sessions were revoked." });
      router.refresh();
    } catch {
      setSessionFeedback({ tone: "error", text: "Sessions could not be revoked. Check your connection and try again." });
    } finally {
      setBusySection(null);
    }
  }

  return (
    <div className={styles.editorStack}>
      <form aria-busy={busySection === "account"} className={styles.form} onSubmit={saveAccount}>
        <fieldset className={formStyles.formFields} disabled={busy}>
          <section className={formStyles.section}>
            <header className={formStyles.sectionHeader}>
              <h2>Account access</h2>
              <p>Username is permanent. Role or status changes immediately revoke this account’s sessions.</p>
            </header>
            <div className={formStyles.grid}>
              <label className={formStyles.field} htmlFor="edit-display-name">
                Display name
                <input
                  aria-describedby="edit-display-name-hint"
                  aria-invalid={Boolean(accountErrors.displayName)}
                  id="edit-display-name"
                  maxLength={CMS_DISPLAY_NAME_MAX_LENGTH}
                  minLength={CMS_DISPLAY_NAME_MIN_LENGTH}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  value={displayName}
                />
                <small id="edit-display-name-hint">{CMS_DISPLAY_NAME_MIN_LENGTH}–{CMS_DISPLAY_NAME_MAX_LENGTH} characters.</small>
                {accountErrors.displayName ? <small className={styles.fieldError}>{accountErrors.displayName}</small> : null}
              </label>

              <label className={formStyles.field}>
                Username
                <span className={formStyles.readOnly}>@{user.username}</span>
                <small>Usernames stay fixed to preserve account history.</small>
              </label>

              <label className={formStyles.field} htmlFor="edit-role">
                Role
                <select
                  aria-describedby="edit-role-hint"
                  disabled={current}
                  id="edit-role"
                  onChange={(event) => {
                    setRole(event.target.value as CmsRole);
                    setConfirmAccessChange(false);
                  }}
                  value={role}
                >
                  <option value="administrator">Administrator</option>
                  <option value="staff">Staff</option>
                </select>
                <small id="edit-role-hint">
                  {current ? "You cannot change the role of your current account." : getCmsRoleDescription(role)}
                </small>
              </label>

              <label className={formStyles.checkbox}>
                <input
                  checked={active}
                  disabled={current}
                  onChange={(event) => {
                    setActive(event.target.checked);
                    setConfirmAccessChange(false);
                  }}
                  type="checkbox"
                />
                <span>
                  Active account
                  <small>{current ? "You cannot disable your current account." : "Disabled accounts cannot sign in."}</small>
                </span>
              </label>

              {needsAccessConfirmation ? (
                <label className={`${formStyles.fullField} ${styles.confirmBox}`}>
                  <input
                    checked={confirmAccessChange}
                    name="confirmAccessChange"
                    onChange={(event) => setConfirmAccessChange(event.target.checked)}
                    required
                    type="checkbox"
                  />
                  <span>
                    Confirm reduced access
                    <small>This person may be signed out immediately and lose CMS permissions.</small>
                  </span>
                </label>
              ) : null}

              <div className={formStyles.fullField}>
                <PasswordField
                  autoComplete="current-password"
                  error={accountErrors.currentPassword}
                  hint={currentPasswordHint(mockMode)}
                  id="edit-current-password"
                  label="Your current password"
                  name="currentPassword"
                  required={!mockMode}
                />
              </div>
            </div>
          </section>
        </fieldset>
        <div className={styles.actionBar}>
          <span aria-live="polite"><FormFeedback feedback={accountFeedback} /></span>
          <button className={styles.primaryButton} disabled={busy || (!accessChanged && displayName === user.displayName)} type="submit">
            <Save aria-hidden="true" /> {busySection === "account" ? "Saving…" : "Save account"}
          </button>
        </div>
      </form>

      <form aria-busy={busySection === "password"} className={styles.form} onSubmit={resetPassword}>
        <fieldset className={formStyles.formFields} disabled={busy}>
          <section className={formStyles.section}>
            <header className={formStyles.sectionHeader}>
              <h2>Reset password</h2>
              <p>A password reset signs this account out everywhere. Share the new password privately.</p>
            </header>
            <div className={formStyles.grid}>
              <PasswordField
                autoComplete="new-password"
                error={passwordErrors.newPassword}
                hint={`${CMS_PASSWORD_MIN_LENGTH}–${CMS_PASSWORD_MAX_LENGTH} letters and numbers.`}
                id="reset-new-password"
                label="New password"
                name="newPassword"
                newPassword
              />
              <PasswordField
                autoComplete="new-password"
                error={passwordErrors.confirmPassword}
                hint="Enter the same new password again."
                id="reset-confirm-password"
                label="Confirm new password"
                name="confirmPassword"
                newPassword
              />
              <div className={formStyles.fullField}>
                <PasswordField
                  autoComplete="current-password"
                  error={passwordErrors.currentPassword}
                  hint={currentPasswordHint(mockMode)}
                  id="reset-current-password"
                  label="Your current password"
                  name="currentPassword"
                  required={!mockMode}
                />
              </div>
            </div>
          </section>
        </fieldset>
        <div className={styles.actionBar}>
          <span aria-live="polite"><FormFeedback feedback={passwordFeedback} /></span>
          <button className={styles.primaryButton} disabled={busy} type="submit">
            <KeyRound aria-hidden="true" /> {busySection === "password" ? "Resetting…" : "Reset password"}
          </button>
        </div>
      </form>

      <form aria-busy={busySection === "sessions"} className={styles.form} onSubmit={revokeSessions}>
        <fieldset className={formStyles.formFields} disabled={busy}>
          <section className={`${formStyles.section} ${styles.dangerSection}`}>
            <header className={formStyles.sectionHeader}>
              <h2>Revoke sessions</h2>
              <p>Use this if a device is lost or account access may be compromised.</p>
            </header>
            <div className={formStyles.grid}>
              <label className={`${formStyles.field} ${styles.confirmBox}`}>
                <input name="confirmRevoke" required type="checkbox" />
                <span>
                  Sign this account out everywhere
                  <small>{current ? "This includes your current session." : "The person must sign in again on every device."}</small>
                </span>
                {sessionErrors.confirmRevoke ? <small className={styles.fieldError}>{sessionErrors.confirmRevoke}</small> : null}
              </label>
              <PasswordField
                autoComplete="current-password"
                error={sessionErrors.currentPassword}
                hint={currentPasswordHint(mockMode)}
                id="revoke-current-password"
                label="Your current password"
                name="currentPassword"
                required={!mockMode}
              />
            </div>
          </section>
        </fieldset>
        <div className={styles.actionBar}>
          <span aria-live="polite"><FormFeedback feedback={sessionFeedback} /></span>
          <button className={styles.dangerButton} disabled={busy} type="submit">
            <LogOut aria-hidden="true" /> {busySection === "sessions" ? "Revoking…" : "Revoke all sessions"}
          </button>
        </div>
      </form>
    </div>
  );
}
