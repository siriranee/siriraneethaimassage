"use client";

import Link from "next/link";
import { Clock3, RotateCw } from "lucide-react";
import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import { AcuityScheduler } from "@/components/booking/AcuityScheduler";
import { BookingCalendar } from "@/components/booking/BookingCalendar";
import {
  buildAcuityDirectUrl,
  buildAcuityEmbedUrl,
  getAcuityBookingOptions,
} from "@/content/booking";
import { buildContactPreferenceHref } from "@/lib/contact-links";

import styles from "./BookingPlanner.module.css";

type PricePoint = {
  readonly durationMinutes: number;
  readonly priceEur: number;
};

export type BookingPlannerService = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly shortDescription: string;
  readonly bookingNotice: string;
  readonly pricing: readonly PricePoint[];
};

type BookingPlannerProps = {
  readonly services: readonly BookingPlannerService[];
  readonly initialServiceSlug?: string;
  readonly initialDuration?: number;
  readonly initialDate?: string;
  readonly initialTime?: string;
};

type PublicSlot = {
  readonly slotId: string;
  readonly localDate: string;
  readonly localTime: string;
  readonly localTimeLabel: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: "Europe/Dublin";
};

type AvailabilityMode = "disabled" | "planning" | "live";

type PublicAvailabilityResponse = {
  readonly status: AvailabilityMode;
  readonly message: string;
  readonly slots: readonly PublicSlot[];
};

type PublicBookingSnapshot = {
  readonly reference: string;
  readonly serviceName: string;
  readonly durationMinutes: number;
  readonly priceCents: number;
  readonly currency: "EUR";
  readonly localDate: string;
  readonly localTime: string;
  readonly timezone: "Europe/Dublin";
  readonly status: string;
};

type PublicBookingResponse = {
  readonly booking?: PublicBookingSnapshot;
  readonly error?: string;
  readonly fields?: Readonly<Record<string, string>>;
};

const euroFormatter = new Intl.NumberFormat("en-IE", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-IE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Dublin",
});

function formatPrice(price: number) {
  return euroFormatter.format(price);
}

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  if (hours && remainingMinutes) {
    return `${hours} hr ${remainingMinutes} min`;
  }

  if (hours) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }

  return `${minutes} min`;
}

function formatPriceRange(pricing: readonly PricePoint[]) {
  if (!pricing.length) {
    return "Contact the spa";
  }

  const prices = pricing.map((option) => option.priceEur);
  const lowestPrice = Math.min(...prices);
  const highestPrice = Math.max(...prices);

  if (lowestPrice === highestPrice) {
    return formatPrice(lowestPrice);
  }

  return `${formatPrice(lowestPrice)}–${formatPrice(highestPrice)}`;
}

function formatLocalDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;

  return dateFormatter.format(
    new Date(
      Date.UTC(
        Number(match[1]),
        Number(match[2]) - 1,
        Number(match[3]),
        12,
      ),
    ),
  );
}

