export class JsonDataProvider {
  constructor({ baseUrl = new URL("../database/", import.meta.url) } = {}) {
    this.baseUrl = baseUrl;
    this.cache = new Map();
  }

  async getCollection(collectionName, { force = false } = {}) {
    if (!force && this.cache.has(collectionName)) {
      return clone(this.cache.get(collectionName));
    }
    const url = new URL(`${collectionName}.json`, this.baseUrl);
    const response = await fetch(url, { cache: force ? "reload" : "default" });
    if (!response.ok) {
      throw new Error(`Unable to load ${collectionName}.json`);
    }
    const data = await response.json();
    this.cache.set(collectionName, data);
    return clone(data);
  }

  invalidate() {
    this.cache.clear();
  }
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
