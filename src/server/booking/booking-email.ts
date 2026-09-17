import "server-only";

import type { CmsBooking } from "@/domain/cms/types";

const unsafeDisplayCharacters =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

type BookingEmailInput = Pick<
  CmsBooking,
  | "id"
  | "reference"
  | "customer"
  | "serviceName"
  | "durationMinutes"
  | "priceCents"
  | "currency"
  | "localDate"
  | "localTime"
  | "timezone"
  | "capacityExpiresAt"
  | "assignedStaffName"
  | "createdAt"
>;

type CustomerBookingEmailInput = Pick<
  CmsBooking,
  | "id"
  | "reference"
  | "serviceName"
  | "durationMinutes"
  | "priceCents"
  | "currency"
  | "localDate"
  | "localTime"
  | "timezone"
> & {
  readonly customer: Pick<CmsBooking["customer"], "name" | "email">;
  readonly assignedStaffName?: string;
};

export type TherapistBookingEmailEvent =
  | "assigned"
  | "rescheduled"
  | "removed"
  | "cancelled";

export type TherapistBookingEmailInput = Pick<
  CmsBooking,
  | "reference"
  | "assignedStaffId"
  | "serviceName"
  | "durationMinutes"
  | "localDate"
  | "localTime"
  | "timezone"
  | "status"
>;

export type CustomerBookingEmailBusiness = {
  readonly name: string;
  readonly address: string;
  readonly phone?: string;
  readonly email?: string;
  readonly arrivalGuidance?: string;
  readonly directionsUrl?: string;
  readonly siteOrigin?: string;
};

export type BookingEmailMessage = {
  readonly subject: string;
  readonly html: string;
  readonly text: string;
};

function cleanDisplayText(value: string, multiline = false) {
  const normalized = value
    .normalize("NFC")
    .replace(unsafeDisplayCharacters, "")
    .replace(/\r\n?/g, "\n");

  return multiline
    ? normalized
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim()
    : normalized.replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeHtmlMultiline(value: string) {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function civilDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day, 12));
  return Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
    ? null
    : date;
}

function formatBookingDate(value: string, locale: string) {
  const date = civilDate(value);
  if (!date) return value;

  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatDublinTimestamp(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "Europe/Dublin",
  }).format(date);
}

function formatPrice(priceCents: number, currency: string, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(priceCents / 100);
}

function detailRow(label: string, value: string, direction = false) {
  return `<tr>
    <th scope="row" style="width:38%;padding:10px 12px 10px 0;border-bottom:1px solid #eadfca;color:#675d64;font-size:14px;font-weight:600;line-height:1.45;text-align:left;vertical-align:top;">${escapeHtml(label)}</th>
    <td${direction ? ' dir="auto"' : ""} style="padding:10px 0;border-bottom:1px solid #eadfca;color:#2b2028;font-size:15px;font-weight:600;line-height:1.5;text-align:left;vertical-align:top;overflow-wrap:anywhere;">${escapeHtmlMultiline(value)}</td>
  </tr>`;
}

