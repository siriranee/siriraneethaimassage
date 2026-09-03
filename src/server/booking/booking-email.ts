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
  | "createdAt"
>;

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
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:24px 0 4px;"><tr><td style="border-radius:999px;background:#6a2467;"><a href="${escapeHtml(input.cmsBookingUrl)}" style="display:inline-block;padding:13px 22px;color:#fffdf7;font-size:15px;font-weight:700;line-height:1.2;text-decoration:none;">${escapeHtml(input.buttonLabel)}</a></td></tr></table>`
    : "";

  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;"><tr><td lang="${input.language}" style="padding:30px 30px 32px;">
    <p style="margin:0 0 7px;color:#7a590d;font-size:12px;font-weight:800;letter-spacing:.08em;line-height:1.4;text-transform:uppercase;">${escapeHtml(input.eyebrow)}</p>
    <h1 style="margin:0;color:#4a2246;font-size:26px;line-height:1.25;">${escapeHtml(input.heading)}</h1>
    <p style="margin:12px 0 20px;color:#3c3340;font-size:16px;line-height:1.65;">${escapeHtml(input.introduction)}</p>
    <div style="margin:0 0 24px;padding:14px 16px;border:1px solid #e1c65f;border-radius:12px;background:#f8f0ce;">
      <span style="display:block;margin-bottom:3px;color:#7a590d;font-size:12px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;">${escapeHtml(input.statusLabel)}</span>
      <strong style="color:#4a2246;font-size:18px;line-height:1.35;">${escapeHtml(input.statusValue)}</strong>
    </div>
    <h2 style="margin:0 0 5px;color:#4a2246;font-size:18px;line-height:1.4;">${escapeHtml(input.appointmentHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.appointmentRows.map(([label, value]) => detailRow(label, value)).join("")}</table>
    <h2 style="margin:26px 0 5px;color:#4a2246;font-size:18px;line-height:1.4;">${escapeHtml(input.customerHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.customerRows.map(([label, value, direction]) => detailRow(label, value, direction)).join("")}</table>
    <h2 style="margin:26px 0 5px;color:#4a2246;font-size:18px;line-height:1.4;">${escapeHtml(input.requestHeading)}</h2>
    <table role="table" width="100%" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse;">${input.requestRows.map(([label, value]) => detailRow(label, value)).join("")}</table>
    <p style="margin:22px 0 0;padding-left:13px;border-left:4px solid #d5b350;color:#4a2246;font-size:15px;font-weight:700;line-height:1.55;">${escapeHtml(input.warning)}</p>
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
  const hasCustomerNotes = Boolean(cleanDisplayText(booking.customer.notes, true));
  const serviceName = cleanDisplayText(booking.serviceName);
  const reference = cleanDisplayText(booking.reference);
  const bookingId = cleanDisplayText(booking.id);
  const localTime = cleanDisplayText(booking.localTime);
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
    statusLabel: "สถานะ",
    statusValue: "รอการยืนยัน",
    appointmentHeading: "รายละเอียดนัดหมาย",
    appointmentRows: [
      ["รหัสการจอง", reference],
      ["บริการ", serviceName],
      ["ระยะเวลา", `${booking.durationMinutes} นาที`],
      ["วันที่", thaiDate],
      ["เวลา", `${localTime} น. (เวลาดับลิน)`],
      ["ราคา", thaiPrice],
    ],
    customerHeading: "ข้อมูลลูกค้า",
    customerRows: [
      ["ชื่อ", customerName, true],
      ["โทรศัพท์", customerPhone, true],
      ["อีเมล", customerEmail || "ไม่ได้ระบุ", true],
      [
        "หมายเหตุ",
        hasCustomerNotes
          ? cmsBookingUrl
            ? "ลูกค้าได้เพิ่มหมายเหตุ กรุณาเปิดดูอย่างปลอดภัยใน CMS"
            : "ลูกค้าได้เพิ่มหมายเหตุ กรุณาตรวจสอบในรายการจองของ CMS"
          : "ไม่ได้ระบุ",
      ],
    ],
    requestHeading: "ข้อมูลคำขอ",
    requestRows: [
      ["รหัสภายใน", bookingId],
      ["ส่งคำขอเมื่อ", `${thaiRequestedAt} (เวลาดับลิน)`],
      ["กันคิวชั่วคราวถึง", `${thaiHoldUntil} (เวลาดับลิน)`],
    ],
    warning: "คำขอนี้ยังไม่ได้รับการยืนยัน กรุณาตรวจสอบคิวก่อนยืนยันกับลูกค้า",
    buttonLabel: "เปิดรายการจองใน CMS",
    cmsBookingUrl,
  });

  const english = section({
    language: "en-IE",
    eyebrow: "Website booking",
    heading: "New booking request",
    introduction: "A customer submitted a booking request through the website. Review the details and contact them to confirm the appointment.",
    statusLabel: "Status",
    statusValue: "Pending confirmation",
    appointmentHeading: "Appointment details",
    appointmentRows: [
      ["Booking reference", reference],
      ["Treatment", serviceName],
      ["Duration", `${booking.durationMinutes} minutes`],
      ["Date", englishDate],
      ["Time", `${localTime} (Dublin time)`],
      ["Price", englishPrice],
    ],
    customerHeading: "Customer details",
    customerRows: [
      ["Name", customerName, true],
      ["Phone", customerPhone, true],
      ["Email", customerEmail || "Not provided", true],
      [
        "Notes",
        hasCustomerNotes
          ? cmsBookingUrl
            ? "The customer added notes. Open the CMS booking to review them securely."
            : "The customer added notes. Review them in the CMS booking record."
          : "Not provided",
      ],
    ],
    requestHeading: "Request information",
    requestRows: [
      ["Internal booking ID", bookingId],
      ["Submitted", `${englishRequestedAt} (Dublin time)`],
      ["Temporary capacity held until", `${englishHoldUntil} (Dublin time)`],
    ],
    warning: "This request is not confirmed yet. Check availability before confirming it with the customer.",
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
            <tr><td lang="en-IE" style="padding:18px 30px;background:#4a2246;color:#fffdf7;font-size:17px;font-weight:800;line-height:1.4;">Siriranee Thai Massage</td></tr>
            <tr><td>${thai}</td></tr>
            <tr><td style="height:1px;background:#d8c7d7;"></td></tr>
            <tr><td>${english}</td></tr>
            <tr><td lang="en-IE" style="padding:17px 30px;background:#f3e9f4;color:#675d64;font-size:12px;line-height:1.55;text-align:center;">This operational email was generated automatically from a website booking request.</td></tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `คำขอจองใหม่ — Siriranee Thai Massage

สถานะ: รอการยืนยัน
ลูกค้าส่งคำขอจองผ่านเว็บไซต์ กรุณาตรวจสอบรายละเอียดและติดต่อกลับเพื่อยืนยันนัดหมาย

รายละเอียดนัดหมาย
รหัสการจอง: ${reference}
บริการ: ${serviceName}
ระยะเวลา: ${booking.durationMinutes} นาที
วันที่: ${thaiDate}
เวลา: ${localTime} น. (เวลาดับลิน)
ราคา: ${thaiPrice}

ข้อมูลลูกค้า
ชื่อ: ${customerName}
โทรศัพท์: ${customerPhone}
อีเมล: ${customerEmail || "ไม่ได้ระบุ"}
หมายเหตุ: ${hasCustomerNotes ? "ลูกค้าได้เพิ่มหมายเหตุ กรุณาตรวจสอบในรายการจองของ CMS" : "ไม่ได้ระบุ"}

ข้อมูลคำขอ
รหัสภายใน: ${bookingId}
ส่งคำขอเมื่อ: ${thaiRequestedAt} (เวลาดับลิน)
กันคิวชั่วคราวถึง: ${thaiHoldUntil} (เวลาดับลิน)
${cmsBookingUrl ? `เปิดรายการจองใน CMS: ${cmsBookingUrl}\n` : ""}
คำขอนี้ยังไม่ได้รับการยืนยัน กรุณาตรวจสอบคิวก่อนยืนยันกับลูกค้า

----------------------------------------

NEW BOOKING REQUEST — Siriranee Thai Massage

Status: Pending confirmation
A customer submitted a booking request through the website. Review the details and contact them to confirm the appointment.

Appointment details
Booking reference: ${reference}
Treatment: ${serviceName}
Duration: ${booking.durationMinutes} minutes
Date: ${englishDate}
Time: ${localTime} (Dublin time)
Price: ${englishPrice}

Customer details
Name: ${customerName}
Phone: ${customerPhone}
Email: ${customerEmail || "Not provided"}
Notes: ${hasCustomerNotes ? "The customer added notes. Review them in the CMS booking record." : "Not provided"}

Request information
Internal booking ID: ${bookingId}
Submitted: ${englishRequestedAt} (Dublin time)
Temporary capacity held until: ${englishHoldUntil} (Dublin time)
${cmsBookingUrl ? `Open booking in CMS: ${cmsBookingUrl}\n` : ""}
This request is not confirmed yet. Check availability before confirming it with the customer.`;

  return {
    subject: `คำขอจองใหม่ / New booking request · ${reference}`,
    html,
    text,
  };
}
