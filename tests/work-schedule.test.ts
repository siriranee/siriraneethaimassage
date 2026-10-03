import assert from "node:assert/strict";
import test from "node:test";

import {
  buildScheduleRange,
  buildScheduleRows,
  buildScheduleWeek,
  formatScheduleTime,
  layoutScheduleIntervals,
  parseScheduleTime,
  scheduleBookingDisplayInterval,
  scheduleBookingEndLabel,
  scheduleBookingInterval,
  type ScheduleInterval,
} from "@/domain/booking/work-schedule";

function interval(id: string, startMinute: number, endMinute: number): ScheduleInterval {
  return Object.freeze({ id, startMinute, endMinute });
}

function lanes(items: readonly ScheduleInterval[]) {
  return layoutScheduleIntervals(items).map(({ item, lane, laneCount }) => ({
    id: item.id, lane, laneCount,
  }));
}

test("content-sized schedule rows keep quarter-hour boundaries on an empty day", () => {
  assert.deepEqual(buildScheduleRows({ startMinute: 540, endMinute: 600 }, []), [
    { startMinute: 540, endMinute: 555 },
    { startMinute: 555, endMinute: 570 },
    { startMinute: 570, endMinute: 585 },
    { startMinute: 585, endMinute: 600 },
  ]);
});

test("content-sized rows include exact boundaries for overlapping and back-to-back bookings", () => {
  const bookings = [interval("a", 550, 580), interval("b", 550, 565), interval("c", 580, 600)];
  const rows = buildScheduleRows({ startMinute: 540, endMinute: 600 }, bookings);
  assert.deepEqual(rows.map((row) => row.startMinute), [540, 550, 555, 565, 570, 580, 585]);
  for (const booking of bookings) {
    const spanned = rows.filter((row) => row.startMinute >= booking.startMinute && row.endMinute <= booking.endMinute);
    assert.equal(spanned[0].startMinute, booking.startMinute);
    assert.equal(spanned.at(-1)?.endMinute, booking.endMinute);
    assert.equal(spanned.reduce((total, row) => total + row.endMinute - row.startMinute, 0), booking.endMinute - booking.startMinute);
  }
});

test("row boundaries are stable across therapist order and preserve their inputs", () => {
  const range = Object.freeze({ startMinute: 540, endMinute: 660 });
  const bookings = Object.freeze([interval("b", 580, 650), interval("a", 550, 615), interval("same", 550, 615)]);
  assert.deepEqual(buildScheduleRows(range, bookings), buildScheduleRows(range, [...bookings].reverse()));
  assert.equal(bookings[0].id, "b");
});

test("rows ignore invalid intervals, clip outside boundaries, and retain the midnight edge", () => {
  const rows = buildScheduleRows({ startMinute: 1410, endMinute: 1440 }, [
    interval("outside", 1400, 1420), interval("bad", 1430, 1420), interval("nan", NaN, 1430),
  ]);
  assert.deepEqual(rows, [
    { startMinute: 1410, endMinute: 1420 },
    { startMinute: 1420, endMinute: 1425 },
    { startMinute: 1425, endMinute: 1440 },
  ]);
  assert.deepEqual(buildScheduleRows({ startMinute: 600, endMinute: 540 }, []), []);
});

test("schedule accepts strict 24-hour times, including the midnight end boundary", () => {
  for (const [value, minutes] of [["00:00", 0], ["09:05", 545], ["23:59", 1439], ["24:00", 1440]] as const) {
    assert.equal(parseScheduleTime(value), minutes);
    assert.equal(formatScheduleTime(minutes), value);
  }
  for (const value of ["", "9:00", "09:0", " 09:00", "09:00 ", "09:00:00", "24:01", "25:00", "10:60", "-1:00", "noon"]) {
    assert.equal(parseScheduleTime(value), null, value);
  }
  for (const value of [-1, 1441, 12.5, NaN, Infinity]) {
    assert.equal(formatScheduleTime(value), "--:--");
  }
});

