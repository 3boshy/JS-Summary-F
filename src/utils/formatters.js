import { AppConfig } from "../config/app.config.js";

const numberFormatter = new Intl.NumberFormat("en-US");
const dateFormatter = new Intl.DateTimeFormat(AppConfig.locale, {
  day: "numeric",
  month: "short"
});

export function formatNumber(value) {
  return numberFormatter.format(Number(value || 0));
}

export function formatArabicNumber(value) {
  return formatNumber(value);
}

export function formatPrice(value) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) return "No price";
  return `${formatNumber(value)} IQD`;
}

export function formatDate(value) {
  if (!value) return "Not set";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  return dateFormatter.format(date);
}

export function formatRelative(value) {
  if (!value) return "Not yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not set";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${formatNumber(minutes)} min ago`;
  if (hours < 24) return `${formatNumber(hours)} hr ago`;
  if (days < 7) return `${formatNumber(days)} days ago`;
  return formatDate(value);
}

export function getStatusMeta(status) {
  const map = {
    "in-stock": { label: "In stock", color: "var(--color-success)" },
    "low-stock": { label: "Low stock", color: "var(--color-warning)" },
    "out-of-stock": { label: "Sold out", color: "var(--color-danger)" }
  };
  return map[status] || map["in-stock"];
}
