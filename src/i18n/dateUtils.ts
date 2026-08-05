import i18n from "./index";

function getLocale(): string {
  return i18n.language || "zh-CN";
}

export function formatWeekday(date: Date | string, locale?: string): string {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, { weekday: "short" }).format(
    date instanceof Date ? date : new Date(date),
  );
}

export function formatDateTime(date: Date | string, locale?: string): string {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatShortDate(date: Date | string, locale?: string): string {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatLongDate(date: Date | string, locale?: string): string {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}
