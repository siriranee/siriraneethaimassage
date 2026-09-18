"use client";

import Image from "next/image";
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
  readonly pricing: readonly PricePoint[];
};

export type BookingPlannerTherapist = {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: string;
  readonly shortBio: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly serviceIds: readonly string[];
};

type BookingPlannerProps = {
  readonly services: readonly BookingPlannerService[];
  readonly therapists: readonly BookingPlannerTherapist[];
  readonly initialServiceSlug?: string;
  readonly initialTherapistSlug?: string;
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

type UnavailableSelectedTime = Pick<
  PublicSlot,
  "localTime" | "localTimeLabel"
>;

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
  readonly therapistName: string;
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
    return "Price unavailable";
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

function therapistInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
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
  therapists,
  initialServiceSlug,
  initialTherapistSlug,
  initialDuration,
  initialDate,
  initialTime,
}: BookingPlannerProps) {
  const requestedService = services.find(
    (service) => service.slug === initialServiceSlug,
  );
  const requestedTherapistBySlug = therapists.find(
    (therapist) => therapist.slug === initialTherapistSlug,
  );
  const firstService =
    requestedService ??
    (requestedTherapistBySlug
      ? services.find((service) =>
          requestedTherapistBySlug.serviceIds.includes(service.id),
        )
      : undefined) ??
    services[0];
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
  const firstEligibleTherapists = firstService
    ? therapists.filter((therapist) =>
        therapist.serviceIds.includes(firstService.id),
      )
    : [];
  const requestedTherapist = firstEligibleTherapists.find(
    (therapist) => therapist.slug === initialTherapistSlug,
  );
  const firstTherapist = requestedTherapist ?? firstEligibleTherapists[0];

  const [selectedServiceId, setSelectedServiceId] = useState(
    firstService?.id ?? "",
  );
  const [selectedDuration, setSelectedDuration] = useState(firstDuration);
  const [selectedTherapistId, setSelectedTherapistId] = useState(
    firstTherapist?.id ?? "",
  );
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
  const [unavailableSelectedTime, setUnavailableSelectedTime] =
    useState<UnavailableSelectedTime | null>(null);
  const [availabilityMode, setAvailabilityMode] =
    useState<AvailabilityMode | null>(null);
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0);
  const [availabilityState, setAvailabilityState] = useState<
    "idle" | "loading" | "ready" | "disabled" | "error"
  >(initialDate ? "loading" : "idle");
  const [availabilityMessage, setAvailabilityMessage] = useState("");
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
  const eligibleTherapists = selectedService
    ? therapists.filter((therapist) =>
        therapist.serviceIds.includes(selectedService.id),
      )
    : [];
  const selectedTherapist =
    eligibleTherapists.find(
      (therapist) => therapist.id === selectedTherapistId,
    ) ?? eligibleTherapists[0];
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
  const displayedTimeSlots = [
    ...availableSlots.map((slot) => ({
      kind: "available" as const,
      localTime: slot.localTime,
      localTimeLabel: slot.localTimeLabel,
      slotId: slot.slotId,
    })),
    ...(unavailableSelectedTime
      ? [
          {
            kind: "unavailable" as const,
            localTime: unavailableSelectedTime.localTime,
            localTimeLabel: unavailableSelectedTime.localTimeLabel,
            slotId: `unavailable-${unavailableSelectedTime.localTime}`,
          },
        ]
      : []),
  ].sort((first, second) => first.localTime.localeCompare(second.localTime));
  const contactPreferenceHref = selectedService
    ? buildContactPreferenceHref({
        serviceSlug: selectedService.slug,
        durationMinutes: selectedDuration,
        preferredDate: preferredDate || undefined,
        preferredTime: selectedTime || undefined,
        therapistSlug: selectedTherapist?.slug,
      })
    : "/contact";
  const selectionLabel = selectedService
    ? `${selectedService.name} · ${
        selectedDurationOption
          ? formatDuration(selectedDurationOption.durationMinutes)
          : "duration in calendar"
      }${selectedTherapist ? ` · ${selectedTherapist.name}` : ""}`
    : "Massage appointment";

  useEffect(() => {
    if (
      !preferredDate ||
      !selectedDuration ||
      !selectedService ||
      !selectedTherapist
    ) return;

    const controller = new AbortController();
    const params = new URLSearchParams({
      serviceId: selectedService.id,
      durationMinutes: String(selectedDuration),
      localDate: preferredDate,
      therapistId: selectedTherapist.id,
    });

    void fetch(`/api/public/availability?${params.toString()}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = (await response.json()) as PublicAvailabilityResponse;
        if (!response.ok) throw new Error(result.message);

        const slots = result.slots ?? [];
        const selectedTimeStillAvailable = selectedTime
          ? slots.some((slot) => slot.localTime === selectedTime)
          : true;
        setAvailableSlots(slots);
        setAvailabilityMode(result.status);
        setAvailabilityMessage(
          selectedTime && !selectedTimeStillAvailable
            ? `${selectedTime} is no longer available. Choose another time.`
            : result.message,
        );
        setAvailabilityState(
          result.status === "disabled" ? "disabled" : "ready",
        );
        if (selectedTime && !selectedTimeStillAvailable) {
          setUnavailableSelectedTime({
            localTime: selectedTime,
            localTimeLabel: selectedTime,
          });
          setSelectedTime("");
        } else {
          setUnavailableSelectedTime((current) =>
            current &&
            slots.some((slot) => slot.localTime === current.localTime)
              ? null
              : current,
          );
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setAvailableSlots([]);
        setUnavailableSelectedTime(null);
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
    selectedTherapist,
    selectedTime,
  ]);

  useEffect(() => {
    if (
      !preferredDate ||
      !selectedDuration ||
      !selectedService ||
      !selectedTherapist ||
      confirmation ||
      submissionState === "submitting"
    ) {
      return;
    }

    const refreshAvailability = () => {
      setAvailabilityRefresh((value) => value + 1);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshAvailability();
    };
    const refreshInterval = window.setInterval(refreshAvailability, 30_000);

    window.addEventListener("focus", refreshAvailability);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.clearInterval(refreshInterval);
      window.removeEventListener("focus", refreshAvailability);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [
    confirmation,
    preferredDate,
    selectedDuration,
    selectedService,
    selectedTherapist,
    submissionState,
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
        <h2 id="booking-title">Booking is temporarily unavailable</h2>
        <p>Please try again later. No appointment information was submitted.</p>
        <Link className={styles.primaryAction} href="/visit">
          View confirmed location <span aria-hidden="true">→</span>
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
    const nextEligibleTherapists = nextService
      ? therapists.filter((therapist) =>
          therapist.serviceIds.includes(nextService.id),
        )
      : [];
    const nextTherapist =
      nextEligibleTherapists.find(
        (therapist) => therapist.id === selectedTherapistId,
      ) ?? nextEligibleTherapists[0];

    setSelectedServiceId(serviceId);
    setSelectedDuration(
      nextService
        ? (getDurationOptions(nextService)[0]?.durationMinutes ?? 0)
        : 0,
    );
    setSelectedTherapistId(nextTherapist?.id ?? "");
    setPreferredDate("");
    setSelectedTime("");
    setUnavailableSelectedTime(null);
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityState("idle");
    resetSubmission();
  }

  function selectDuration(durationMinutes: number) {
    setSelectedDuration(durationMinutes);
    setSelectedTime("");
    setUnavailableSelectedTime(null);
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityState(preferredDate ? "loading" : "idle");
    resetSubmission();
  }

  function selectTherapist(therapistId: string) {
    setSelectedTherapistId(therapistId);
    setPreferredDate("");
    setSelectedTime("");
    setUnavailableSelectedTime(null);
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityMessage("");
    setAvailabilityState("idle");
    resetSubmission();
  }

  function selectDate(value: string) {
    setPreferredDate(value);
    setSelectedTime("");
    setUnavailableSelectedTime(null);
    setAvailableSlots([]);
    setAvailabilityMode(null);
    setAvailabilityMessage(
      value ? "Checking times..." : "",
    );
    setAvailabilityState(value ? "loading" : "idle");
    resetSubmission();
  }

  function selectTime(value: string) {
    setSelectedTime(value);
    setUnavailableSelectedTime(null);
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
      !selectedTherapist ||
      submissionState === "submitting"
    ) {
      return;
    }

    const form = event.currentTarget;
    const data = new FormData(form);
    idempotencyKeyRef.current ||= createIdempotencyKey();
    setSubmissionState("submitting");
    setSubmissionMessage("Sending your request...");
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
          therapistId: selectedTherapist.id,
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
          setUnavailableSelectedTime({
            localTime: selectedTime,
            localTimeLabel: selectedTimeSlot?.localTimeLabel ?? selectedTime,
          });
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
        "Request received. Siriranee will contact you to confirm.",
      );
    } catch {
      setSubmissionState("error");
      setSubmissionMessage(
        "We could not confirm whether the request reached Siriranee. Check your connection and retry once. If the problem continues, please return later.",
      );
    }
  }

  function startAnotherBooking() {
    formRef.current?.reset();
    setSelectedTime("");
    setUnavailableSelectedTime(null);
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
        <h2 id="booking-planner-title">Choose your appointment</h2>
      </div>

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
              <h3>Request received</h3>
               <p>
                 Reference: <strong>{confirmation.reference}</strong>. We’ll
                 contact you to confirm. Until then, another customer may request
                 the same time.
              </p>
              <dl className={styles.confirmationDetails}>
                <div>
                  <dt>Treatment</dt>
                  <dd>{confirmation.serviceName}</dd>
                </div>
                <div>
                  <dt>Massage therapist</dt>
                  <dd>{confirmation.therapistName}</dd>
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
                Book another massage
              </button>
            </div>
          ) : (
            <>
              <fieldset
                className={styles.fieldset}
                disabled={submissionState === "submitting"}
              >
                <legend>
                  <span>
                    <strong>Treatment</strong>
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
                  <span>
                    <strong>Massage therapist</strong>
                    <small>Choose who you would like to see for this treatment.</small>
                  </span>
                </legend>

                {eligibleTherapists.length ? (
                  <div className={styles.therapistGrid}>
                    {eligibleTherapists.map((therapist) => {
                      const inputId = `booking-therapist-${therapist.id}`;

                      return (
                        <label
                          className={styles.optionLabel}
                          htmlFor={inputId}
                          key={therapist.id}
                        >
                          <input
                            checked={selectedTherapist?.id === therapist.id}
                            className={styles.radioInput}
                            id={inputId}
                            name="therapistId"
                            onChange={() => selectTherapist(therapist.id)}
                            required
                            type="radio"
                            value={therapist.id}
                          />
                          <span className={styles.therapistOption}>
                            <span className={styles.therapistPortrait}>
                              {therapist.imageUrl ? (
                                <Image
                                  alt={therapist.imageAlt || therapist.name}
                                  height={80}
                                  sizes="80px"
                                  src={therapist.imageUrl}
                                  width={80}
                                />
                              ) : (
                                <span aria-hidden="true">
                                  {therapistInitials(therapist.name)}
                                </span>
                              )}
                            </span>
                            <span className={styles.therapistCopy}>
                              <strong>{therapist.name}</strong>
                              <span>{therapist.role}</span>
                              {therapist.shortBio ? (
                                <small>{therapist.shortBio}</small>
                              ) : null}
                            </span>
                            <span className={styles.choiceMark} aria-hidden="true" />
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.therapistEmpty} role="status">
                    <strong>No therapist is available for this treatment yet.</strong>
                    <span>Please choose another treatment or contact Siriranee.</span>
                  </div>
                )}
                {fieldErrors.therapistId ? (
                  <span className={styles.fieldError} role="alert">
                    {fieldErrors.therapistId}
                  </span>
                ) : null}
              </fieldset>

              <fieldset
                className={styles.fieldset}
                disabled={submissionState === "submitting"}
              >
                <legend>
                  <span>
                    <strong>Duration</strong>
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
                  <span>
                    <strong>Date &amp; time</strong>
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
                    therapistId={selectedTherapist?.id ?? ""}
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
                        <span>
                          Available times for {selectedTherapist?.name ?? "your therapist"} · Dublin time
                        </span>
                        <h4 id="available-time-title">
                          {preferredDate
                            ? formatLocalDate(preferredDate)
                            : "No day selected"}
                        </h4>
                      </div>
                    </header>

                    {!selectedTherapist ? (
                      <div className={styles.timePlaceholder}>
                        <Clock3 aria-hidden="true" />
                        <p>Choose a therapist before selecting a day and time.</p>
                      </div>
                    ) : !preferredDate ? (
                      <div className={styles.timePlaceholder}>
                        <Clock3 aria-hidden="true" />
                        <p>Select a day to see times.</p>
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
                        <p>Confirmed appointment options will appear here when they are ready.</p>
                      </div>
                    ) : displayedTimeSlots.length ? (
                      <div
                        aria-labelledby="available-time-title"
                        className={styles.timeSlotGrid}
                        role="radiogroup"
                      >
                        {displayedTimeSlots.map((slot) => {
                          const inputId = `booking-time-${slot.slotId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

                          if (slot.kind === "unavailable") {
                            return (
                              <label
                                className={`${styles.timeOption} ${styles.timeOptionGhost}`}
                                htmlFor={inputId}
                                key={slot.slotId}
                              >
                                <input
                                  aria-label={`${slot.localTimeLabel}, no longer available`}
                                  className={styles.timeRadio}
                                  disabled
                                  id={inputId}
                                  name="preferredTime"
                                  type="radio"
                                  value={slot.localTime}
                                />
                                <span className={styles.timeOptionContent}>
                                  <strong>{slot.localTimeLabel}</strong>
                                  <small>No longer available</small>
                                </span>
                              </label>
                            );
                          }

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
                      className="sr-only"
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
                    View current contact options
                  </Link>
                </div>
              ) : null}

              {directBookingAvailable && selectedTime ? (
                <fieldset
                  className={styles.fieldset}
                  disabled={submissionState === "submitting"}
                >
                  <legend>
                    <span>
                      <strong>Your contact details</strong>
                      <small>Used only for your booking.</small>
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
                       that this pending request does not reserve the time until
                       Siriranee confirms it.
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
            <h3 id="booking-summary-title">Your booking</h3>
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
                <dt>Massage therapist</dt>
                <dd>{selectedTherapist?.name ?? "Not selected yet"}</dd>
              </div>
              <div>
                <dt>Date &amp; time</dt>
                <dd>{appointmentLabel}</dd>
              </div>
            </dl>

            <div className={styles.totalRow}>
              <span>Price</span>
              <strong>
                {selectedDurationOption
                  ? formatPrice(selectedDurationOption.priceEur)
                  : "Price unavailable"}
              </strong>
            </div>
          </div>

          {!confirmation && directBookingAvailable ? (
            <button
              className={styles.primaryAction}
              disabled={
                !selectedTime ||
                !selectedTherapist ||
                submissionState === "submitting"
              }
              type="submit"
            >
              {submissionState === "submitting"
                ? "Sending request..."
                : selectedTime
                  ? "Send booking request"
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
              Request appointment
              <span aria-hidden="true">→</span>
            </Link>
          ) : null}

          <div className={styles.calendarNotice} id="live-calendar-note">
            <p>
              {confirmation
                ? submissionMessage
                : directBookingAvailable
                  ? "Your details are encrypted. Siriranee will confirm your request."
                  : externalCalendarAvailable
                    ? "Complete your booking securely with the booking provider."
                    : "Your selection is not confirmed until Siriranee replies."}
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
