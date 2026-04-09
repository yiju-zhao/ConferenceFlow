import i18n from "./index";

function getLocale() {
  return i18n.language || "zh-CN";
}

export function formatDate(date, locale) {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatWeekday(date, locale) {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, { weekday: "short" }).format(
    date instanceof Date ? date : new Date(date),
  );
}

export function formatDateTime(date, locale) {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatShortDate(date, locale) {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}

export function formatLongDate(date, locale) {
  const loc = locale || getLocale();
  return new Intl.DateTimeFormat(loc, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date instanceof Date ? date : new Date(date));
}
