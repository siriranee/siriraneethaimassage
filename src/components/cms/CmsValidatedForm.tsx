"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ComponentPropsWithoutRef,
  type FocusEvent,
  type FormEvent,
  type ReactNode,
} from "react";

import styles from "./CmsValidatedForm.module.css";

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

type ValidationIssue = Readonly<{
  field: string;
  key: string;
  label: string;
  message: string;
  source: "native" | "server";
}>;

type CmsValidatedFormProps = Omit<
  ComponentPropsWithoutRef<"form">,
  "children"
> & {
  readonly children: ReactNode;
  readonly serverErrors?: unknown;
};

export function safeCmsFieldErrors(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as Readonly<Record<string, string>>;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([field, message]) =>
      typeof message === "string" && message.trim()
        ? [[field, message.trim()]]
        : [],
    ),
  ) as Readonly<Record<string, string>>;
}

function isFormControl(value: unknown): value is FormControl {
  return (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  );
}

function isValidatedControl(control: FormControl) {
  return (
    !control.disabled &&
    !(control instanceof HTMLInputElement &&
      ["button", "hidden", "reset", "submit"].includes(control.type))
  );
}

function isSearchableControl(control: FormControl, includeDisabled: boolean) {
  return (
    (includeDisabled || !control.disabled) &&
    !(control instanceof HTMLInputElement &&
      ["button", "hidden", "reset", "submit"].includes(control.type))
  );
}

function normaliseField(field: string) {
  return field.replace(/\.\d+(?=\.|$)/g, "");
}

function controlField(control: FormControl) {
  return control.dataset.cmsField?.trim() || control.name.trim() || control.id.trim();
}

function controlAliases(control: FormControl) {
  return (control.dataset.cmsFieldAliases || "").split(/\s+/).filter(Boolean);
}

function controlKey(control: FormControl, index = 0) {
  return controlField(control) || `field-${index}`;
}

function firstReadableText(element: Element | null): string {
  if (!element) return "";
  const explicit = element.getAttribute("data-cms-label")?.trim();
  if (explicit) return explicit;

  for (const node of element.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent?.trim()) {
      return node.textContent.trim();
    }
    if (node instanceof HTMLSpanElement) {
      const nested = [...node.childNodes].find(
        (child) =>
          child.nodeType === Node.TEXT_NODE && Boolean(child.textContent?.trim()),
      );
      if (nested?.textContent?.trim()) return nested.textContent.trim();
    }
  }
  return "";
}

