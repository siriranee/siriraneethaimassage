"use client";

import { CalendarDays, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import styles from "./BookingCalendar.module.css";

type CalendarDayState =
  | "available"
  | "fully-booked"
  | "day-off"
  | "unavailable"
  | "outside-window";

type CalendarDay = {
  readonly localDate: string;
  readonly state: CalendarDayState;
  readonly label: string;
  readonly availableSlotCount: number;
};

type CalendarResponse = {
  readonly status: "disabled" | "planning" | "live";
  readonly message: string;
  readonly month: string;
  readonly minimumDate: string;
  readonly maximumDate: string;
  readonly days: readonly CalendarDay[];
};

type BookingCalendarProps = {
  readonly serviceId: string;
  readonly durationMinutes: number;
  readonly minimumDate: string;
  readonly selectedDate: string;
  readonly disabled?: boolean;
  readonly refreshKey?: number;
  readonly onSelectDate: (localDate: string) => void;
};

const weekdayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const validDayStates = new Set<CalendarDayState>([
  "available",
  "fully-booked",
  "day-off",
  "unavailable",
  "outside-window",
]);

const monthFormatter = new Intl.DateTimeFormat("en-IE", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const fullDateFormatter = new Intl.DateTimeFormat("en-IE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parseMonth(value: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || month < 1 || month > 12) return null;

  return { year, month };
}

function monthFromDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : "";
}

function formatMonth(value: string) {
  const parsed = parseMonth(value);
  if (!parsed) return value;

  return monthFormatter.format(
    new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 12)),
  );
}

function shiftMonth(value: string, amount: number) {
  const parsed = parseMonth(value);
  if (!parsed) return value;

  const shifted = new Date(
    Date.UTC(parsed.year, parsed.month - 1 + amount, 1, 12),
  );
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  return fullDateFormatter.format(
    new Date(
      Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
    ),
  );
}

function buildMonthCells(value: string) {
  const parsed = parseMonth(value);
  if (!parsed) return [];

  const firstDate = new Date(Date.UTC(parsed.year, parsed.month - 1, 1, 12));
  const leadingDays = (firstDate.getUTCDay() + 6) % 7;
  const numberOfDays = new Date(
    Date.UTC(parsed.year, parsed.month, 0, 12),
  ).getUTCDate();

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - leadingDays + 1;
    if (day < 1 || day > numberOfDays) return null;

    return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  });
}

function isCalendarDay(value: unknown): value is CalendarDay {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<CalendarDay>;

  return (
    typeof candidate.localDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.localDate) &&
    typeof candidate.state === "string" &&
    validDayStates.has(candidate.state as CalendarDayState) &&
    typeof candidate.label === "string" &&
    typeof candidate.availableSlotCount === "number"
  );
}

function stateClass(state: CalendarDayState | undefined) {
  switch (state) {
    case "available":
      return styles.dayAvailable;
    case "fully-booked":
      return styles.dayFullyBooked;
    case "day-off":
      return styles.dayOff;
    case "unavailable":
      return styles.dayUnavailable;
    default:
      return styles.dayOutsideWindow;
  }
}

function shortStateLabel(day: CalendarDay | undefined, selected: boolean) {
  if (selected) return "Selected";
  if (!day) return "Checking";

  switch (day.state) {
    case "available":
      return "Available";
    case "fully-booked":
      return "Full";
    case "day-off":
      return "Day off";
    case "unavailable":
      return "No times";
    default:
      return "";
  }
}