test("booking intervals use appointment duration and cap the displayed end at midnight", () => {
  assert.deepEqual(scheduleBookingInterval("11:15", 90), { startMinute: 675, endMinute: 765 });
  assert.deepEqual(scheduleBookingInterval("23:30", 120), { startMinute: 1410, endMinute: 1440 });
  assert.deepEqual(scheduleBookingInterval("00:00", 60), { startMinute: 0, endMinute: 60 });
  for (const time of ["24:00", "24:01", "9:00", "invalid"]) {
    assert.equal(scheduleBookingInterval(time, 60), null);
  }
  for (const duration of [0, -60, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(scheduleBookingInterval("09:00", duration), null);
  }
});

test("end labels use the stored instant in Dublin, including spring-forward clock changes", () => {
  assert.equal(scheduleBookingEndLabel("2026-09-19T12:30:00Z", "2026-09-19", 750), "13:30");
  assert.equal(scheduleBookingEndLabel("2026-03-29T00:30:00Z", "2026-03-29", 90), "00:30");
  assert.equal(scheduleBookingEndLabel("2026-03-29T01:30:00Z", "2026-03-29", 90), "02:30");
  assert.equal(scheduleBookingEndLabel("2026-03-29T02:30:00+01:00", "2026-03-29", 90), "02:30");
});

test("display interval uses actual Dublin end time for ordinary appointments", () => {
  assert.deepEqual(scheduleBookingDisplayInterval("11:15", 90, "2026-09-19T11:45:00Z", "2026-09-19"), {
    startMinute: 675, endMinute: 765,
  });
  assert.deepEqual(scheduleBookingDisplayInterval("11:15", 90, "2026-12-19T12:45:00Z", "2026-12-19"), {
    startMinute: 675, endMinute: 765,
  });
});

test("spring-forward display interval reaches the stored end label on the clock grid", () => {
  const interval = scheduleBookingDisplayInterval("00:30", 90, "2026-03-29T02:00:00Z", "2026-03-29");
  assert.deepEqual(interval, { startMinute: 30, endMinute: 180 });
  assert.equal(formatScheduleTime(interval!.endMinute), scheduleBookingEndLabel("2026-03-29T02:00:00Z", "2026-03-29", 120));
});

test("fall-back interval prefers the actual clock end unless that reverses or collapses the card", () => {
  assert.deepEqual(scheduleBookingDisplayInterval("00:30", 120, "2026-10-25T01:30:00Z", "2026-10-25"), {
    startMinute: 30, endMinute: 90,
  });
  assert.deepEqual(scheduleBookingDisplayInterval("01:30", 30, "2026-10-25T01:00:00Z", "2026-10-25"), {
    startMinute: 90, endMinute: 120,
  });
  assert.deepEqual(scheduleBookingDisplayInterval("01:30", 60, "2026-10-25T01:30:00Z", "2026-10-25"), {
    startMinute: 90, endMinute: 150,
  });
});

test("display intervals ending on a later date stop at the current day boundary", () => {
  assert.deepEqual(scheduleBookingDisplayInterval("23:00", 60, "2026-09-19T23:00:00Z", "2026-09-19"), {
    startMinute: 1380, endMinute: 1440,
  });
  assert.deepEqual(scheduleBookingDisplayInterval("23:30", 90, "2026-12-20T01:00:00Z", "2026-12-19"), {
    startMinute: 1410, endMinute: 1440,
  });
  assert.deepEqual(scheduleBookingDisplayInterval("11:15", 90, "2026-09-21T10:00:00Z", "2026-09-19"), {
    startMinute: 675, endMinute: 1440,
  });
});

test("display interval falls back for malformed or earlier historical ends and rejects invalid bases", () => {
  const fallback = { startMinute: 675, endMinute: 765 };
  for (const endsAt of ["", "invalid", "2026-02-30T12:00:00Z", "2026-09-19T12:00:00", "2026-09-18T12:00:00Z"]) {
    assert.deepEqual(scheduleBookingDisplayInterval("11:15", 90, endsAt, "2026-09-19"), fallback);
  }
  for (const date of ["", "2026-02-30", "2026-9-19"]) {
    assert.deepEqual(scheduleBookingDisplayInterval("11:15", 90, "2026-09-19T12:00:00Z", date), fallback);
  }
  assert.equal(scheduleBookingDisplayInterval("24:00", 90, "2026-09-20T12:00:00Z", "2026-09-19"), null);
  assert.equal(scheduleBookingDisplayInterval("invalid", 90, "2026-09-19T12:00:00Z", "2026-09-19"), null);
  assert.equal(scheduleBookingDisplayInterval("11:15", 0, "2026-09-19T12:00:00Z", "2026-09-19"), null);
});

test("end labels handle both occurrences of the repeated fall-back hour", () => {
  assert.equal(scheduleBookingEndLabel("2026-10-25T00:30:00Z", "2026-10-25", 150), "01:30");
  assert.equal(scheduleBookingEndLabel("2026-10-25T01:30:00Z", "2026-10-25", 150), "01:30");
  assert.equal(scheduleBookingEndLabel("2026-10-25T02:30:00Z", "2026-10-25", 210), "02:30");
});

test("only exact midnight immediately after the appointment date is labelled 24:00", () => {
  assert.equal(scheduleBookingEndLabel("2026-09-19T23:00:00Z", "2026-09-19", 1430), "24:00");
  assert.equal(scheduleBookingEndLabel("2026-12-20T00:00:00Z", "2026-12-19", 1430), "24:00");
  assert.equal(scheduleBookingEndLabel("2027-01-01T00:00:00Z", "2026-12-31", 1430), "24:00");
  assert.equal(scheduleBookingEndLabel("2026-09-18T23:00:00Z", "2026-09-19", 1430), "00:00");
  assert.equal(scheduleBookingEndLabel("2026-09-19T23:00:01Z", "2026-09-19", 1430), "00:00 (2026-09-20)");
  assert.equal(scheduleBookingEndLabel("2026-09-19T23:00:00.000000001Z", "2026-09-19", 1430), "00:00 (2026-09-20)");
});

test("historical end instants on a different date retain that date in the label", () => {
  assert.equal(scheduleBookingEndLabel("2026-09-20T01:30:00Z", "2026-09-19", 1440), "02:30 (2026-09-20)");
  assert.equal(scheduleBookingEndLabel("2026-09-18T12:30:00Z", "2026-09-19", 750), "13:30 (2026-09-18)");
  assert.equal(scheduleBookingEndLabel("2026-09-20T23:00:00Z", "2026-09-19", 1440), "00:00 (2026-09-21)");
});

test("invalid end timestamps or dates safely use the supplied end-minute fallback", () => {
  for (const endsAt of ["", "invalid", "2026-02-30T12:00:00Z", "2026-09-19T12:00:00"]) {
    assert.equal(scheduleBookingEndLabel(endsAt, "2026-09-19", 750), "12:30");
  }
  for (const date of ["", "2026-02-30", "2026-9-19", "2026-09-19T00:00:00Z"]) {
    assert.equal(scheduleBookingEndLabel("2026-09-19T12:30:00Z", date, 750), "12:30");
  }
  assert.equal(scheduleBookingEndLabel("invalid", "2026-09-19", 1440), "24:00");
  assert.equal(scheduleBookingEndLabel("invalid", "2026-09-19", NaN), "--:--");
});

test("empty and invalid opening hours fall back to 09:00-20:00", () => {
  const expected = { startMinute: 540, endMinute: 1200 };
  assert.deepEqual(buildScheduleRange([]), expected);
  for (const [opens, closes] of [["invalid", "19:00"], ["10:00", ""], ["20:00", "10:00"], ["10:00", "10:00"], ["24:00", "24:00"]]) {
    assert.deepEqual(buildScheduleRange([], opens, closes), expected);
  }
});

test("valid configured hours include the existing one-hour closing extension and round outward", () => {
  assert.deepEqual(buildScheduleRange([], "10:30", "19:00"), { startMinute: 600, endMinute: 1200 });
  assert.deepEqual(buildScheduleRange([], "10:15", "19:15"), { startMinute: 600, endMinute: 1260 });
  assert.deepEqual(buildScheduleRange([], "10:00", "17:00"), { startMinute: 600, endMinute: 1080 });
  assert.deepEqual(buildScheduleRange([], "23:15", "23:45"), { startMinute: 1380, endMinute: 1440 });
  assert.deepEqual(buildScheduleRange([], "00:00", "24:00"), { startMinute: 0, endMinute: 1440 });
});

test("range never hides valid early or late appointments", () => {
  const appointments = Object.freeze([
    interval("early", 435, 495),
    interval("late", 1230, 1305),
  ]);
  assert.deepEqual(buildScheduleRange(appointments, "10:00", "19:00"), { startMinute: 420, endMinute: 1320 });
  assert.deepEqual(buildScheduleRange(appointments), { startMinute: 420, endMinute: 1320 });
  assert.deepEqual(buildScheduleRange([interval("midnight", 1430, 1440)]), { startMinute: 540, endMinute: 1440 });
});

test("invalid intervals cannot corrupt bounds or overlap positioning", () => {
  const invalid = [
    interval("zero", 600, 600), interval("reversed", 660, 600),
    interval("negative", -10, 60), interval("next-day", 1430, 1450),
    interval("fraction", 600.5, 660), interval("not-number", NaN, 660),
    interval("infinite", 600, Infinity),
  ];
  assert.deepEqual(buildScheduleRange(invalid), { startMinute: 540, endMinute: 1200 });
  assert.deepEqual(layoutScheduleIntervals(invalid), []);
});

test("empty schedule has no positioned appointments", () => {
  assert.deepEqual(layoutScheduleIntervals([]), []);
});

test("touching appointments use full width and never count as overlapping", () => {
  assert.deepEqual(lanes([
    interval("second", 660, 720), interval("first", 600, 660), interval("third", 780, 840),
  ]), [
    { id: "first", lane: 0, laneCount: 1 },
    { id: "second", lane: 0, laneCount: 1 },
    { id: "third", lane: 0, laneCount: 1 },
  ]);
});

test("identical simultaneous bookings each receive a distinct stable lane", () => {
  const items = [interval("c", 600, 660), interval("b", 600, 660), interval("a", 600, 660)];
  const expected = [
    { id: "a", lane: 0, laneCount: 3 },
    { id: "b", lane: 1, laneCount: 3 },
    { id: "c", lane: 2, laneCount: 3 },
  ];
  assert.deepEqual(lanes(items), expected);
  assert.deepEqual(lanes([...items].reverse()), expected);
});

test("transitive overlap group retains consistent widths and reuses available lanes", () => {
  assert.deepEqual(lanes([
    interval("a", 600, 660), interval("b", 630, 690), interval("c", 660, 720),
    interval("independent", 720, 780),
  ]), [
    { id: "a", lane: 0, laneCount: 2 },
    { id: "b", lane: 1, laneCount: 2 },
    { id: "c", lane: 0, laneCount: 2 },
    { id: "independent", lane: 0, laneCount: 1 },
  ]);
});

test("nested overlaps use peak concurrency, not the total group size", () => {
  assert.deepEqual(lanes([
    interval("outer", 600, 840), interval("first", 600, 660),
    interval("middle", 660, 720), interval("short", 675, 690), interval("last", 720, 780),
  ]), [
    { id: "outer", lane: 0, laneCount: 3 },
    { id: "first", lane: 1, laneCount: 3 },
    { id: "middle", lane: 1, laneCount: 3 },
    { id: "short", lane: 2, laneCount: 3 },
    { id: "last", lane: 1, laneCount: 3 },
  ]);
});

test("layout preserves frozen input and the original richer booking objects", () => {
  const first = Object.freeze({ ...interval("a", 600, 660), customerName: "Example" });
  const second = Object.freeze({ ...interval("b", 630, 690), customerName: "Other" });
  const items = Object.freeze([second, first]);
  const before = JSON.stringify(items);
  const result = layoutScheduleIntervals(items);
  assert.equal(result[0].item, first);
  assert.equal(result[1].item, second);
  assert.equal(result[0].item.customerName, "Example");
  assert.equal(JSON.stringify(items), before);
});

test("all overlapping pairs occupy different lanes in a busy schedule", () => {
  const items = Array.from({ length: 45 }, (_, index) => interval(
    `booking-${index}`, 540 + (index % 15) * 15, 540 + (index % 15) * 15 + 30 + (index % 4) * 15,
  ));
  const positioned = layoutScheduleIntervals(items);
  for (const first of positioned) {
    assert.ok(first.lane >= 0 && first.lane < first.laneCount);
    for (const second of positioned) {
      if (first === second) continue;
      if (first.item.startMinute < second.item.endMinute && second.item.startMinute < first.item.endMinute) {
        assert.notEqual(first.lane, second.lane);
        assert.equal(first.laneCount, second.laneCount);
      }
    }
  }
});

test("week begins on Sunday, including when selected day is Sunday or Saturday", () => {
  const expected = ["2026-09-13", "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"];
  for (const selected of ["2026-09-13", "2026-09-16", "2026-09-19"]) {
    assert.deepEqual(buildScheduleWeek(selected), expected);
  }
});

test("week crosses month, leap-day and year boundaries without skipping a date", () => {
  assert.deepEqual(buildScheduleWeek("2027-01-01"), ["2026-12-27", "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
  assert.deepEqual(buildScheduleWeek("2028-02-29"), ["2028-02-27", "2028-02-28", "2028-02-29", "2028-03-01", "2028-03-02", "2028-03-03", "2028-03-04"]);
});

test("Dublin daylight-saving transition weeks stay seven plain calendar dates", () => {
  assert.deepEqual(buildScheduleWeek("2026-03-29"), ["2026-03-29", "2026-03-30", "2026-03-31", "2026-04-01", "2026-04-02", "2026-04-03", "2026-04-04"]);
  assert.deepEqual(buildScheduleWeek("2026-10-25"), ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31"]);
});

test("invalid or non-canonical selected dates fail safely", () => {
  for (const date of ["", "2026-02-29", "2026-13-01", "2026-9-19", "2026-09-19T00:00:00Z", " 2026-09-19"]) {
    assert.deepEqual(buildScheduleWeek(date), [], date);
  }
});
