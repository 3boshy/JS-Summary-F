export const SORT_OPTIONS = Object.freeze([
  { id: "most-used", label: "Most used" },
  { id: "newest", label: "Newest" },
  { id: "alphabetical", label: "A to Z" },
  { id: "last-updated", label: "Last edited" },
  { id: "favorites", label: "Favorites" }
]);

export const STATUS_OPTIONS = Object.freeze([
  { id: "in-stock", label: "In stock", color: "var(--color-success)" },
  { id: "low-stock", label: "Low stock", color: "var(--color-warning)" },
  { id: "out-of-stock", label: "Sold out", color: "var(--color-danger)" }
]);