function currentDublinDate() {
  const parts = new Intl.DateTimeFormat("en-IE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Europe/Dublin",
  }).formatToParts(new Date());
  const value = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${value.year}-${value.month}-${value.day}`;
}

function createIdempotencyKey() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  const values = crypto.getRandomValues(new Uint32Array(4));
  return Array.from(
    values,
    (value) => value.toString(16).padStart(8, "0"),
  ).join("");
}

function getDurationOptions(service: BookingPlannerService) {
  return [...service.pricing].sort(
    (first, second) => first.durationMinutes - second.durationMinutes,
  );
}

export function BookingPlanner({
  services,
  initialServiceSlug,
  initialDuration,
  initialDate,
  initialTime,
}: BookingPlannerProps) {
  const requestedService = services.find(
    (service) => service.slug === initialServiceSlug,
  );
  const firstService = requestedService ?? services[0];
  const initialDurationOptions = firstService
    ? getDurationOptions(firstService)
    : [];
  const firstDuration =
    typeof initialDuration === "number" &&
    initialDurationOptions.some(
      (option) => option.durationMinutes === initialDuration,
    )
      ? initialDuration
      : (initialDurationOptions[0]?.durationMinutes ?? 0);

  const [selectedServiceId, setSelectedServiceId] = useState(
    firstService?.id ?? "",
  );
  const [selectedDuration, setSelectedDuration] = useState(firstDuration);
  const [calendarRequested, setCalendarRequested] = useState(false);
  const [preferredDate, setPreferredDate] = useState(
    initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate) ? initialDate : "",
  );
  const [selectedTime, setSelectedTime] = useState(
    initialTime && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(initialTime)
      ? initialTime
      : "",
  );
  const [minimumDate] = useState(currentDublinDate);
  const [availableSlots, setAvailableSlots] =
    useState<readonly PublicSlot[]>([]);
  const [availabilityMode, setAvailabilityMode] =
    useState<AvailabilityMode | null>(null);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [availabilityState, setAvailabilityState] = useState<
    "idle" | "loading" | "ready" | "disabled" | "error"
  >(initialDate ? "loading" : "idle");
  const [availabilityMessage, setAvailabilityMessage] = useState(
    "Choose a date to check the booking calendar.",
  );
  const [submissionState, setSubmissionState] = useState<
    "idle" | "submitting" | "error" | "success"
  >("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [fieldErrors, setFieldErrors] = useState<
    Readonly<Record<string, string>>
  >({});
  const [confirmation, setConfirmation] =
    useState<PublicBookingSnapshot | null>(null);

  const formRef = useRef<HTMLFormElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const confirmationRef = useRef<HTMLDivElement>(null);
  const idempotencyKeyRef = useRef("");

  const selectedService =
    services.find((service) => service.id === selectedServiceId) ??
    firstService;
  const durationOptions = selectedService
    ? getDurationOptions(selectedService)
    : [];
  const acuityOptions = selectedService
    ? getAcuityBookingOptions(selectedService.slug)
    : [];
  const selectedDurationOption = durationOptions.find(
    (option) => option.durationMinutes === selectedDuration,
  );
  const selectedAcuityOption = acuityOptions.find(
    (option) => option.durationMinutes === selectedDuration,
  );
  const schedulerOptions = {
    appointmentTypeId: selectedAcuityOption?.appointmentTypeId,
  } as const;
  const schedulerEmbedUrl = buildAcuityEmbedUrl(schedulerOptions);
  const schedulerDirectUrl = buildAcuityDirectUrl(schedulerOptions);
  const externalCalendarAvailable = Boolean(
    availabilityMode !== "live" &&
      selectedAcuityOption &&
      schedulerEmbedUrl &&
      schedulerDirectUrl,
  );
  const directBookingAvailable = availabilityMode === "live";
  const selectedTimeSlot = availableSlots.find(
    (slot) => slot.localTime === selectedTime,
  );
  const contactPreferenceHref = selectedService
    ? buildContactPreferenceHref({
        serviceSlug: selectedService.slug,
        durationMinutes: selectedDuration,
        preferredDate: preferredDate || undefined,
        preferredTime: selectedTime || undefined,
      })
    : "/contact";
  const selectionLabel = selectedService
    ? `${selectedService.name} · ${
        selectedDurationOption
          ? formatDuration(selectedDurationOption.durationMinutes)
          : "duration in calendar"
      }`
    : "Massage appointment";

  useEffect(() => {
    if (!preferredDate || !selectedDuration || !selectedService) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      serviceId: selectedService.id,
      durationMinutes: String(selectedDuration),
      localDate: preferredDate,
    });

    void fetch(`/api/public/availability?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as PublicAvailabilityResponse;
        if (!response.ok) throw new Error(result.message);

        const slots = result.slots ?? [];
        setAvailableSlots(slots);
        setAvailabilityMode(result.status);
        setAvailabilityMessage(result.message);
        setAvailabilityState(
          result.status === "disabled" ? "disabled" : "ready",
        );
        setSelectedTime((current) =>
          current && !slots.some((slot) => slot.localTime === current)
            ? ""
            : current,
        );
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAvailableSlots([]);
        setAvailabilityMode(null);
        setSelectedTime("");
        setAvailabilityState("error");
        setAvailabilityMessage(
          error instanceof Error
            ? error.message
            : "Availability could not be checked.",
        );
      });

    return () => controller.abort();
  }, [
    availabilityRefresh,
    preferredDate,
    selectedDuration,
    selectedService,
  ]);

  useEffect(() => {
    if (submissionState === "error") {
      errorRef.current?.focus();
    }
  }, [submissionState]);

  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus();
    }
  }, [confirmation]);

  if (!selectedService) {
    return (
      <section className={styles.emptyState} aria-labelledby="booking-title">
        <p className={styles.eyebrow}>Book Now</p>
        <h2 id="booking-title">Contact the Siriranee team</h2>
        <p>
          Online booking is unavailable while the service menu is being
          updated.
        </p>
        <Link className={styles.primaryAction} href="/contact">
          Contact the spa <span aria-hidden="true">→</span>
        </Link>
      </section>
    );
  }

  function resetSubmission() {
    setSubmissionState("idle");
    setSubmissionMessage("");
    setFieldErrors({});
    setConfirmation(null);
    idempotencyKeyRef.current = "";
  }

  function selectService(serviceId: string) {
    const nextService = services.find((service) => service.id === serviceId);

    setSelectedServiceId(serviceId);
    setSelectedDuration(
      nextService
        ? (getDurationOptions(nextService)[0]?.durationMinutes ?? 0)
        : 0,
    );
    setSelectedTime("");
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityState(preferredDate ? "loading" : "idle");
    resetSubmission();
  }

  function selectDuration(durationMinutes: number) {
    setSelectedDuration(durationMinutes);
    setSelectedTime("");
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityState(preferredDate ? "loading" : "idle");
    resetSubmission();
  }

  function selectDate(value: string) {
    setPreferredDate(value);
    setSelectedTime("");
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityMessage(
      value
        ? "Checking the booking calendar..."
        : "Choose a date to check the booking calendar.",
    );
    setAvailabilityState(value ? "loading" : "idle");
    resetSubmission();
  }

  function selectTime(value: string) {
    setSelectedTime(value);
    resetSubmission();
  }

  function openLiveCalendar() {
    setCalendarRequested(true);
    window.setTimeout(() => {
      const reducedMotionRequested = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;

      document
        .getElementById("live-booking-calendar")
        ?.scrollIntoView({
          behavior: reducedMotionRequested ? "auto" : "smooth",
          block: "start",
        });
    }, 50);
  }

  async function submitBooking(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !directBookingAvailable ||
      !selectedTime ||
      !selectedDuration ||
      submissionState === "submitting"
    ) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    idempotencyKeyRef.current ||= createIdempotencyKey();
    setSubmissionState("submitting");
    setSubmissionMessage("Sending your secure booking request...");
    setFieldErrors({});

    try {
      const response = await fetch("/api/public/bookings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKeyRef.current,
        },
        body: JSON.stringify({
          customerName: data.get("customerName"),
          phone: data.get("phone"),
          email: data.get("email"),
          notes: data.get("notes"),
          serviceId: selectedService.id,
          durationMinutes: selectedDuration,
          localDate: preferredDate,
          localTime: selectedTime,
          privacyAccepted: data.get("privacyAccepted") === "on",
          website: data.get("website"),
        }),
      });
      const result = (await response.json().catch(() => ({
        error: "The booking service returned an unreadable response.",
      }))) as PublicBookingResponse;

      if (!response.ok || !result.booking) {
        setFieldErrors(result.fields ?? {});
        setSubmissionState("error");
        setSubmissionMessage(
          result.error ?? "The booking request could not be completed.",
        );

        if (response.status === 409) {
          setSelectedTime("");
          setAvailableSlots([]);
          setAvailabilityState("loading");
          setAvailabilityRefresh((value) => value + 1);
          idempotencyKeyRef.current = "";
        }
        return;
      }

      setConfirmation(result.booking);
      setSubmissionState("success");
      setSubmissionMessage(
        "Your request was received and is awaiting confirmation from Siriranee.",
      );
    } catch {
      setSubmissionState("error");
      setSubmissionMessage(
        "We could not confirm whether the request reached the spa. Check your connection and retry once, or contact Siriranee directly.",
      );
    }
  }

  function startAnotherBooking() {
    formRef.current?.reset();
    setSelectedTime("");
    resetSubmission();
    setAvailabilityRefresh((value) => value + 1);
  }

  const appointmentLabel = preferredDate
    ? `${formatLocalDate(preferredDate)}${
        selectedTime
          ? ` · ${selectedTimeSlot?.localTimeLabel ?? selectedTime}`
          : ""
      }`
    : "Not selected yet";

  return (
    <section className={styles.planner} aria-labelledby="booking-planner-title">
      <div className={styles.intro}>
        <p className={styles.eyebrow}>Your visit, your pace</p>
        <h2 id="booking-planner-title">Choose your massage</h2>
        <p className={styles.introText}>
          Select a treatment, duration and preferred Dublin date and time. The
          spa handles staff assignment internally, so there is no therapist
          choice. Personal details are requested only when secure direct booking
          is fully approved and available.
        </p>
      </div>

      <ol className={styles.journey} aria-label="Two-stage appointment process">
        <li
          aria-current={!selectedTime ? "step" : undefined}
          className={styles.journeyActive}
        >
          <span className={styles.journeyNumber} aria-hidden="true">
            1
          </span>
          <span>
            <strong>Book Now</strong>
            <small>Choose your service, duration and preferred time.</small>
          </span>
        </li>
        <li
          aria-current={selectedTime ? "step" : undefined}
          className={
            selectedTime || calendarRequested ? styles.journeyActive : undefined
          }
        >
          <span className={styles.journeyNumber} aria-hidden="true">
            2
          </span>
          <span>
            <strong>
              {directBookingAvailable
                ? "Send your secure request"
                : externalCalendarAvailable
                  ? "Confirm in the live calendar"
                  : "Request your appointment"}
            </strong>
            <small>
              {directBookingAvailable
                ? "Enter contact details and await the team’s confirmation."
                : externalCalendarAvailable
                  ? "Complete the configured provider booking."
                  : "Contact the team while direct booking setup is pending."}
            </small>
          </span>
        </li>
      </ol>

      <form
        aria-busy={submissionState === "submitting"}
        aria-label="Massage appointment booking"
        className={styles.plannerGrid}
        onSubmit={submitBooking}
        ref={formRef}
      >
        <div className={styles.selectionCard}>
          {confirmation ? (
            <div
              className={styles.confirmationPanel}
              ref={confirmationRef}
              tabIndex={-1}
            >
              <span className={styles.confirmationBadge} aria-hidden="true">
                ✓
              </span>
              <p className={styles.eyebrow}>Request received</p>
              <h3>Thank you — Siriranee will confirm your appointment</h3>
              <p>
                Your reference is <strong>{confirmation.reference}</strong>.
                This is a pending request, not a confirmed appointment.
              </p>
              <dl className={styles.confirmationDetails}>
                <div>
                  <dt>Treatment</dt>
                  <dd>{confirmation.serviceName}</dd>
                </div>
                <div>
                  <dt>Appointment</dt>
                  <dd>
                    {formatLocalDate(confirmation.localDate)} ·{" "}
                    {confirmation.localTime} Dublin time
                  </dd>
                </div>
                <div>
                  <dt>Duration & price</dt>
                  <dd>
                    {formatDuration(confirmation.durationMinutes)} ·{" "}
                    {formatPrice(confirmation.priceCents / 100)}
                  </dd>
                </div>
              </dl>
              <button
                className={styles.secondaryAction}
                onClick={startAnotherBooking}
                type="button"
              >
                Book Now
              </button>
            </div>
          ) : (
            <>
              <fieldset
                className={styles.fieldset}
                disabled={submissionState === "submitting"}
              >
                <legend>
                  <span className={styles.stepNumber}>1</span>
                  <span>
                    <strong>Select a treatment</strong>
                    <small>Choose the massage that best suits your visit.</small>
                  </span>
                </legend>

                <div className={styles.serviceGrid}>
                  {services.map((service) => {
                    const inputId = `booking-service-${service.id}`;

                    return (
                      <label
                        className={styles.optionLabel}
                        htmlFor={inputId}
                        key={service.id}
                      >
                        <input
                          checked={selectedService.id === service.id}
                          className={styles.radioInput}
                          id={inputId}
                          name="service"
                          onChange={() => selectService(service.id)}
                          type="radio"
                          value={service.id}
                        />
                        <span className={styles.serviceOption}>
                          <span className={styles.optionTopline}>
                            <strong>{service.name}</strong>
                            <span className={styles.optionPrice}>
                              {formatPriceRange(service.pricing)}
                            </span>
                          </span>
                          <span className={styles.optionDescription}>
                            {service.shortDescription}
                          </span>
                          <span className={styles.choiceMark} aria-hidden="true" />
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset
                className={styles.fieldset}
                disabled={submissionState === "submitting"}
              >
                <legend>
                  <span className={styles.stepNumber}>2</span>
                  <span>
                    <strong>Choose a duration</strong>
                    <small>Prices update with the treatment length.</small>
                  </span>
                </legend>

                <div className={styles.durationGrid}>
                  {durationOptions.map((option) => {
                    const inputId = `booking-duration-${selectedService.id}-${option.durationMinutes}`;

                    return (
                      <label
                        className={styles.optionLabel}
                        htmlFor={inputId}
                        key={option.durationMinutes}
                      >
                        <input
                          checked={selectedDuration === option.durationMinutes}
                          className={styles.radioInput}
                          id={inputId}
                          name="duration"
                          onChange={() =>
                            selectDuration(option.durationMinutes)
                          }
                          type="radio"
                          value={option.durationMinutes}
                        />
                        <span className={styles.durationOption}>
                          <strong>
                            {formatDuration(option.durationMinutes)}
                          </strong>
                          <span>{formatPrice(option.priceEur)}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <fieldset
                className={styles.fieldset}
                disabled={submissionState === "submitting"}
              >
                <legend>
                  <span className={styles.stepNumber}>3</span>
                  <span>
                    <strong>Choose a preferred date & time</strong>
                    <small>
                      Fully booked and blocked times are removed automatically.
                    </small>
                  </span>
                </legend>

                <input
                  name="preferredDate"
                  type="hidden"
                  value={preferredDate}
                />

                <div className={styles.appointmentPicker}>
                  <BookingCalendar
                    disabled={submissionState === "submitting"}
                    durationMinutes={selectedDuration}
                    minimumDate={minimumDate}
                    onSelectDate={selectDate}
                    refreshKey={availabilityRefresh}
                    selectedDate={preferredDate}
                    serviceId={selectedService.id}
                  />

                  <section
                    aria-labelledby="available-time-title"
                    className={styles.timePicker}
                  >
                    <header className={styles.timePickerHeader}>
                      <span className={styles.timeIcon} aria-hidden="true">
                        <Clock3 />
                      </span>
                      <div>
                        <span>Available times</span>
                        <h4 id="available-time-title">
                          {preferredDate
                            ? formatLocalDate(preferredDate)
                            : "Select an available day"}
                        </h4>
                      </div>
                    </header>

                    {!preferredDate ? (
                      <div className={styles.timePlaceholder}>
                        <span aria-hidden="true">01</span>
                        <p>
                          Choose a purple <strong>Available</strong> day to see
                          its Dublin appointment times.
                        </p>
                      </div>
                    ) : availabilityState === "loading" ? (
                      <div
                        aria-label="Checking available appointment times"
                        className={styles.timeLoadingGrid}
                        role="status"
                      >
                        {Array.from({ length: 6 }, (_, index) => (
                          <span aria-hidden="true" key={index} />
                        ))}
                      </div>
                    ) : availabilityState === "error" ? (
                      <div className={styles.timeEmpty}>
                        <strong>Times could not be checked</strong>
                        <p>Please retry. No appointment has been reserved.</p>
                        <button
                          onClick={() =>
                            setAvailabilityRefresh((value) => value + 1)
                          }
                          type="button"
                        >
                          <RotateCw aria-hidden="true" /> Retry times
                        </button>
                      </div>
                    ) : availabilityState === "disabled" ? (
                      <div className={styles.timeEmpty}>
                        <strong>Online times are not live yet</strong>
                        <p>Contact Siriranee and the team will arrange a time.</p>
                      </div>
                    ) : availableSlots.length ? (
                      <div
                        aria-labelledby="available-time-title"
                        className={styles.timeSlotGrid}
                        role="radiogroup"
                      >
                        {availableSlots.map((slot) => {
                          const inputId = `booking-time-${slot.slotId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

                          return (
                            <label
                              className={styles.timeOption}
                              htmlFor={inputId}
                              key={slot.slotId}
                            >
                              <input
                                checked={selectedTime === slot.localTime}
                                className={styles.timeRadio}
                                disabled={submissionState === "submitting"}
                                id={inputId}
                                name="preferredTime"
                                onChange={() => selectTime(slot.localTime)}
                                required={directBookingAvailable}
                                type="radio"
                                value={slot.localTime}
                              />
                              <span className={styles.timeOptionContent}>
                                <strong>{slot.localTimeLabel}</strong>
                                <small>Dublin time</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={styles.timeEmpty}>
                        <strong>No times available</strong>
                        <p>Choose another available day in the calendar.</p>
                      </div>
                    )}

                    <p
                      aria-live="polite"
                      className={styles.availabilityMessage}
                      role={
                        availabilityState === "error" ? "alert" : "status"
                      }
                    >
                      {availabilityMessage}
                    </p>
                  </section>
                </div>
              </fieldset>

              {submissionState === "error" ? (
                <div
                  className={styles.formError}
                  ref={errorRef}
                  role="alert"
                  tabIndex={-1}
                >
                  <strong>We could not send this request.</strong>
                  <p>{submissionMessage}</p>
                  <Link href={contactPreferenceHref}>
                    Contact Siriranee with these preferences
                  </Link>
                </div>
              ) : null}

              {directBookingAvailable && selectedTime ? (
                <fieldset
                  className={styles.fieldset}
                  disabled={submissionState === "submitting"}
                >
                  <legend>
                    <span className={styles.stepNumber}>4</span>
                    <span>
                      <strong>Your contact details</strong>
                      <small>
                        Siriranee uses these details only to manage your request.
                      </small>
                    </span>
                  </legend>

                  <div className={styles.customerGrid}>
                    <label className={styles.bookingField}>
                      Name
                      <input
                        aria-describedby={
                          fieldErrors.customerName
                            ? "customer-name-error"
                            : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.customerName)}
                        autoComplete="name"
                        maxLength={100}
                        minLength={2}
                        name="customerName"
                        required
                        type="text"
                      />
                      {fieldErrors.customerName ? (
                        <span
                          className={styles.fieldError}
                          id="customer-name-error"
                        >
                          {fieldErrors.customerName}
                        </span>
                      ) : null}
                    </label>

                    <label className={styles.bookingField}>
                      Phone
                      <input
                        aria-describedby={
                          fieldErrors.phone ? "customer-phone-error" : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.phone)}
                        autoComplete="tel"
                        inputMode="tel"
                        maxLength={30}
                        minLength={7}
                        name="phone"
                        required
                        type="tel"
                      />
                      {fieldErrors.phone ? (
                        <span
                          className={styles.fieldError}
                          id="customer-phone-error"
                        >
                          {fieldErrors.phone}
                        </span>
                      ) : null}
                    </label>

                    <label className={styles.bookingField}>
                      Email <span className={styles.optional}>(optional)</span>
                      <input
                        aria-describedby={
                          fieldErrors.email ? "customer-email-error" : undefined
                        }
                        aria-invalid={Boolean(fieldErrors.email)}
                        autoComplete="email"
                        maxLength={254}
                        name="email"
                        type="email"
                      />
                      {fieldErrors.email ? (
                        <span
                          className={styles.fieldError}
                          id="customer-email-error"
                        >
                          {fieldErrors.email}
                        </span>
                      ) : null}
                    </label>

                    <label
                      className={`${styles.bookingField} ${styles.bookingFieldFull}`}
                    >
                      Notes <span className={styles.optional}>(optional)</span>
                      <textarea
                        maxLength={600}
                        name="notes"
                        placeholder="Comfort, accessibility or appointment notes"
                        rows={4}
                      />
                    </label>
                  </div>

                  <label className={styles.privacyChoice}>
                    <input name="privacyAccepted" required type="checkbox" />
                    <span>
                      I have read the{" "}
                      <Link href="/privacy">privacy notice</Link> and understand
                      that this is a pending request until Siriranee confirms it.
                    </span>
                  </label>

                  <label aria-hidden="true" className={styles.websiteField}>
                    Website
                    <input
                      autoComplete="off"
                      name="website"
                      tabIndex={-1}
                      type="text"
                    />
                  </label>
                </fieldset>
              ) : null}
            </>
          )}
        </div>

        <aside
          aria-labelledby="booking-summary-title"
          className={styles.summaryCard}
        >
          <div className={styles.summaryHeading}>
            <p className={styles.summaryEyebrow}>Your booking</p>
            <h3 id="booking-summary-title">Review your preferences</h3>
          </div>

          <div className={styles.summaryBody}>
            <dl className={styles.summaryList}>
              <div>
                <dt>Treatment</dt>
                <dd>{selectedService.name}</dd>
              </div>
              <div>
                <dt>Duration</dt>
                <dd>
                  {selectedDurationOption
                    ? formatDuration(selectedDurationOption.durationMinutes)
                    : "Contact for details"}
                </dd>
              </div>
              <div>
                <dt>Preferred appointment</dt>
                <dd>{appointmentLabel}</dd>
              </div>
            </dl>

            {availabilityMode !== "live" && selectedService.bookingNotice ? (
              <div className={styles.serviceNote}>
                <p>{selectedService.bookingNotice}</p>
              </div>
            ) : null}

            <div className={styles.totalRow}>
              <span>Listed treatment price</span>
              <strong>
                {selectedDurationOption
                  ? formatPrice(selectedDurationOption.priceEur)
                  : "Contact the spa"}
              </strong>
            </div>
          </div>

          {!confirmation && directBookingAvailable ? (
            <button
              className={styles.primaryAction}
              disabled={!selectedTime || submissionState === "submitting"}
              type="submit"
            >
              {submissionState === "submitting"
                ? "Sending request..."
                : selectedTime
                  ? "Send secure booking request"
                  : "Choose a time to continue"}
              <span aria-hidden="true">→</span>
            </button>
          ) : !confirmation && externalCalendarAvailable ? (
            <button
              aria-describedby="live-calendar-note"
              className={styles.primaryAction}
              onClick={openLiveCalendar}
              type="button"
            >
              View live dates & times
              <span aria-hidden="true">↓</span>
            </button>
          ) : !confirmation ? (
            <Link
              aria-describedby="live-calendar-note"
              className={styles.primaryAction}
              href={contactPreferenceHref}
            >
              Contact to request this appointment
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          <div className={styles.calendarNotice} id="live-calendar-note">
            <span className={styles.noticeIcon} aria-hidden="true">
              i
            </span>
            <p>
              {confirmation
                ? submissionMessage
                : directBookingAvailable
                  ? "Your details are encrypted before storage. The request remains pending until the Siriranee team confirms it; staff assignment is internal."
                  : externalCalendarAvailable
                    ? "Personal details are entered directly with the configured provider. Its staff-selection settings must be verified before launch."
                    : "This booking page stores no personal information. A preferred time is not confirmed until the Siriranee team replies."}
            </p>
          </div>
        </aside>
      </form>

      {calendarRequested && schedulerDirectUrl && schedulerEmbedUrl ? (
        <AcuityScheduler
          directUrl={schedulerDirectUrl}
          embedUrl={schedulerEmbedUrl}
          key={schedulerEmbedUrl}
          selectionLabel={selectionLabel}
        />
      ) : null}
    </section>
  );
}