export function BookingCalendar({
  serviceId,
  durationMinutes,
  minimumDate,
  selectedDate,
  disabled = false,
  refreshKey = 0,
  onSelectDate,
}: BookingCalendarProps) {
  const headingId = useId();
  const statusId = useId();
  const initialMonth = monthFromDate(selectedDate) || monthFromDate(minimumDate);
  const [viewMonth, setViewMonth] = useState(initialMonth);
  const [calendarDays, setCalendarDays] = useState<readonly CalendarDay[]>([]);
  const [calendarState, setCalendarState] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [calendarMessage, setCalendarMessage] = useState(
    "Checking available days...",
  );
  const [earliestDate, setEarliestDate] = useState(minimumDate);
  const [latestDate, setLatestDate] = useState("");
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = `${serviceId}:${durationMinutes}:${viewMonth}:${refreshKey}:${retryKey}`;
  const [resolvedRequestKey, setResolvedRequestKey] = useState("");
  const selectedDateRef = useRef(selectedDate);
  const selectDateRef = useRef(onSelectDate);

  useEffect(() => {
    selectedDateRef.current = selectedDate;
    selectDateRef.current = onSelectDate;
  }, [onSelectDate, selectedDate]);

  useEffect(() => {
    if (!viewMonth || !serviceId || !durationMinutes) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      serviceId,
      durationMinutes: String(durationMinutes),
      month: viewMonth,
    });

    void fetch(`/api/public/availability/calendar?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as Partial<CalendarResponse>;
        if (!response.ok) {
          throw new Error(
            typeof result.message === "string"
              ? result.message
              : "The booking calendar could not be loaded.",
          );
        }

        const nextEarliestDate =
          typeof result.minimumDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(result.minimumDate)
            ? result.minimumDate
            : minimumDate;
        const nextLatestDate =
          typeof result.maximumDate === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(result.maximumDate)
            ? result.maximumDate
            : nextEarliestDate;
        const earliestMonth = monthFromDate(nextEarliestDate);
        const latestMonth = monthFromDate(nextLatestDate);

        setEarliestDate(nextEarliestDate);
        setLatestDate(nextLatestDate);

        if (earliestMonth && viewMonth < earliestMonth) {
          setViewMonth(earliestMonth);
          selectDateRef.current("");
          return;
        }

        if (latestMonth && viewMonth > latestMonth) {
          setViewMonth(latestMonth);
          selectDateRef.current("");
          return;
        }

        const nextDays = Array.isArray(result.days)
          ? result.days.filter(isCalendarDay)
          : [];
        setCalendarDays(nextDays);
        setCalendarMessage(
          typeof result.message === "string"
            ? result.message
            : "Choose an available day.",
        );
        setCalendarState("ready");
        setResolvedRequestKey(requestKey);

        const currentSelection = selectedDateRef.current;
        if (monthFromDate(currentSelection) === viewMonth) {
          const selectedDay = nextDays.find(
            (day) => day.localDate === currentSelection,
          );
          if (!selectedDay || selectedDay.state !== "available") {
            selectDateRef.current("");
          }
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setCalendarDays([]);
        setCalendarState("error");
        setCalendarMessage(
          error instanceof Error
            ? error.message
            : "The booking calendar could not be loaded.",
        );
        setResolvedRequestKey(requestKey);
      });

    return () => controller.abort();
  }, [durationMinutes, minimumDate, requestKey, serviceId, viewMonth]);

  const visibleCalendarState =
    resolvedRequestKey === requestKey ? calendarState : "loading";
  const visibleCalendarMessage =
    resolvedRequestKey === requestKey
      ? calendarMessage
      : "Checking available days...";
  const dayMap = useMemo(
    () =>
      new Map(
        (resolvedRequestKey === requestKey ? calendarDays : []).map((day) => [
          day.localDate,
          day,
        ]),
      ),
    [calendarDays, requestKey, resolvedRequestKey],
  );
  const cells = useMemo(() => buildMonthCells(viewMonth), [viewMonth]);
  const earliestMonth = monthFromDate(earliestDate);
  const latestMonth = monthFromDate(latestDate);
  const previousMonth = shiftMonth(viewMonth, -1);
  const nextMonth = shiftMonth(viewMonth, 1);
  const previousDisabled = Boolean(
    disabled || (earliestMonth && previousMonth < earliestMonth),
  );
  const nextDisabled = Boolean(
    disabled || (latestMonth && nextMonth > latestMonth),
  );

  return (
    <section
      aria-busy={visibleCalendarState === "loading"}
      aria-describedby={statusId}
      aria-labelledby={headingId}
      className={styles.calendar}
    >
      <header className={styles.calendarHeader}>
        <div className={styles.calendarTitle}>
          <span className={styles.calendarIcon} aria-hidden="true">
            <CalendarDays />
          </span>
          <div>
            <span>Choose a day</span>
            <h4 id={headingId}>{formatMonth(viewMonth)}</h4>
          </div>
        </div>

        <div className={styles.monthControls}>
          <button
            aria-label={`Show ${formatMonth(previousMonth)}`}
            className={styles.monthButton}
            disabled={previousDisabled}
            onClick={() => setViewMonth(previousMonth)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className={styles.todayButton}
            disabled={disabled || viewMonth === monthFromDate(minimumDate)}
            onClick={() => setViewMonth(monthFromDate(minimumDate))}
            type="button"
          >
            Today
          </button>
          <button
            aria-label={`Show ${formatMonth(nextMonth)}`}
            className={styles.monthButton}
            disabled={nextDisabled}
            onClick={() => setViewMonth(nextMonth)}
            type="button"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </header>

      <div aria-hidden="true" className={styles.weekdays}>
        {weekdayLabels.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        aria-label={`${formatMonth(viewMonth)} appointment availability`}
        className={styles.monthGrid}
      >
        {cells.map((localDate, index) => {
          if (!localDate) {
            return <span aria-hidden="true" key={`empty-${index}`} />;
          }

          const day = dayMap.get(localDate);
          const selected = selectedDate === localDate;
          const today = minimumDate === localDate;
          const loading = visibleCalendarState === "loading";
          const selectable = day?.state === "available";
          const stateLabel = shortStateLabel(day, selected);
          const ariaLabel = `${formatLocalDate(localDate)} — ${
            loading ? "checking availability" : (day?.label ?? "unavailable")
          }${selected ? ", selected" : ""}`;

          return (
            <button
              aria-current={today ? "date" : undefined}
              aria-label={ariaLabel}
              aria-pressed={selected}
              className={`${styles.calendarDay} ${stateClass(day?.state)} ${
                selected ? styles.daySelected : ""
              } ${loading ? styles.dayLoading : ""}`}
              data-state={day?.state ?? "loading"}
              disabled={disabled || loading || !selectable}
              key={localDate}
              onClick={() => selectDateRef.current(localDate)}
              type="button"
            >
              <span className={styles.dayNumber}>{Number(localDate.slice(-2))}</span>
              {stateLabel ? (
                <span className={styles.dayStatus}>{stateLabel}</span>
              ) : null}
              {today ? <span className={styles.todayDot}>Today</span> : null}
            </button>
          );
        })}
      </div>

      <ul aria-label="Calendar legend" className={styles.legend}>
        <li><i className={styles.legendAvailable} />Available</li>
        <li><i className={styles.legendSelected} />Selected</li>
        <li><i className={styles.legendFull} />Fully booked</li>
        <li><i className={styles.legendDayOff} />Day off</li>
      </ul>

      <div
        aria-live="polite"
        className={`${styles.calendarStatus} ${
          visibleCalendarState === "error" ? styles.calendarError : ""
        }`}
        id={statusId}
        role={visibleCalendarState === "error" ? "alert" : "status"}
      >
        <p>{visibleCalendarMessage}</p>
        {visibleCalendarState === "error" ? (
          <button onClick={() => setRetryKey((value) => value + 1)} type="button">
            <RotateCw aria-hidden="true" /> Retry calendar
          </button>
        ) : null}
      </div>
    </section>
  );
}