function humaniseField(field: string) {
  const leaf = field.split(".").at(-1) || "field";
  return leaf
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function controlLabel(control: FormControl, fallback: string) {
  const label = control.labels?.[0] ?? control.closest("label");
  return (
    control.dataset.cmsLabel?.trim() ||
    firstReadableText(label) ||
    humaniseField(fallback)
  );
}

function manualTextIssue(control: FormControl, label: string) {
  if (control instanceof HTMLTextAreaElement) {
    const nonEmptyLines = control.value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const maximumLines = Number(control.dataset.cmsMaxLines || 0);
    if (maximumLines > 0 && nonEmptyLines.length > maximumLines) {
      return `Use no more than ${maximumLines} lines for ${label.toLowerCase()}.`;
    }
    const maximumLineLength = Number(control.dataset.cmsMaxLineLength || 0);
    const longLine = nonEmptyLines.find((line) => line.length > maximumLineLength);
    if (maximumLineLength > 0 && longLine) {
      return `Keep each line of ${label.toLowerCase()} to ${maximumLineLength} characters or fewer.`;
    }
  }
  const matchField = control.dataset.cmsMatchField?.trim();
  if (matchField && control.value) {
    const matchingControl = control.form
      ? findControl(control.form, matchField)
      : undefined;
    if (
      isFormControl(matchingControl) &&
      control.value !== matchingControl.value
    ) {
      return `${label} must match ${controlLabel(matchingControl, matchField).toLowerCase()}.`;
    }
  }
  const afterField = control.dataset.cmsAfterField?.trim();
  const notBeforeField = control.dataset.cmsNotBeforeField?.trim();
  const afterConditionField = control.dataset.cmsAfterWhenChecked?.trim();
  const afterUnlessField = control.dataset.cmsAfterUnlessChecked?.trim();
  const afterConditionControl =
    afterConditionField && control.form
      ? findControl(control.form, afterConditionField)
      : undefined;
  const afterUnlessControl =
    afterUnlessField && control.form
      ? findControl(control.form, afterUnlessField)
      : undefined;
  const shouldCompareAfter =
    !afterConditionField ||
    !(afterConditionControl instanceof HTMLInputElement) ||
    afterConditionControl.checked;
  const isAfterComparisonEnabled =
    shouldCompareAfter &&
    (!afterUnlessField ||
      !(afterUnlessControl instanceof HTMLInputElement) ||
      !afterUnlessControl.checked);
  if (afterField && control.value && isAfterComparisonEnabled) {
    const earlierControl = control.form
      ? findControl(control.form, afterField)
      : undefined;
    if (
      isFormControl(earlierControl) &&
      earlierControl.value &&
      control.value <= earlierControl.value
    ) {
      return `${label} must be later than ${controlLabel(earlierControl, afterField).toLowerCase()}.`;
    }
  }
  if (notBeforeField && control.value) {
    const earlierControl = control.form
      ? findControl(control.form, notBeforeField)
      : undefined;
    if (
      isFormControl(earlierControl) &&
      earlierControl.value &&
      control.value < earlierControl.value
    ) {
      return `${label} must be on or after ${controlLabel(earlierControl, notBeforeField).toLowerCase()}.`;
    }
  }
  if (
    control instanceof HTMLSelectElement ||
    (control instanceof HTMLInputElement &&
      ["checkbox", "color", "date", "file", "number", "radio", "range", "time"].includes(
        control.type,
      ))
  ) {
    return "";
  }

  const trimmedLength = control.value.trim().length;
  if (control.required && trimmedLength === 0) return `${label} is required.`;
  if (trimmedLength > 0 && control.minLength > 0 && trimmedLength < control.minLength) {
    return `Use at least ${control.minLength} characters for ${label.toLowerCase()} (currently ${trimmedLength}).`;
  }
  return "";
}

function friendlyNativeMessage(control: FormControl, label: string) {
  const validity = control.validity;
  if (validity.valueMissing) return `${label} is required.`;
  if (validity.typeMismatch) {
    if (control instanceof HTMLInputElement && control.type === "email") {
      return `Enter a valid email address for ${label.toLowerCase()}.`;
    }
    if (control instanceof HTMLInputElement && control.type === "url") {
      return `Enter a complete http or https URL for ${label.toLowerCase()}.`;
    }
    return `Enter a valid value for ${label.toLowerCase()}.`;
  }
  if (validity.tooShort && "minLength" in control && control.minLength > 0) {
    return `Use at least ${control.minLength} characters for ${label.toLowerCase()} (currently ${control.value.trim().length}).`;
  }
  if (validity.tooLong && "maxLength" in control && control.maxLength >= 0) {
    return `Use no more than ${control.maxLength} characters for ${label.toLowerCase()}.`;
  }
  if (validity.patternMismatch) {
    if (/slug|link name/i.test(label)) {
      return "Use lowercase letters, numbers and single hyphens only.";
    }
    return `Use the requested format for ${label.toLowerCase()}.`;
  }
  if (validity.rangeUnderflow) {
    return `${label} must be ${control.getAttribute("min")} or more.`;
  }
  if (validity.rangeOverflow) {
    return `${label} must be ${control.getAttribute("max")} or less.`;
  }
  if (validity.stepMismatch) return `Use a permitted increment for ${label.toLowerCase()}.`;
  if (validity.badInput) return `Enter a valid value for ${label.toLowerCase()}.`;
  return control.validationMessage || `Check ${label.toLowerCase()}.`;
}

function findControl(
  form: HTMLFormElement,
  field: string,
  includeDisabled = false,
) {
  const normalised = normaliseField(field);
  const controls = Array.from(form.elements).filter(
    (element): element is FormControl =>
      isFormControl(element) && isSearchableControl(element, includeDisabled),
  );
  const exact = controls.find(
    (control) =>
      controlField(control) === field || controlAliases(control).includes(field),
  );
  if (exact) return exact;
  return controls.find((control) => {
    const candidate = controlField(control);
    return (
      normaliseField(candidate) === normalised ||
      controlAliases(control).some(
        (alias) => normaliseField(alias) === normalised,
      ) ||
      candidate === field.split(".")[0]
    );
  });
}

export const CmsValidatedForm = forwardRef<HTMLFormElement, CmsValidatedFormProps>(
  function CmsValidatedForm(
    {
      children,
      className = "",
      onBlurCapture,
      onInputCapture,
      onInvalidCapture,
      onSubmitCapture,
      serverErrors,
      ...formProps
    },
    forwardedRef,
  ) {
    const formRef = useRef<HTMLFormElement | null>(null);
    const summaryRef = useRef<HTMLDivElement>(null);
    const touchedRef = useRef(new Set<string>());
    const managedCustomValidityRef = useRef(new WeakSet<FormControl>());
    const syncedControlsRef = useRef(new Set<FormControl>());
    const syncedLabelsRef = useRef(new Set<Element>());
    const lastServerErrorSignatureRef = useRef("");
    const pendingServerFocusRef = useRef("");
    const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
    const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);

    function assignRef(node: HTMLFormElement | null) {
      formRef.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    }

    function removeIssue(key: string, includeServer = false) {
      setIssues((current) => {
        const next = current.filter(
          (issue) =>
            issue.key !== key || (!includeServer && issue.source === "server"),
        );
        return next.length === current.length ? current : next;
      });
    }

    function recordIssue(issue: ValidationIssue) {
      setIssues((current) => {
        const existing = current.find((item) => item.key === issue.key);
        if (
          existing?.field === issue.field &&
          existing.label === issue.label &&
          existing.message === issue.message &&
          existing.source === issue.source
        ) {
          return current;
        }
        return [...current.filter((item) => item.key !== issue.key), issue];
      });
    }

    function validateControl(
      control: FormControl,
      clearEditableCustomValidity = false,
      clearServerIssue = false,
    ) {
      const field = controlField(control);
      const key = controlKey(control);
      if (!isValidatedControl(control)) {
        if (managedCustomValidityRef.current.has(control)) {
          control.setCustomValidity("");
          managedCustomValidityRef.current.delete(control);
        }
        removeIssue(key);
        return;
      }
      const label = controlLabel(control, field || key);

      if (
        managedCustomValidityRef.current.has(control) ||
        clearEditableCustomValidity
      ) {
        control.setCustomValidity("");
        managedCustomValidityRef.current.delete(control);
      }
      const manualIssue = manualTextIssue(control, label);
      if (manualIssue) {
        control.setCustomValidity(manualIssue);
        managedCustomValidityRef.current.add(control);
      }

      if (control.validity.valid) {
        removeIssue(key, clearServerIssue);
        return;
      }
      recordIssue({
        field: field || key,
        key,
        label,
        message: manualIssue || friendlyNativeMessage(control, label),
        source: "native",
      });
    }

    function handleInvalidCapture(event: FormEvent<HTMLFormElement>) {
      const control = event.target;
      if (isFormControl(control)) {
        touchedRef.current.add(controlKey(control));
        validateControl(control, false, true);
      }
      onInvalidCapture?.(event);
    }

    function handleBlurCapture(event: FocusEvent<HTMLFormElement>) {
      const control = event.target;
      if (isFormControl(control)) {
        touchedRef.current.add(controlKey(control));
        validateControl(control, false, true);
      }
      onBlurCapture?.(event);
    }

    function handleInputCapture(event: FormEvent<HTMLFormElement>) {
      const control = event.target;
      if (isFormControl(control)) {
        const key = controlKey(control);
        const hasValue =
          control instanceof HTMLInputElement && ["checkbox", "radio"].includes(control.type)
            ? control.checked
            : Boolean(control.value);
        if (hasValue) touchedRef.current.add(key);
        if (touchedRef.current.has(key) || issues.some((issue) => issue.key === key)) {
          validateControl(control, true, true);
        }
        const form = formRef.current;
        if (form) {
          const changedField = controlField(control);
          for (const dependent of Array.from(form.elements)) {
            const clearWhenFields = isFormControl(dependent)
              ? (dependent.dataset.cmsClearCustomWhen || "")
                  .split(/\s+/)
                  .filter(Boolean)
              : [];
            const clearWhenPrefix = isFormControl(dependent)
              ? dependent.dataset.cmsClearCustomWhenPrefix || ""
              : "";
            const revalidateWhenFields = isFormControl(dependent)
              ? (dependent.dataset.cmsRevalidateWhen || "")
                  .split(/\s+/)
                  .filter(Boolean)
              : [];
            const dependencyChanged =
              isFormControl(dependent) &&
              (
                [
                  dependent.dataset.cmsMatchField,
                  dependent.dataset.cmsAfterField,
                  dependent.dataset.cmsNotBeforeField,
                ].includes(changedField) ||
                dependent.dataset.cmsAfterWhenChecked === changedField ||
                dependent.dataset.cmsAfterUnlessChecked === changedField ||
                clearWhenFields.includes(changedField) ||
                revalidateWhenFields.includes(changedField) ||
                (clearWhenPrefix && changedField.startsWith(clearWhenPrefix))
              );
            if (dependencyChanged && revalidateWhenFields.includes(changedField)) {
              touchedRef.current.add(controlKey(dependent as FormControl));
            }
            if (
              dependencyChanged &&
              isFormControl(dependent) &&
              (touchedRef.current.has(controlKey(dependent)) ||
                issues.some((issue) => issue.key === controlKey(dependent)))
            ) {
              validateControl(dependent, true, true);
            }
          }
        }
      }
      onInputCapture?.(event);
    }

    function handleSubmitCapture(event: FormEvent<HTMLFormElement>) {
      const form = event.currentTarget;
      for (const element of Array.from(form.elements)) {
        if (!isFormControl(element)) continue;
        touchedRef.current.add(controlKey(element));
        validateControl(element, true, true);
      }
      if (!form.reportValidity()) {
        event.preventDefault();
        event.stopPropagation();
      }
      onSubmitCapture?.(event);
    }

    function focusIssue(issue: ValidationIssue) {
      const form = formRef.current;
      const control = form ? findControl(form, issue.field, true) : undefined;
      if (control && !control.disabled) {
        control.focus();
        control.scrollIntoView({ behavior: "smooth", block: "center" });
        return true;
      }
      summaryRef.current?.focus();
      return false;
    }

    useEffect(() => {
      const form = formRef.current;
      if (!form) return;
      const errors = safeCmsFieldErrors(serverErrors);
      const signature = JSON.stringify(errors);
      const serverIssues = Object.entries(errors).map(([field, message], index) => {
        const control = findControl(form, field, true);
        const key = control ? controlKey(control, index) : `server:${field}`;
        return {
          field,
          key,
          label: control ? controlLabel(control, field) : humaniseField(field),
          message,
          source: "server" as const,
        };
      });
      setIssues((current) => [
        ...current.filter((issue) => issue.source !== "server"),
        ...serverIssues,
      ]);

      if (serverIssues.length && signature !== lastServerErrorSignatureRef.current) {
        pendingServerFocusRef.current = serverIssues[0].field;
      } else if (!serverIssues.length) {
        pendingServerFocusRef.current = "";
      }
      lastServerErrorSignatureRef.current = signature;
    }, [serverErrors]);

    useEffect(() => {
      const form = formRef.current;
      if (!form) return;
      for (const element of Array.from(form.elements)) {
        if (!isFormControl(element)) continue;
        const key = controlKey(element);
        if (
          touchedRef.current.has(key) ||
          issues.some((issue) => issue.key === key)
        ) {
          validateControl(element);
        }
      }
    });

    useEffect(() => {
      for (const control of syncedControlsRef.current) {
        if (control.dataset.cmsValidationManaged === "true") {
          const errorId = control.dataset.cmsValidationErrorId;
          const label = control.labels?.[0] ?? control.closest("label");
          const hasRenderedFieldError = Boolean(
            label?.querySelector('[data-cms-field-error], [class*="fieldError"]'),
          );
          if (!hasRenderedFieldError && control.getAttribute("aria-invalid") === "true") {
            control.removeAttribute("aria-invalid");
          }
          if (errorId && control.getAttribute("aria-errormessage") === errorId) {
            control.removeAttribute("aria-errormessage");
          }
          delete control.dataset.cmsValidationManaged;
          delete control.dataset.cmsValidationErrorId;
        }
      }
      for (const label of syncedLabelsRef.current) {
        label.removeAttribute("data-cms-validation-error");
      }
      syncedControlsRef.current.clear();
      syncedLabelsRef.current.clear();

      const form = formRef.current;
      if (!form) return;
      issues.forEach((issue, index) => {
        const control = findControl(form, issue.field, true);
        if (!control) return;
        const errorId = `${instanceId}-validation-${index}`;
        control.setAttribute("aria-invalid", "true");
        control.setAttribute("aria-errormessage", errorId);
        control.dataset.cmsValidationManaged = "true";
        control.dataset.cmsValidationErrorId = errorId;
        syncedControlsRef.current.add(control);
        const label = control.labels?.[0] ?? control.closest("label");
        if (
          label &&
          !label.querySelector('[data-cms-field-error], [class*="fieldError"]')
        ) {
          label.setAttribute("data-cms-validation-error", issue.message);
          syncedLabelsRef.current.add(label);
        }
      });

      const pendingField = pendingServerFocusRef.current;
      const pendingIssue = issues.find((issue) => issue.field === pendingField);
      if (pendingIssue) {
        window.requestAnimationFrame(() => {
          if (focusIssue(pendingIssue)) pendingServerFocusRef.current = "";
        });
      }
    });

    return (
      <form
        {...formProps}
        className={`${className} ${styles.validatedForm}`.trim()}
        onBlurCapture={handleBlurCapture}
        onInputCapture={handleInputCapture}
        onInvalidCapture={handleInvalidCapture}
        onSubmitCapture={handleSubmitCapture}
        ref={assignRef}
      >
        {issues.length ? (
          <div
            aria-atomic="true"
            className={styles.summary}
            ref={summaryRef}
            role="alert"
            tabIndex={-1}
          >
            <p>
              {issues.length === 1
                ? "Please correct this field:"
                : `Please correct these ${issues.length} fields:`}
            </p>
            <ul>
              {issues.map((issue, index) => (
                <li id={`${instanceId}-validation-${index}`} key={`${issue.key}:${issue.source}`}>
                  <button onClick={() => focusIssue(issue)} type="button">
                    <strong>{issue.label}:</strong> {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {children}
      </form>
    );
  },
);
