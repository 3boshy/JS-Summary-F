import { AppConfig } from "../config/app.config.js";

export class StorageService {
  constructor(prefix = AppConfig.storagePrefix) {
    this.prefix = prefix;
    this.memory = new Map();
  }

  key(name) {
    return `${this.prefix}:${name}`;
  }

  get(name, fallback = null) {
    const storageKey = this.key(name);
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw == null) return this.memory.has(storageKey) ? this.memory.get(storageKey) : fallback;
      return JSON.parse(raw);
    } catch {
      return this.memory.has(storageKey) ? this.memory.get(storageKey) : fallback;
    }
  }

  set(name, value) {
    const storageKey = this.key(name);
    this.memory.set(storageKey, value);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(value));
    } catch {
      // Private browsing or full storage still keeps the session alive via memory.
    }
    return value;
  }

  remove(name) {
    const storageKey = this.key(name);
    this.memory.delete(storageKey);
    try {
      window.localStorage.removeItem(storageKey);
    } catch {
      // No-op fallback.
    }
  }

  toggleArrayItem(name, id) {
    const current = new Set(this.get(name, []));
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    return this.set(name, Array.from(current));
  }

  pushUnique(name, value, limit = 20) {
    const next = [value, ...this.get(name, []).filter((item) => item !== value)].slice(0, limit);
    return this.set(name, next);
  }
}
