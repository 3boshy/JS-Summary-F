import { AppConfig } from "../config/app.config.js";

export class ItemRepository {
  constructor({ provider, storage }) {
    this.provider = provider;
    this.storage = storage;
    this.collections = {
      items: [],
      categories: [],
      departments: [],
      tags: [],
      settings: {}
    };
  }

  async hydrate({ force = false } = {}) {
    if (force) this.provider.invalidate();
    const [items, categories, departments, tags, settings] = await Promise.all([
      this.provider.getCollection("items", { force }),
      this.provider.getCollection("categories", { force }),
      this.provider.getCollection("departments", { force }),
      this.provider.getCollection("tags", { force }),
      this.provider.getCollection("settings", { force })
    ]);
    this.collections = { items, categories, departments, tags, settings };
    return this.snapshot();
  }

  snapshot() {
    const favorites = new Set(this.storage.get("favorites", []));
    const recentIds = this.storage.get("recentItems", []);
    const usage = this.storage.get("usageCounts", {});
    const lastUsed = this.storage.get("lastUsed", {});
    const soldCounts = this.storage.get("soldCounts", {});
    const items = this.collections.items.map((item) => {
      const baseQuantity = Number(item.metadata?.quantity || 0);
      const soldCount = Number(soldCounts[item.id] || 0);
      const quantity = Math.max(0, baseQuantity - soldCount);
      const status = quantity <= 0 ? "out-of-stock" : quantity <= 3 || item.status === "limited" ? "low-stock" : "in-stock";
      return {
        ...item,
        status,
        favorite: favorites.has(item.id) || Boolean(item.favorite),
        usageCount: Number(item.usageCount || 0) + Number(usage[item.id] || 0),
        lastUsed: lastUsed[item.id] || item.lastUsed || null,
        metadata: {
          ...item.metadata,
          baseQuantity,
          quantity,
          soldCount
        }
      };
    });
    return {
      items,
      categories: this.collections.categories,
      departments: this.collections.departments,
      tags: this.collections.tags,
      settings: {
        ...this.collections.settings,
        pageSize: this.collections.settings.pageSize || AppConfig.pageSize
      },
      favorites: Array.from(favorites),
      recentIds
    };
  }

  toggleFavorite(id) {
    const favorites = this.storage.toggleArrayItem("favorites", id);
    return { favorites, snapshot: this.snapshot() };
  }

  markOpened(id) {
    const recentIds = this.storage.pushUnique("recentItems", id, AppConfig.maxRecentItems);
    const usage = this.storage.get("usageCounts", {});
    const lastUsed = this.storage.get("lastUsed", {});
    usage[id] = Number(usage[id] || 0) + 1;
    lastUsed[id] = new Date().toISOString();
    this.storage.set("usageCounts", usage);
    this.storage.set("lastUsed", lastUsed);
    return { recentIds, snapshot: this.snapshot() };
  }

  sellOne(id) {
    const item = this.snapshot().items.find((entry) => entry.id === id);
    if (!item) {
      return { ok: false, reason: "missing", snapshot: this.snapshot() };
    }
    if (Number(item.metadata?.quantity || 0) <= 0) {
      return { ok: false, reason: "sold-out", snapshot: this.snapshot() };
    }
    const soldCounts = this.storage.get("soldCounts", {});
    const salesLog = this.storage.get("salesLog", []);
    soldCounts[id] = Number(soldCounts[id] || 0) + 1;
    this.storage.set("soldCounts", soldCounts);
    this.storage.set("salesLog", [
      { id, soldAt: new Date().toISOString(), quantity: 1 },
      ...salesLog
    ].slice(0, 250));
    return { ok: true, snapshot: this.snapshot() };
  }

  saveRecentSearch(term) {
    const normalized = String(term || "").trim();
    if (normalized.length < 2) return this.storage.get("recentSearches", []);
    return this.storage.pushUnique("recentSearches", normalized, AppConfig.maxRecentSearches);
  }

  getRecentSearches() {
    return this.storage.get("recentSearches", []);
  }

  getSavedFilters() {
    return this.storage.get("savedFilters", []);
  }

  saveFilter(filter) {
    const filters = this.storage.get("savedFilters", []).filter((item) => item.id !== filter.id);
    const next = [filter, ...filters].slice(0, AppConfig.maxSavedFilters);
    return this.storage.set("savedFilters", next);
  }

  removeFilter(id) {
    const next = this.storage.get("savedFilters", []).filter((filter) => filter.id !== id);
    return this.storage.set("savedFilters", next);
  }

  setTheme(theme) {
    return this.storage.set("theme", theme);
  }

  getTheme(defaultTheme = "auto") {
    return this.storage.get("theme", defaultTheme);
  }
}
