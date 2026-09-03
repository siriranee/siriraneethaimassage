"use client";

import { CalendarDays, ChevronLeft, ChevronRight, RotateCw } from "lucide-react";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  buildCalendarMonthCells,
  calendarWeekdayLabels,
  formatCalendarDate,
  formatCalendarMonth,
  monthFromCalendarDate,
  shiftCalendarMonth,
} from "@/domain/booking/calendar-month";

import { CalendarLegend } from "./CalendarLegend";

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

const validDayStates = new Set<CalendarDayState>([
  "available",
  "fully-booked",
  "day-off",
  "unavailable",
  "outside-window",
]);

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
  const initialMonth =
    monthFromCalendarDate(selectedDate) || monthFromCalendarDate(minimumDate);
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
        const earliestMonth = monthFromCalendarDate(nextEarliestDate);
        const latestMonth = monthFromCalendarDate(nextLatestDate);

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
        if (monthFromCalendarDate(currentSelection) === viewMonth) {
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
  const cells = useMemo(
    () => buildCalendarMonthCells(viewMonth),
    [viewMonth],
  );
  const earliestMonth = monthFromCalendarDate(earliestDate);
  const latestMonth = monthFromCalendarDate(latestDate);
  const previousMonth = shiftCalendarMonth(viewMonth, -1);
  const nextMonth = shiftCalendarMonth(viewMonth, 1);
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
            <h4 id={headingId}>{formatCalendarMonth(viewMonth)}</h4>
          </div>
        </div>

        <div className={styles.monthControls}>
          <button
            aria-label={`Show ${formatCalendarMonth(previousMonth)}`}
            className={styles.monthButton}
            disabled={previousDisabled}
            onClick={() => setViewMonth(previousMonth)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <button
            className={styles.todayButton}
            disabled={
              disabled || viewMonth === monthFromCalendarDate(minimumDate)
            }
            onClick={() => setViewMonth(monthFromCalendarDate(minimumDate))}
            type="button"
          >
            Today
          </button>
          <button
            aria-label={`Show ${formatCalendarMonth(nextMonth)}`}
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
        {calendarWeekdayLabels.map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>

      <div
        aria-label={`${formatCalendarMonth(viewMonth)} appointment availability`}
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
          const ariaLabel = `${formatCalendarDate(localDate)} — ${
            loading ? "checking availability" : (day?.label ?? "unavailable")
          }${selected ? ", selected" : ""}`;

          return (
            <button
              aria-current={today ? "date" : undefined}
              aria-label={ariaLabel}
              aria-pressed={selected}
              className={`${styles.calendarDay} ${stateClass(day?.state)} ${
                selected ? styles.daySelected : ""
              } ${today ? styles.dayToday : ""} ${
                loading ? styles.dayLoading : ""
              }`}
              data-state={day?.state ?? "loading"}
              disabled={disabled || loading || !selectable}
              key={localDate}
              onClick={() => selectDateRef.current(localDate)}
              type="button"
            >
              <span className={styles.dayNumber}>{Number(localDate.slice(-2))}</span>
            </button>
          );
        })}
      </div>

      <CalendarLegend />

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
