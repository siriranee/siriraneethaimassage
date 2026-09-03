const UNKNOWN_TRANSACTION_COMMIT_RESULT = "UnknownTransactionCommitResult";

type ErrorWithMongoLabels = Readonly<{
  cause?: unknown;
  errorLabels?: unknown;
  hasErrorLabel?: unknown;
}>;

export function isMongoCommitResultIndeterminate(error: unknown) {
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object" || seen.has(current)) {
      return false;
    }
    seen.add(current);
    const candidate = current as ErrorWithMongoLabels;
    if (
      Array.isArray(candidate.errorLabels) &&
      candidate.errorLabels.includes(UNKNOWN_TRANSACTION_COMMIT_RESULT)
    ) {
      return true;
    }
    if (typeof candidate.hasErrorLabel === "function") {
      try {
        if (
          candidate.hasErrorLabel.call(
            current,
            UNKNOWN_TRANSACTION_COMMIT_RESULT,
          ) === true
        ) {
          return true;
        }
      } catch {
        // Fall through to a wrapped cause without trusting the error method.
      }
    }
    current = candidate.cause;
  }

  return false;
}
