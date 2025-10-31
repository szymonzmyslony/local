import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Button, Input } from "@shared/ui";
import type { OpeningHoursItem } from "@shared";

type HoursEditorProps = {
  value: OpeningHoursItem[];
  disabled?: boolean;
  onSubmit: (payload: OpeningHoursItem[]) => Promise<void>;
};

type RangeState = {
  id: string;
  open: string;
  close: string;
};

type DayState = {
  weekday: number;
  ranges: RangeState[];
};

const weekdayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function GalleryHoursEditor({ value, disabled = false, onSubmit }: HoursEditorProps) {
  const [days, setDays] = useState<DayState[]>(() => initialiseDays(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDays(initialiseDays(value));
  }, [value]);

  const hasAnyHours = useMemo(() => days.some(day => day.ranges.some(range => range.open || range.close)), [days]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) {
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload(days);
      await onSubmit(payload);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      <div className="space-y-3">
        {days.map(day => (
          <div key={day.weekday} className="rounded-md border border-slate-200 p-4">
            <header className="flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-700">{weekdayLabels[day.weekday]}</span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="muted"
                  disabled={disabled || saving}
                  onClick={() =>
                    setDays(current =>
                      current.map(item =>
                        item.weekday === day.weekday
                          ? {
                              ...item,
                              ranges: []
                            }
                          : item
                      )
                    )
                  }
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={disabled || saving}
                  onClick={() =>
                    setDays(current =>
                      current.map(item =>
                        item.weekday === day.weekday
                          ? {
                              ...item,
                              ranges: [
                                ...item.ranges,
                                {
                                  id: generateId(),
                                  open: "",
                                  close: ""
                                }
                              ]
                            }
                          : item
                      )
                    )
                  }
                >
                  Add range
                </Button>
              </div>
            </header>
            {day.ranges.length === 0 ? (
              <p className="mt-3 text-xs text-slate-500">Closed</p>
            ) : (
              <div className="mt-3 space-y-2">
                {day.ranges.map(range => (
                  <div key={range.id} className="grid gap-3 md:grid-cols-[160px_160px_auto] md:items-center">
                    <Input
                      type="time"
                      value={range.open}
                      disabled={disabled || saving}
                      onChange={event =>
                        setDays(current =>
                          updateRange(current, day.weekday, range.id, { open: event.target.value })
                        )
                      }
                    />
                    <Input
                      type="time"
                      value={range.close}
                      disabled={disabled || saving}
                      onChange={event =>
                        setDays(current =>
                          updateRange(current, day.weekday, range.id, { close: event.target.value })
                        )
                      }
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={disabled || saving}
                      onClick={() =>
                        setDays(current =>
                          current.map(item =>
                            item.weekday === day.weekday
                              ? {
                                  ...item,
                                  ranges: item.ranges.filter(entry => entry.id !== range.id)
                                }
                              : item
                          )
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>{hasAnyHours ? "Review the schedule and save your changes." : "All days marked as closed."}</span>
        <Button type="submit" variant="primary" disabled={disabled || saving}>
          {saving ? "Saving…" : "Save hours"}
        </Button>
      </div>
    </form>
  );
}

function initialiseDays(hours: OpeningHoursItem[]): DayState[] {
  const base: DayState[] = weekdayLabels.map((_, index) => ({
    weekday: index,
    ranges: []
  }));

  hours.forEach(item => {
    const target = base[item.weekday];
    if (!target) return;
    target.ranges = item.open_minutes.map(range => ({
      id: generateId(),
      open: minutesToTime(range.open),
      close: minutesToTime(range.close)
    }));
  });

  return base;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function minutesToTime(value: number): string {
  const hours = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minutes = (value % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

function timeToMinutes(value: string): number | null {
  if (!value) {
    return null;
  }
  const [hours, minutes] = value.split(":").map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function updateRange(days: DayState[], weekday: number, id: string, patch: Partial<RangeState>): DayState[] {
  return days.map(item => {
    if (item.weekday !== weekday) {
      return item;
    }
    return {
      ...item,
      ranges: item.ranges.map(range => (range.id === id ? { ...range, ...patch } : range))
    };
  });
}

function buildPayload(days: DayState[]): OpeningHoursItem[] {
  return days
    .map(day => {
      const ranges = day.ranges
        .map(range => {
          const open = timeToMinutes(range.open);
          const close = timeToMinutes(range.close);
          if (open === null || close === null) {
            return null;
          }
          return { open, close };
        })
        .filter(Boolean) as OpeningHoursItem["open_minutes"];

      return ranges.length
        ? {
            weekday: day.weekday,
            open_minutes: ranges
          }
        : null;
    })
    .filter(Boolean) as OpeningHoursItem[];
}
