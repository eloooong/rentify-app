"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/button";
import type { BookingAvailability } from "@/lib/bookings/validation";
import {
  addDays,
  canPickUp,
  canReturn,
  firstPickup,
  formatDate,
  isBlocked,
  monthGrid,
  type IsoDate,
  type Selection,
} from "@/lib/listings/booking-dates";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const KEY_STEP: Record<string, number> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

const monthOf = (iso: IsoDate) => ({
  year: Number(iso.slice(0, 4)),
  month: Number(iso.slice(5, 7)) - 1,
});
const monthKey = ({ year, month }: { year: number; month: number }) =>
  year * 12 + month;

/**
 * One month at a time; the first click picks the pickup day and the second
 * the return day. Days stay focusable when unavailable (aria-disabled) so
 * arrow keys can move across the whole month.
 */
export function DateRangeCalendar({
  availability,
  selection,
  onSelect,
}: {
  availability: BookingAvailability;
  selection: Selection;
  onSelect: (date: IsoDate) => void;
}) {
  const first = monthOf(availability.from);
  const last = monthOf(availability.to);
  const [view, setView] = useState(() =>
    monthOf(selection.pickup ?? firstPickup(availability)),
  );
  const [focused, setFocused] = useState<IsoDate>(
    () => selection.pickup ?? firstPickup(availability),
  );
  const grid = useRef<HTMLTableElement>(null);
  const moveFocus = useRef(false);

  const { pickup, returnDate } = selection;
  const choosingReturn = Boolean(pickup && !returnDate);
  const selectable = (date: IsoDate) =>
    canPickUp(date, availability) ||
    (choosingReturn && canReturn(date, pickup!, availability));
  const inWindow = (date: IsoDate) =>
    date >= availability.from && date <= availability.to;

  const weeks = monthGrid(view.year, view.month);
  const days = weeks.flat().filter((day): day is IsoDate => Boolean(day));
  // The roving tab stop must be a day in the visible month.
  const tabStop = days.includes(focused)
    ? focused
    : (days.find(selectable) ?? days.find(inWindow) ?? days[0]);

  // Moving by keyboard may switch months, so focus the day after it renders.
  useEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    grid.current
      ?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)
      ?.focus();
  }, [focused, view]);

  function focusDay(date: IsoDate) {
    if (!inWindow(date)) return;
    moveFocus.current = true;
    setFocused(date);
    setView(monthOf(date));
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, date: IsoDate) {
    const step = KEY_STEP[event.key];
    if (step === undefined) return;
    event.preventDefault();
    focusDay(addDays(date, step));
  }

  function shiftMonth(by: number) {
    const key = monthKey(view) + by;
    setView({ year: Math.floor(key / 12), month: key % 12 });
  }

  function describe(date: IsoDate) {
    const parts = [formatDate(date, { dateStyle: "full" })];
    if (date === pickup) parts.push("pickup day");
    if (date === returnDate) parts.push("return day");
    if (!selectable(date))
      parts.push(
        isBlocked(date, availability) || !availability.device_available
          ? "unavailable"
          : "can't be selected",
      );
    return parts.join(", ");
  }

  const heading = formatDate(
    `${view.year}-${String(view.month + 1).padStart(2, "0")}-01`,
    { month: "long", year: "numeric" },
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Previous month"
          disabled={monthKey(view) <= monthKey(first)}
          onClick={() => shiftMonth(-1)}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <h3
          id="calendar-month"
          aria-live="polite"
          className="text-sm font-semibold text-fg"
        >
          {heading}
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Next month"
          disabled={monthKey(view) >= monthKey(last)}
          onClick={() => shiftMonth(1)}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>

      <table
        ref={grid}
        aria-labelledby="calendar-month"
        className="w-full table-fixed border-collapse text-center text-sm"
      >
        <thead>
          <tr>
            {WEEKDAYS.map((day) => (
              <th
                key={day}
                scope="col"
                className="pb-1 text-xs font-medium text-muted-foreground"
              >
                {day}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, row) => (
            <tr key={row}>
              {week.map((date, column) => {
                if (!date) return <td key={column} />;
                const enabled = selectable(date);
                const isEnd = date === pickup || date === returnDate;
                const inRange = Boolean(
                  pickup && returnDate && date > pickup && date < returnDate,
                );
                return (
                  <td key={date} className="p-0.5">
                    <button
                      type="button"
                      data-date={date}
                      tabIndex={date === tabStop ? 0 : -1}
                      aria-label={describe(date)}
                      aria-pressed={isEnd || inRange}
                      aria-disabled={!enabled}
                      onKeyDown={(event) => onKeyDown(event, date)}
                      onFocus={() => setFocused(date)}
                      onClick={() => enabled && onSelect(date)}
                      className={cn(
                        "flex aspect-square w-full items-center justify-center rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                        enabled
                          ? "text-fg hover:bg-surface-tint"
                          : "cursor-not-allowed text-muted-foreground",
                        !enabled &&
                          isBlocked(date, availability) &&
                          "line-through",
                        inRange && "bg-surface-tint text-fg",
                        isEnd &&
                          "bg-brand-strong font-semibold text-white no-underline hover:bg-brand-strong",
                      )}
                    >
                      {Number(date.slice(8))}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