function section(input: {
  readonly language: "th" | "en-IE";
  readonly eyebrow: string;
  readonly heading: string;
  readonly introduction: string;
  readonly statusLabel: string;
  readonly statusValue: string;
  readonly appointmentHeading: string;
  readonly appointmentRows: readonly (readonly [string, string])[];
  readonly customerHeading: string;
  readonly customerRows: readonly (readonly [string, string, boolean?])[];
  readonly requestHeading: string;
  readonly requestRows: readonly (readonly [string, string])[];
  readonly warning: string;
  readonly buttonLabel: string;
  readonly cmsBookingUrl?: string;
}) {
  const button = input.cmsBookingUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;"><tr><td style="border-radius:999px;background:#6e2aa0;"><a href="${escapeHtml(input.cmsBookingUrl)}" style="display:inline-block;padding:13px 22px;color:#fffdf7;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(input.buttonLabel)}</a></td></tr></table>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td lang="${input.language}" style="padding:30px 30px 32px;">
    <p style="margin:0 0 7px;color:#7a590d;font-size:12px;font-weight:800;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
    <h1 style="margin:0;color:#5c2288;font-size:26px;line-height:1.25;">${escapeHtml(input.heading)}</h1>
    <p style="margin:12px 0 20px;color:#3c3340;font-size:16px;line-height:1.65;">${escapeHtml(input.introduction)}</p>
    <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #e1c65f;border-radius:12px;background:#f8f0ce;">
      <span style="display:block;margin-bottom:3px;color:#7a590d;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${escapeHtml(input.statusLabel)}</span>
      <strong style="color:#5c2288;font-size:18px;line-height:1.35;">${escapeHtml(input.statusValue)}</strong>
    </div>
    <h2 style="margin:0 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">${escapeHtml(input.appointmentHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.appointmentRows.map(([label, value]) => detailRow(label, value)).join("")}</table>
    <h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">${escapeHtml(input.customerHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.customerRows.map(([label, value, direction]) => detailRow(label, value, direction)).join("")}</table>
    <h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">${escapeHtml(input.requestHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.requestRows.map(([label, value]) => detailRow(label, value)).join("")}</table>
    <p style="margin:22px 0 0;padding-left:13px;border-left:4px solid #d5b350;color:#5c2288;font-size:15px;font-weight:700;line-height:1.55;">${escapeHtml(input.warning)}</p>
    ${button}
  </td></tr></table>`;
}

export function renderOwnerBookingRequestedEmail(
  booking: BookingEmailInput,
  options: { readonly cmsBookingUrl?: string } = {},
): BookingEmailMessage {
  const customerName = cleanDisplayText(booking.customer.name);
  const customerPhone = cleanDisplayText(booking.customer.phone);
  const customerEmail = cleanDisplayText(booking.customer.email);
  const customerNotes = cleanDisplayText(booking.customer.notes, true);
  const serviceName = cleanDisplayText(booking.serviceName);
  const reference = cleanDisplayText(booking.reference);
  const bookingId = cleanDisplayText(booking.id);
  const localTime = cleanDisplayText(booking.localTime);
  const therapistName = cleanDisplayText(booking.assignedStaffName);
  const cmsBookingUrl = options.cmsBookingUrl
    ? cleanDisplayText(options.cmsBookingUrl)
    : undefined;

  const thaiDate = formatBookingDate(
    booking.localDate,
    "th-TH-u-ca-gregory-nu-latn",
  );
  const englishDate = formatBookingDate(booking.localDate, "en-IE");
  const thaiPrice = formatPrice(
    booking.priceCents,
    booking.currency,
    "th-TH-u-ca-gregory-nu-latn",
  );
  const englishPrice = formatPrice(
    booking.priceCents,
    booking.currency,
    "en-IE",
  );
  const thaiRequestedAt = formatDublinTimestamp(
    booking.createdAt,
    "th-TH-u-ca-gregory-nu-latn",
  );
  const englishRequestedAt = formatDublinTimestamp(booking.createdAt, "en-IE");
  const thaiHoldUntil = formatDublinTimestamp(
    booking.capacityExpiresAt,
    "th-TH-u-ca-gregory-nu-latn",
  );
  const englishHoldUntil = formatDublinTimestamp(
    booking.capacityExpiresAt,
    "en-IE",
  );

  const thai = section({
    language: "th",
    eyebrow: "การจองผ่านเว็บไซต์",
    heading: "มีคำขอจองใหม่",
    introduction: "ลูกค้าส่งคำขอจองผ่านเว็บไซต์ กรุณาตรวจสอบรายละเอียดและติดต่อกลับเพื่อยืนยันนัดหมาย",
    statusLabel: "สถานะเมื่อส่งคำขอ",
    statusValue: "รอการยืนยัน",
    appointmentHeading: "รายละเอียดนัดหมาย",
    appointmentRows: [
      ["รหัสการจอง", reference],
      ["บริการ", serviceName],
      ["ระยะเวลา", `${booking.durationMinutes} นาที`],
      ["วันที่", thaiDate],
      ["เวลา", `${localTime} น. (เวลาดับลิน)`],
      ["นักบำบัด", therapistName || "ยังไม่ได้ระบุ"],
      ["ราคา", thaiPrice],
    ],
    customerHeading: "ข้อมูลลูกค้า",
    customerRows: [
      ["ชื่อ", customerName, true],
      ["โทรศัพท์", customerPhone, true],
      ["อีเมล", customerEmail || "ไม่ได้ระบุ", true],
      ["หมายเหตุ", customerNotes || "ไม่ได้ระบุ", true],
    ],
    requestHeading: "ข้อมูลคำขอ",
    requestRows: [
      ["รหัสภายใน", bookingId],
      ["ส่งคำขอเมื่อ", `${thaiRequestedAt} (เวลาดับลิน)`],
      ["กันคิวชั่วคราวถึง", `${thaiHoldUntil} (เวลาดับลิน)`],
    ],
    warning: "อีเมลนี้บันทึกข้อมูลตอนลูกค้าส่งคำขอ กรุณาเปิด CMS เพื่อดูสถานะล่าสุด หากยืนยันแล้ว ไม่ต้องยืนยันซ้ำ",
    buttonLabel: "เปิดรายการจองใน CMS",
    cmsBookingUrl,
  });

  const english = section({
    language: "en-IE",
    eyebrow: "Website booking",
    heading: "New booking request",
    introduction: "A customer submitted a booking request through the website. Review the details and contact them to confirm the appointment.",
    statusLabel: "Status when requested",
    statusValue: "Pending confirmation",
    appointmentHeading: "Appointment details",
    appointmentRows: [
      ["Booking reference", reference],
      ["Treatment", serviceName],
      ["Duration", `${booking.durationMinutes} minutes`],
      ["Date", englishDate],
      ["Time", `${localTime} (Dublin time)`],
      ["Massage therapist", therapistName || "Not assigned"],
      ["Price", englishPrice],
    ],
    customerHeading: "Customer details",
    customerRows: [
      ["Name", customerName, true],
      ["Phone", customerPhone, true],
      ["Email", customerEmail || "Not provided", true],
      ["Notes", customerNotes || "Not provided", true],
    ],
    requestHeading: "Request information",
    requestRows: [
      ["Internal booking ID", bookingId],
      ["Submitted", `${englishRequestedAt} (Dublin time)`],
      ["Temporary capacity held until", `${englishHoldUntil} (Dublin time)`],
    ],
    warning: "This email records the original request. Open the CMS for the latest status. If it is already confirmed, no further confirmation is needed.",
    buttonLabel: "Open booking in CMS",
    cmsBookingUrl,
  });

  const html = `<!doctype html>
<html lang="th">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(`คำขอจองใหม่ / New booking request · ${reference}`)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f4ea;color:#2b2028;font-family:Tahoma,'Noto Sans Thai',Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f9f4ea;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border:1px solid #e6d9be;border-radius:18px;border-collapse:separate;overflow:hidden;background:#fffdf7;box-shadow:0 12px 36px rgba(43,32,40,.10);">
            <tr><td lang="en-IE" style="padding:18px 30px;background:#5c2288;color:#fffdf7;font-size:17px;font-weight:800;line-height:1.4;">Siriranee Thai Massage</td></tr>
            <tr><td>${thai}</td></tr>
            <tr><td style="height:1px;background:#d8c7d7;"></td></tr>
            <tr><td>${english}</td></tr>
            <tr><td lang="en-IE" style="padding:17px 30px;background:#efe4f7;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This operational email was generated automatically from a website booking request.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `คำขอจองใหม่ — Siriranee Thai Massage

สถานะเมื่อส่งคำขอ: รอการยืนยัน
ลูกค้าส่งคำขอจองผ่านเว็บไซต์ กรุณาตรวจสอบรายละเอียดและติดต่อกลับเพื่อยืนยันนัดหมาย

รายละเอียดนัดหมาย
รหัสการจอง: ${reference}
บริการ: ${serviceName}
ระยะเวลา: ${booking.durationMinutes} นาที
วันที่: ${thaiDate}
เวลา: ${localTime} น. (เวลาดับลิน)
นักบำบัด: ${therapistName || "ยังไม่ได้ระบุ"}
ราคา: ${thaiPrice}

ข้อมูลลูกค้า
ชื่อ: ${customerName}
โทรศัพท์: ${customerPhone}
อีเมล: ${customerEmail || "ไม่ได้ระบุ"}
หมายเหตุ: ${customerNotes || "ไม่ได้ระบุ"}

ข้อมูลคำขอ
รหัสภายใน: ${bookingId}
ส่งคำขอเมื่อ: ${thaiRequestedAt} (เวลาดับลิน)
กันคิวชั่วคราวถึง: ${thaiHoldUntil} (เวลาดับลิน)
${cmsBookingUrl ? `เปิดรายการจองใน CMS: ${cmsBookingUrl}\n` : ""}
อีเมลนี้บันทึกข้อมูลตอนลูกค้าส่งคำขอ กรุณาเปิด CMS เพื่อดูสถานะล่าสุด หากยืนยันแล้ว ไม่ต้องยืนยันซ้ำ

----------------------------------------

NEW BOOKING REQUEST — Siriranee Thai Massage

Status when requested: Pending confirmation
A customer submitted a booking request through the website. Review the details and contact them to confirm the appointment.

Appointment details
Booking reference: ${reference}
Treatment: ${serviceName}
Duration: ${booking.durationMinutes} minutes
Date: ${englishDate}
Time: ${localTime} (Dublin time)
Massage therapist: ${therapistName || "Not assigned"}
Price: ${englishPrice}

Customer details
Name: ${customerName}
Phone: ${customerPhone}
Email: ${customerEmail || "Not provided"}
Notes: ${customerNotes || "Not provided"}

Request information
Internal booking ID: ${bookingId}
Submitted: ${englishRequestedAt} (Dublin time)
Temporary capacity held until: ${englishHoldUntil} (Dublin time)
${cmsBookingUrl ? `Open booking in CMS: ${cmsBookingUrl}\n` : ""}
This email records the original request. Open the CMS for the latest status. If it is already confirmed, no further confirmation is needed.`;

  return {
    subject: `คำขอจองใหม่ / New booking request · ${reference}`,
    html,
    text,
  };
}

function safeHttpUrl(value: string | undefined) {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (url.username || url.password) return undefined;
    const localHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");
    if (url.protocol !== "https:" && !localHttp) {
      return undefined;
    }
    url.hash = "";
    return url.toString();
  } catch {
    return undefined;
  }
}

function customerEmailLink(label: string, href: string) {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 22px;border-radius:999px;background:#5c2288;color:#fffdf7;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(label)}</a>`;
}

export function renderCustomerBookingConfirmedEmail(
  booking: CustomerBookingEmailInput,
  business: CustomerBookingEmailBusiness,
): BookingEmailMessage {
  return renderCustomerBookingAppointmentEmail(booking, business, false);
}

export function renderCustomerBookingRescheduledEmail(
  booking: CustomerBookingEmailInput,
  business: CustomerBookingEmailBusiness,
): BookingEmailMessage {
  return renderCustomerBookingAppointmentEmail(booking, business, true);
}

function renderCustomerBookingAppointmentEmail(
  booking: CustomerBookingEmailInput,
  business: CustomerBookingEmailBusiness,
  updated: boolean,
): BookingEmailMessage {
  const customerName = cleanDisplayText(booking.customer.name);
  const reference = cleanDisplayText(booking.reference);
  const serviceName = cleanDisplayText(booking.serviceName);
  const localTime = cleanDisplayText(booking.localTime);
  const businessName = cleanDisplayText(business.name) || "Siriranee Thai Massage";
  const address = cleanDisplayText(business.address);
  const phone = cleanDisplayText(business.phone ?? "");
  const email = cleanDisplayText(business.email ?? "");
  const arrivalGuidance = cleanDisplayText(business.arrivalGuidance ?? "", true);
  const therapistName = cleanDisplayText(booking.assignedStaffName ?? "");
  const formattedDate = formatBookingDate(booking.localDate, "en-IE");
  const formattedPrice = formatPrice(
    booking.priceCents,
    booking.currency,
    "en-IE",
  );
  const origin = safeHttpUrl(business.siteOrigin)?.replace(/\/+$/, "");
  const directionsUrl = safeHttpUrl(business.directionsUrl);
  const visitUrl = origin ? `${origin}/visit` : directionsUrl;
  const contactUrl = origin ? `${origin}/contact` : undefined;
  const statusUrl = origin
    ? `${origin}/book/status?reference=${encodeURIComponent(reference)}`
    : undefined;
  const subject = `Booking ${updated ? "updated" : "confirmed"} · ${reference} · ${businessName}`;
  const preheader = updated
    ? `Your confirmed appointment details have changed. Please use the details in this email.`
    : `Your appointment on ${formattedDate} at ${localTime} is confirmed.`;
  const introduction = updated
    ? `your confirmed appointment with ${businessName} has been updated. Please use the appointment details below, which replace the details in any earlier email.`
    : `your appointment with ${businessName} is confirmed. We look forward to welcoming you.`;
  const contactLines = [
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
  ].filter(Boolean);

  const locationSection = address
    ? `<h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Where to go</h2>
      <p style="margin:0;color:#3c3340;font-size:15px;line-height:1.65;">${escapeHtml(address)}</p>
      ${arrivalGuidance ? `<p style="margin:8px 0 0;color:#675d64;font-size:14px;line-height:1.6;">${escapeHtmlMultiline(arrivalGuidance)}</p>` : ""}
      ${visitUrl ? `<p style="margin:18px 0 0;">${customerEmailLink("Plan your visit", visitUrl)}</p>` : ""}`
    : "";

  const statusSection = statusUrl
    ? `<div style="margin:26px 0 0;padding:18px;border:1px solid #d8c7d7;border-radius:14px;background:#f7f0fa;">
        <h2 style="margin:0 0 8px;color:#5c2288;font-size:18px;line-height:1.4;">Check your booking status</h2>
        <p style="margin:0 0 16px;color:#3c3340;font-size:14px;line-height:1.6;">Your booking reference <strong>${escapeHtml(reference)}</strong> is included in this link for convenience. No personal or appointment details are included.</p>
        ${customerEmailLink("Check booking status", statusUrl)}
      </div>`
    : "";

  const html = `<!doctype html>
<html lang="en-IE">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f4ea;color:#2b2028;font-family:Arial,Tahoma,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f9f4ea;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border:1px solid #e6d9be;border-radius:18px;border-collapse:separate;overflow:hidden;background:#fffdf7;box-shadow:0 12px 36px rgba(43,32,40,.10);">
            <tr><td style="padding:18px 30px;background:#5c2288;color:#fffdf7;font-size:17px;font-weight:800;line-height:1.4;">${escapeHtml(businessName)}</td></tr>
            <tr><td style="padding:30px 30px 32px;">
              <p style="margin:0 0 7px;color:#2d6d4f;font-size:12px;font-weight:800;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">${updated ? "Appointment update" : "Booking confirmation"}</p>
              <h1 style="margin:0;color:#5c2288;font-size:28px;line-height:1.25;">${updated ? "Your appointment details have changed" : "Your appointment is confirmed"}</h1>
              <p dir="auto" style="margin:12px 0 20px;color:#3c3340;font-size:16px;line-height:1.65;">Hi ${escapeHtml(customerName)}, ${escapeHtml(introduction)}</p>
              <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #98c8ae;border-radius:12px;background:#eaf6ef;">
                <span style="display:block;margin-bottom:3px;color:#2d6d4f;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Status</span>
                <strong style="color:#22573f;font-size:18px;line-height:1.35;">Confirmed</strong>
              </div>
              <h2 style="margin:0 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Appointment details</h2>
              <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                ${[
                  ["Booking reference", reference],
                  ["Treatment", serviceName],
                  ["Duration", `${booking.durationMinutes} minutes`],
                  ["Date", formattedDate],
                  ["Time", `${localTime} (Dublin time)`],
                  ...(therapistName
                    ? [["Massage therapist", therapistName] as const]
                    : []),
                  ["Price", formattedPrice],
                ].map(([label, value]) => detailRow(label, value)).join("")}
              </table>
              ${locationSection}
              <h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Need to change or cancel?</h2>
              <p style="margin:0;color:#3c3340;font-size:15px;line-height:1.65;">Please contact us as soon as possible.${contactLines.length ? `<br>${contactLines.map(escapeHtml).join("<br>")}` : ""}</p>
              ${contactUrl ? `<p style="margin:18px 0 0;">${customerEmailLink("Contact Siriranee", contactUrl)}</p>` : ""}
              ${statusSection}
            </td></tr>
            <tr><td style="padding:17px 30px;background:#efe4f7;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This operational email was sent because this address was provided for booking ${escapeHtml(reference)}. It is not a marketing email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `BOOKING ${updated ? "UPDATED" : "CONFIRMED"} — ${businessName}

Hi ${customerName},

${introduction[0].toUpperCase()}${introduction.slice(1)}

Appointment details
Booking reference: ${reference}
Treatment: ${serviceName}
Duration: ${booking.durationMinutes} minutes
Date: ${formattedDate}
Time: ${localTime} (Dublin time)
${therapistName ? `Massage therapist: ${therapistName}\n` : ""}Price: ${formattedPrice}
${address ? `\nWhere to go\n${address}\n${arrivalGuidance ? `${arrivalGuidance}\n` : ""}${visitUrl ? `Plan your visit: ${visitUrl}\n` : ""}` : ""}
Need to change or cancel?
Please contact us as soon as possible.
${contactLines.length ? `${contactLines.join("\n")}\n` : ""}${contactUrl ? `Contact: ${contactUrl}\n` : ""}
${statusUrl ? `Check booking status: ${statusUrl}\nThe link includes booking reference ${reference}, but no personal or appointment details.\n` : ""}
This operational email was sent because this address was provided for booking ${reference}. It is not a marketing email.`;

  return { subject, html, text };
}

export function renderCustomerBookingCancelledEmail(
  booking: CustomerBookingEmailInput,
  business: CustomerBookingEmailBusiness,
): BookingEmailMessage {
  const customerName = cleanDisplayText(booking.customer.name);
  const reference = cleanDisplayText(booking.reference);
  const serviceName = cleanDisplayText(booking.serviceName);
  const localTime = cleanDisplayText(booking.localTime);
  const businessName = cleanDisplayText(business.name) || "Siriranee Thai Massage";
  const phone = cleanDisplayText(business.phone ?? "");
  const email = cleanDisplayText(business.email ?? "");
  const formattedDate = formatBookingDate(booking.localDate, "en-IE");
  const formattedPrice = formatPrice(
    booking.priceCents,
    booking.currency,
    "en-IE",
  );
  const origin = safeHttpUrl(business.siteOrigin)?.replace(/\/+$/, "");
  const newBookingUrl = origin ? `${origin}/book` : undefined;
  const contactUrl = origin ? `${origin}/contact` : undefined;
  const statusUrl = origin
    ? `${origin}/book/status?reference=${encodeURIComponent(reference)}`
    : undefined;
  const subject = `Booking cancelled · ${reference} · ${businessName}`;
  const preheader = `Your booking for ${formattedDate} at ${localTime} has been cancelled.`;
  const contactLines = [
    phone ? `Phone: ${phone}` : "",
    email ? `Email: ${email}` : "",
  ].filter(Boolean);

  const html = `<!doctype html>
<html lang="en-IE">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f4ea;color:#2b2028;font-family:Arial,Tahoma,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f9f4ea;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border:1px solid #e6d9be;border-radius:18px;border-collapse:separate;overflow:hidden;background:#fffdf7;box-shadow:0 12px 36px rgba(43,32,40,.10);">
            <tr><td style="padding:18px 30px;background:#5c2288;color:#fffdf7;font-size:17px;font-weight:800;line-height:1.4;">${escapeHtml(businessName)}</td></tr>
            <tr><td style="padding:30px 30px 32px;">
              <p style="margin:0 0 7px;color:#8a2d2d;font-size:12px;font-weight:800;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">Booking update</p>
              <h1 style="margin:0;color:#5c2288;font-size:28px;line-height:1.25;">Your booking has been cancelled</h1>
              <p dir="auto" style="margin:12px 0 20px;color:#3c3340;font-size:16px;line-height:1.65;">Hi ${escapeHtml(customerName)}, your booking with ${escapeHtml(businessName)} has been cancelled. This appointment is no longer active.</p>
              <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #d7a4a4;border-radius:12px;background:#fbecec;">
                <span style="display:block;margin-bottom:3px;color:#8a2d2d;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Status</span>
                <strong style="color:#762525;font-size:18px;line-height:1.35;">Cancelled</strong>
              </div>
              <h2 style="margin:0 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Cancelled appointment</h2>
              <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                ${[
                  ["Booking reference", reference],
                  ["Treatment", serviceName],
                  ["Duration", `${booking.durationMinutes} minutes`],
                  ["Date", formattedDate],
                  ["Time", `${localTime} (Dublin time)`],
                  ["Price", formattedPrice],
                ].map(([label, value]) => detailRow(label, value)).join("")}
              </table>
              ${newBookingUrl ? `<h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Would you like another appointment?</h2>
              <p style="margin:0 0 18px;color:#3c3340;font-size:15px;line-height:1.65;">You can send a new booking request whenever you are ready.</p>
              <p style="margin:0;">${customerEmailLink("Make a new booking", newBookingUrl)}</p>` : ""}
              <h2 style="margin:26px 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">Questions?</h2>
              <p style="margin:0;color:#3c3340;font-size:15px;line-height:1.65;">Please contact us if you believe this cancellation was made in error.${contactLines.length ? `<br>${contactLines.map(escapeHtml).join("<br>")}` : ""}</p>
              ${contactUrl ? `<p style="margin:18px 0 0;">${customerEmailLink("Contact Siriranee", contactUrl)}</p>` : ""}
              ${statusUrl ? `<div style="margin:26px 0 0;padding:18px;border:1px solid #d8c7d7;border-radius:14px;background:#f7f0fa;">
                <h2 style="margin:0 0 8px;color:#5c2288;font-size:18px;line-height:1.4;">Check your booking status</h2>
                <p style="margin:0 0 16px;color:#3c3340;font-size:14px;line-height:1.6;">Your booking reference <strong>${escapeHtml(reference)}</strong> is included in this link for convenience. No personal or appointment details are included.</p>
                ${customerEmailLink("Check booking status", statusUrl)}
              </div>` : ""}
            </td></tr>
            <tr><td style="padding:17px 30px;background:#efe4f7;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This operational email was sent because this address was provided for booking ${escapeHtml(reference)}. It is not a marketing email.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `BOOKING CANCELLED — ${businessName}

Hi ${customerName},

Your booking with ${businessName} has been cancelled. This appointment is no longer active.

Cancelled appointment
Booking reference: ${reference}
Treatment: ${serviceName}
Duration: ${booking.durationMinutes} minutes
Date: ${formattedDate}
Time: ${localTime} (Dublin time)
Price: ${formattedPrice}
${newBookingUrl ? `\nMake a new booking: ${newBookingUrl}\n` : ""}
Questions?
Please contact us if you believe this cancellation was made in error.
${contactLines.length ? `${contactLines.join("\n")}\n` : ""}${contactUrl ? `Contact: ${contactUrl}\n` : ""}
${statusUrl ? `Check booking status: ${statusUrl}\nThe link includes booking reference ${reference}, but no personal or appointment details.\n` : ""}
This operational email was sent because this address was provided for booking ${reference}. It is not a marketing email.`;

  return { subject, html, text };
}

const therapistEmailEventCopy: Readonly<
  Record<
    TherapistBookingEmailEvent,
    {
      readonly eyebrow: string;
      readonly heading: string;
      readonly status: string;
      readonly introduction: (therapistName: string) => string;
      readonly subject: (reference: string, businessName: string) => string;
    }
  >
> = {
  assigned: {
    eyebrow: "Confirmed appointment",
    heading: "A new appointment has been assigned to you",
    status: "Assigned to you",
    introduction: (therapistName) =>
      `Hi ${therapistName}, a confirmed appointment has been added to your schedule.`,
    subject: (reference, businessName) =>
      `New confirmed appointment · ${reference} · ${businessName}`,
  },
  rescheduled: {
    eyebrow: "Appointment update",
    heading: "An appointment has been rescheduled",
    status: "Date or time updated",
    introduction: (therapistName) =>
      `Hi ${therapistName}, a confirmed appointment on your schedule has a new date or time.`,
    subject: (reference, businessName) =>
      `Appointment rescheduled · ${reference} · ${businessName}`,
  },
  removed: {
    eyebrow: "Assignment update",
    heading: "An appointment has been removed from your schedule",
    status: "No longer assigned to you",
    introduction: (therapistName) =>
      `Hi ${therapistName}, the original appointment below has been removed from your schedule.`,
    subject: (reference, businessName) =>
      `Appointment removed · ${reference} · ${businessName}`,
  },
  cancelled: {
    eyebrow: "Booking update",
    heading: "A confirmed appointment has been cancelled",
    status: "Cancelled",
    introduction: (therapistName) =>
      `Hi ${therapistName}, this confirmed appointment has been cancelled and is no longer active.`,
    subject: (reference, businessName) =>
      `Appointment cancelled · ${reference} · ${businessName}`,
  },
};

export function renderTherapistBookingEmail(
  booking: TherapistBookingEmailInput,
  input: {
    readonly event: TherapistBookingEmailEvent;
    readonly therapistName: string;
    readonly businessName: string;
    readonly cmsUrl?: string;
  },
): BookingEmailMessage {
  const copy = therapistEmailEventCopy[input.event];
  const therapistName =
    cleanDisplayText(input.therapistName) || "massage therapist";
  const businessName =
    cleanDisplayText(input.businessName) || "Siriranee Thai Massage";
  const reference = cleanDisplayText(booking.reference);
  const serviceName = cleanDisplayText(booking.serviceName);
  const localTime = cleanDisplayText(booking.localTime);
  const cmsUrl = safeHttpUrl(input.cmsUrl);
  const formattedDate = formatBookingDate(booking.localDate, "en-IE");
  const subject = copy.subject(reference, businessName);
  const detailsHeading = input.event === "removed" ? "Original appointment removed" : "Appointment details";
  const preheader = `${copy.status}: ${formattedDate} at ${localTime} (Dublin time).`;
  const rows = [
    ["Booking reference", reference],
    ["Treatment", serviceName],
    ["Duration", `${booking.durationMinutes} minutes`],
    ["Date", formattedDate],
    ["Time", `${localTime} (Dublin time)`],
  ] as const;

  const html = `<!doctype html>
<html lang="en-IE">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="light only">
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f9f4ea;color:#2b2028;font-family:Arial,Tahoma,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;background:#f9f4ea;">
      <tr>
        <td align="center" style="padding:24px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;border:1px solid #e6d9be;border-radius:18px;border-collapse:separate;overflow:hidden;background:#fffdf7;box-shadow:0 12px 36px rgba(43,32,40,.10);">
            <tr><td style="padding:18px 30px;background:#5c2288;color:#fffdf7;font-size:17px;font-weight:800;line-height:1.4;">${escapeHtml(businessName)}</td></tr>
            <tr><td style="padding:30px 30px 32px;">
              <p style="margin:0 0 7px;color:#7a590d;font-size:12px;font-weight:800;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">${escapeHtml(copy.eyebrow)}</p>
              <h1 style="margin:0;color:#5c2288;font-size:28px;line-height:1.25;">${escapeHtml(copy.heading)}</h1>
              <p dir="auto" style="margin:12px 0 20px;color:#3c3340;font-size:16px;line-height:1.65;">${escapeHtml(copy.introduction(therapistName))}</p>
              <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #d8c7d7;border-radius:12px;background:#f7f0fa;">
                <span style="display:block;margin-bottom:3px;color:#675d64;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">Schedule status</span>
                <strong style="color:#5c2288;font-size:18px;line-height:1.35;">${escapeHtml(copy.status)}</strong>
              </div>
              <h2 style="margin:0 0 5px;color:#5c2288;font-size:18px;line-height:1.4;">${escapeHtml(detailsHeading)}</h2>
              <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">
                ${rows.map(([label, value]) => detailRow(label, value)).join("")}
              </table>
              ${cmsUrl ? `<p style="margin:24px 0 0;text-align:center;"><a href="${escapeHtml(cmsUrl)}" style="display:inline-block;border-radius:999px;background:#5c2288;color:#fffdf7;font-size:15px;font-weight:800;line-height:1.2;padding:13px 22px;text-decoration:none;">Open the staff CMS</a></p><p style="margin:10px 0 0;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This link contains no access token. Sign in with your authorised account if needed.</p>` : ""}
              <p style="margin:24px 0 0;color:#675d64;font-size:14px;line-height:1.6;">Please contact ${escapeHtml(businessName)} directly if this schedule update looks incorrect.</p>
            </td></tr>
            <tr><td style="padding:17px 30px;background:#efe4f7;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This operational email contains only the appointment details needed for your work. Please handle customer information privately.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${copy.heading.toUpperCase()} — ${businessName}

${copy.introduction(therapistName)}

Schedule status: ${copy.status}

${detailsHeading}
${rows.map(([label, value]) => `${label}: ${value}`).join("\n")}

${cmsUrl ? `Staff CMS (sign-in required): ${cmsUrl}\n` : ""}

Please contact ${businessName} directly if this schedule update looks incorrect.

This operational email contains only the appointment details needed for your work. Please handle customer information privately.`;

  return { subject, html, text };
}
