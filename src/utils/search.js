import { escapeHtml } from "./dom.js";

const arabicNormalization = [
  [/[\u064B-\u065F]/g, ""],
  [/[إأآا]/g, "ا"],
  [/ى/g, "ي"],
  [/ؤ/g, "و"],
  [/ئ/g, "ي"],
  [/ة/g, "ه"]
];

export function normalizeSearch(value = "") {
  let normalized = String(value).toLowerCase().trim();
  arabicNormalization.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  return normalized.replace(/\s+/g, " ");
}

export function tokenize(value = "") {
  return normalizeSearch(value).split(" ").filter(Boolean);
}

export function getSearchText(item) {
  return normalizeSearch([
    item.title,
    item.description,
    item.category,
    item.department,
    item.status,
    item.metadata?.brand,
    item.metadata?.sku,
    item.metadata?.barcode,
    ...(item.tags || []),
    ...(item.searchKeywords || [])
  ].join(" "));
}

export function itemMatchesQuery(item, query) {
  const tokens = tokenize(query);
  if (!tokens.length) return true;
  const searchText = getSearchText(item);
  return tokens.every((token) => searchText.includes(token));
}

export function highlightText(value, query) {
  const safeValue = escapeHtml(value);
  const tokens = tokenize(query).filter((token) => token.length > 1).slice(0, 4);
  if (!tokens.length) return safeValue;
  const escaped = tokens.map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const regex = new RegExp(`(${escaped.join("|")})`, "gi");
  return safeValue.replace(regex, "<mark>$1</mark>");
}

export function buildSmartSuggestions({ items, departments, categories, recentSearches }) {
  const frequentBrands = departments
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)
    .map((department) => ({ id: `department:${department.id}`, label: department.title, type: "department", value: department.id }));
  const frequentCategories = categories
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((category) => ({ id: `category:${category.id}`, label: category.title, type: "category", value: category.id }));
  const recent = recentSearches
    .filter(Boolean)
    .slice(0, 3)
    .map((term) => ({ id: `search:${term}`, label: term, type: "search", value: term }));
  const lowStockCount = items.filter((item) => item.metadata?.quantity <= 3).length;
  return [
    ...recent,
    ...frequentBrands,
    ...frequentCategories,
    ...(lowStockCount ? [{ id: "status:low-stock", label: "Low stock", type: "status", value: "low-stock" }] : [])
  ];
}
