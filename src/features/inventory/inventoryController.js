import { AppConfig } from "../../config/app.config.js";
import { SORT_OPTIONS, STATUS_OPTIONS } from "../../constants/sortOptions.js";
import { BottomSheet } from "../../components/bottomSheet.js";
import { icon } from "../../components/icons.js";
import { renderItemCard } from "../../components/itemCard.js";
import { copyText } from "../../services/clipboardService.js";
import { Haptics } from "../../services/hapticService.js";
import { SnackbarService } from "../../services/snackbarService.js";
import { createRipple, escapeHtml, qs } from "../../utils/dom.js";
import { formatNumber, formatPrice } from "../../utils/formatters.js";
import { buildSmartSuggestions, itemMatchesQuery } from "../../utils/search.js";
import { debounce, idle, throttle } from "../../utils/scheduler.js";

const collator = new Intl.Collator(["ar", "en"], { numeric: true, sensitivity: "base" });

export class InventoryController {
  constructor({ root, repository }) {
    this.root = root;
    this.repository = repository;
    this.sheet = null;
    this.snackbar = null;
    this.elements = {};
    this.motion = { tiltX: 0, tiltY: 0, parallaxY: 0 };
    this.pointerState = null;
    this.longPressTimer = null;
    this.ignoreNextClick = false;
    this.pullState = { startY: 0, active: false, distance: 0 };
    this.state = {
      loading: true,
      error: null,
      items: [],
      categories: [],
      departments: [],
      tags: [],
      settings: { pageSize: AppConfig.pageSize },
      query: "",
      view: "all",
      sort: "most-used",
      selectedCategories: new Set(),
      selectedDepartments: new Set(),
      selectedStatuses: new Set(),
      expandedId: null,
      visibleCount: AppConfig.pageSize,
      recentIds: [],
      recentSearches: [],
      savedFilters: [],
      theme: "auto",
      memoKey: "",
      memoResults: [],
      snapshotVersion: 0
    };
    this.renderDebounced = debounce(() => this.renderDynamic(), AppConfig.searchDebounceMs);
    this.saveSearchDebounced = debounce((term) => this.saveRecentSearch(term), 650);
    this.onScroll = throttle(() => this.handleScroll(), 42);
  }

  async init() {
    this.renderShell();
    this.cacheElements();
    this.bindEvents();
    this.applyTheme();
    this.renderDynamic();
    await this.load();
    idle(() => this.installLazyObserver());
  }

  renderShell() {
    this.root.innerHTML = `
      <div class="page-background" aria-hidden="true"></div>
      <div class="offline-banner" id="offlineBanner">${icon("wifiOff", 16)} You are offline. Cached stock will keep working.</div>
      <div class="pull-indicator" id="pullIndicator"><span class="pull-spinner"></span><span data-pull-label>Pull to refresh</span></div>

      <div class="app-shell">
        <header class="hero" id="hero">
          <div class="hero-card" id="heroCard">
            <div class="brand-lockup" aria-label="DNA. STOCK">
              <span class="brand-dna">DNA.</span>
              <span class="brand-stock">STOCK<span class="hero-barcode" aria-hidden="true"></span></span>
            </div>
            <div class="hero-stats" id="heroStats"></div>
          </div>
        </header>

        <main class="content" id="mainContent">
          <section class="floating-search" id="floatingSearch" aria-label="Fast search">
            <label class="search-card" data-ripple>
              ${icon("search", 21)}
              <input id="searchInput" class="search-input" type="search" inputmode="search" autocomplete="off" placeholder="Search name, brand, code, or barcode..." aria-label="Search stock">
              <button class="search-clear" id="searchClear" type="button" data-action="clear-search" data-ripple aria-label="Clear search">${icon("x", 18)}</button>
            </label>
          </section>

          <div class="smart-strip" id="smartStrip" aria-label="Smart suggestions"></div>

          <section class="section-title">
            <div>
              <h2>Quick stuff</h2>
              <p>Fast shortcuts for the things the team uses most.</p>
            </div>
          </section>
          <section class="quick-grid" id="quickGrid" aria-label="Quick actions"></section>

          <section class="section-title">
            <div>
              <h2>Smart filters</h2>
              <p id="filterSummary">All stock</p>
            </div>
            <button class="ghost-button" data-ripple data-action="open-filters">${icon("sliders", 17)} Filters</button>
          </section>
          <section class="chips-row" id="departmentChips" aria-label="Filter by brand"></section>
          <section class="chips-row" id="categoryChips" aria-label="Filter by type"></section>

          <section class="results-toolbar" aria-live="polite">
            <div class="results-count">
              <strong id="resultsCount">0</strong>
              <span id="resultsLabel">items</span>
            </div>
            <div class="toolbar-actions">
              <button class="ghost-button desktop-only" data-ripple data-action="toggle-theme">${icon("moon", 17)} Theme</button>
              <button class="primary-button" data-ripple data-action="open-filters">${icon("filter", 17)} Sort</button>
            </div>
          </section>

          <section class="item-list" id="itemList" aria-busy="true"></section>
          <div class="sentinel" id="sentinel" aria-hidden="true"></div>
        </main>

        <button class="fab" data-ripple data-action="open-filters" aria-label="Open filters">${icon("sliders", 22)}</button>
        <nav class="bottom-nav" id="bottomNav" aria-label="Main navigation"></nav>
      </div>

      <div class="sheet-backdrop" id="sheetBackdrop"></div>
      <aside class="bottom-sheet" id="bottomSheet" role="dialog" aria-modal="true" aria-label="Options">
        <div class="sheet-handle"></div>
        <div class="sheet-body" data-sheet-body></div>
      </aside>
      <div class="snackbar-region" id="snackbarRegion" aria-live="polite"></div>
    `;
  }

  cacheElements() {
    this.elements = {
      offlineBanner: qs("#offlineBanner", this.root),
      pullIndicator: qs("#pullIndicator", this.root),
      pullLabel: qs("[data-pull-label]", this.root),
      heroCard: qs("#heroCard", this.root),
      heroStats: qs("#heroStats", this.root),
      floatingSearch: qs("#floatingSearch", this.root),
      searchInput: qs("#searchInput", this.root),
      searchClear: qs("#searchClear", this.root),
      smartStrip: qs("#smartStrip", this.root),
      quickGrid: qs("#quickGrid", this.root),
      filterSummary: qs("#filterSummary", this.root),
      departmentChips: qs("#departmentChips", this.root),
      categoryChips: qs("#categoryChips", this.root),
      resultsCount: qs("#resultsCount", this.root),
      resultsLabel: qs("#resultsLabel", this.root),
      itemList: qs("#itemList", this.root),
      sentinel: qs("#sentinel", this.root),
      bottomNav: qs("#bottomNav", this.root),
      bottomSheet: qs("#bottomSheet", this.root),
      sheetBackdrop: qs("#sheetBackdrop", this.root),
      snackbarRegion: qs("#snackbarRegion", this.root)
    };
    this.sheet = new BottomSheet({ sheet: this.elements.bottomSheet, backdrop: this.elements.sheetBackdrop });
    this.snackbar = new SnackbarService(this.elements.snackbarRegion);
  }

  bindEvents() {
    this.root.addEventListener("click", (event) => this.handleClick(event));
    this.root.addEventListener("input", (event) => this.handleInput(event));
    this.root.addEventListener("keydown", (event) => this.handleKeydown(event));
    this.root.addEventListener("pointerdown", (event) => this.handlePointerDown(event));
    this.root.addEventListener("pointermove", (event) => this.handlePointerMove(event));
    this.root.addEventListener("pointerup", (event) => this.handlePointerUp(event));
    this.root.addEventListener("pointercancel", () => this.clearPointerState());
    this.root.addEventListener("contextmenu", (event) => this.handleContextMenu(event));
    this.elements.heroCard.addEventListener("pointermove", (event) => this.handleHeroPointerMove(event));
    this.elements.heroCard.addEventListener("pointerleave", () => this.resetHeroTilt());
    window.addEventListener("scroll", this.onScroll, { passive: true });
    window.addEventListener("online", () => this.updateNetworkState());
    window.addEventListener("offline", () => this.updateNetworkState());
    document.addEventListener("touchstart", (event) => this.handlePullStart(event), { passive: true });
    document.addEventListener("touchmove", (event) => this.handlePullMove(event), { passive: true });
    document.addEventListener("touchend", () => this.handlePullEnd(), { passive: true });
  }

  async load(force = false) {
    this.state.loading = true;
    this.state.error = null;
    this.invalidateMemo();
    this.renderItems();
    try {
      const snapshot = await this.repository.hydrate({ force });
      this.applySnapshot(snapshot);
      this.state.theme = this.repository.getTheme(snapshot.settings.defaultTheme || "auto");
      this.applyTheme();
      this.state.loading = false;
      this.renderDynamic();
      this.updateNetworkState();
      if (force) this.snackbar.show("Stock refreshed", { tone: "success" });
    } catch (error) {
      this.state.loading = false;
      this.state.error = error;
      this.renderDynamic();
      this.snackbar.show("Stock data didn’t load", { tone: "error" });
    }
  }

  applySnapshot(snapshot) {
    this.state.items = snapshot.items;
    this.state.categories = snapshot.categories;
    this.state.departments = snapshot.departments;
    this.state.tags = snapshot.tags;
    this.state.settings = snapshot.settings;
    this.state.recentIds = snapshot.recentIds;
    this.state.recentSearches = this.repository.getRecentSearches();
    this.state.savedFilters = this.repository.getSavedFilters();
    this.state.visibleCount = snapshot.settings.pageSize || AppConfig.pageSize;
    this.state.snapshotVersion += 1;
    this.invalidateMemo();
  }

  renderDynamic() {
    this.updateSearchUi();
    this.renderHeroStats();
    this.renderSmartSuggestions();
    this.renderQuickActions();
    this.renderChips();
    this.renderToolbar();
    this.renderBottomNav();
    this.renderItems();
    this.updateNetworkState();
  }

  renderHeroStats() {
    const favorites = this.state.items.filter((item) => item.favorite).length;
    const available = this.state.items.filter((item) => item.status !== "out-of-stock").length;
    const sold = this.state.items.reduce((sum, item) => sum + Number(item.metadata?.soldCount || 0), 0);
    this.elements.heroStats.innerHTML = [
      { value: this.state.items.length, label: "Items" },
      { value: available, label: "Available" },
      { value: sold || favorites, label: sold ? "Sold" : "Favs" }
    ].map((stat) => `
      <div class="stat-pill">
        <strong>${formatNumber(stat.value)}</strong>
        <span>${stat.label}</span>
      </div>
    `).join("");
  }

  renderSmartSuggestions() {
    const suggestions = buildSmartSuggestions({
      items: this.state.items,
      departments: this.state.departments,
      categories: this.state.categories,
      recentSearches: this.state.recentSearches
    }).slice(0, 10);
    this.elements.smartStrip.innerHTML = suggestions.map((suggestion) => `
      <button class="suggestion" data-ripple data-action="select-suggestion" data-type="${escapeHtml(suggestion.type)}" data-value="${escapeHtml(suggestion.value)}">
        ${escapeHtml(suggestion.label)}
      </button>
    `).join("");
  }

  renderQuickActions() {
    const favorites = this.state.items.filter((item) => item.favorite).length;
    const sold = this.state.items.reduce((sum, item) => sum + Number(item.metadata?.soldCount || 0), 0);
    const lowStock = this.state.items.filter((item) => item.status === "low-stock").length;
    const topDepartment = this.state.departments.slice().sort((a, b) => b.count - a.count)[0];
    const actions = [
      { icon: "heart", title: "Favorites", meta: `${formatNumber(favorites)} saved`, action: "set-view", attrs: 'data-view="favorites"' },
      { icon: "check", title: "Sold items", meta: `${formatNumber(sold)} sold`, action: "set-view", attrs: 'data-view="sold"' },
      { icon: "bolt", title: "Low stock", meta: `${formatNumber(lowStock)} need attention`, action: "quick-filter", attrs: 'data-filter-type="status" data-filter-id="low-stock"' },
      { icon: topDepartment?.icon || "building", title: topDepartment?.title || "Apple", meta: "Top brand", action: "quick-filter", attrs: `data-filter-type="department" data-filter-id="${escapeHtml(topDepartment?.id || "apple")}"` }
    ];
    this.elements.quickGrid.innerHTML = actions.map((item) => `
      <button class="quick-action" data-ripple data-action="${item.action}" ${item.attrs}>
        ${icon(item.icon, 22)}
        <strong>${escapeHtml(item.title)}</strong>
        <span>${escapeHtml(item.meta)}</span>
      </button>
    `).join("");
  }

  renderChips() {
    this.elements.departmentChips.innerHTML = [
      this.renderChip({ id: "all", label: "All brands", count: this.state.departments.reduce((sum, item) => sum + item.count, 0), active: !this.state.selectedDepartments.size, action: "clear-departments" }),
      ...this.state.departments.map((department) => this.renderChip({
        id: department.id,
        label: department.title,
        count: department.count,
        color: department.color,
        active: this.state.selectedDepartments.has(department.id),
        action: "toggle-department"
      }))
    ].join("");

    this.elements.categoryChips.innerHTML = [
      this.renderChip({ id: "all", label: "All types", count: this.state.categories.reduce((sum, item) => sum + item.count, 0), active: !this.state.selectedCategories.size, action: "clear-categories" }),
      ...this.state.categories.map((category) => this.renderChip({
        id: category.id,
        label: category.title,
        count: category.count,
        active: this.state.selectedCategories.has(category.id),
        action: "toggle-category"
      }))
    ].join("");
  }

  renderChip({ id, label, count, color = "var(--color-accent)", active, action }) {
    return `
      <button class="chip ${active ? "is-active" : ""}" style="--chip-color: ${escapeHtml(color)}" data-ripple data-action="${action}" data-id="${escapeHtml(id)}">
        <span class="chip__dot"></span>
        <span>${escapeHtml(label)}</span>
        <span class="chip__count">${formatNumber(count)}</span>
      </button>
    `;
  }

  renderToolbar() {
    const items = this.getFilteredItems();
    this.elements.resultsCount.textContent = formatNumber(items.length);
    this.elements.resultsLabel.textContent = this.getResultsLabel();
    this.elements.filterSummary.textContent = this.getFilterSummary(items.length);
  }

  renderBottomNav() {
    const items = [
      { view: "all", label: "All", icon: "home", action: "set-view" },
      { view: "search", label: "Search", icon: "search", action: "focus-search" },
      { view: "favorites", label: "Favs", icon: "heart", action: "set-view" },
      { view: "sold", label: "Sold", icon: "check", action: "set-view" },
      { view: "filters", label: "Filters", icon: "sliders", action: "open-filters" }
    ];
    this.elements.bottomNav.innerHTML = items.map((item) => {
      const isActive = item.view === this.state.view || (item.view === "filters" && this.countActiveFilters() > 0);
      const attrs = item.action === "set-view" ? `data-view="${item.view}"` : "";
      return `
        <button class="bottom-nav__item ${isActive ? "is-active" : ""}" data-ripple data-action="${item.action}" ${attrs} aria-label="${escapeHtml(item.label)}">
          ${icon(item.icon, 19)}
          <span>${escapeHtml(item.label)}</span>
        </button>
      `;
    }).join("");
  }

  renderItems() {
    if (!this.elements.itemList) return;
    this.elements.itemList.setAttribute("aria-busy", String(this.state.loading));
    if (this.state.loading) {
      this.elements.itemList.innerHTML = "";
      return;
    }
    if (this.state.error) {
      this.elements.itemList.innerHTML = `
        <div class="error-state">
          <div>
            <div class="state-icon">${icon("alert", 30)}</div>
            <h3>Couldn’t load stock</h3>
            <p>Check the connection and try again.</p>
            <button class="primary-button state-button" data-ripple data-action="retry-load">${icon("refresh", 17)} Try again</button>
          </div>
        </div>
      `;
      return;
    }
    const items = this.getFilteredItems();
    if (!items.length) {
      this.elements.itemList.innerHTML = `
        <div class="empty-state">
          <div>
            <div class="state-icon">${icon("search", 30)}</div>
            <h3>No matches</h3>
            <p>Try a code, barcode, brand name, or clear some filters.</p>
            <button class="ghost-button state-button" data-ripple data-action="reset-filters">${icon("x", 17)} Clear filters</button>
          </div>
        </div>
      `;
      return;
    }
    const visibleItems = items.slice(0, this.state.visibleCount);
    this.elements.itemList.innerHTML = visibleItems
      .map((item, index) => renderItemCard(item, {
        query: this.state.query,
        expanded: this.state.expandedId === item.id,
        index
      }))
      .join("");
  }

  getFilteredItems() {
    const key = JSON.stringify({
      query: this.state.query,
      view: this.state.view,
      sort: this.state.sort,
      categories: Array.from(this.state.selectedCategories).sort(),
      departments: Array.from(this.state.selectedDepartments).sort(),
      statuses: Array.from(this.state.selectedStatuses).sort(),
      version: this.state.snapshotVersion
    });
    if (key === this.state.memoKey) return this.state.memoResults;

    let items = this.state.items.filter((item) => item.visible !== false);

    if (this.state.view === "favorites") items = items.filter((item) => item.favorite);
    if (this.state.view === "sold") items = items.filter((item) => Number(item.metadata?.soldCount || 0) > 0);
    if (this.state.selectedCategories.size) items = items.filter((item) => this.state.selectedCategories.has(item.category));
    if (this.state.selectedDepartments.size) items = items.filter((item) => this.state.selectedDepartments.has(item.department));
    if (this.state.selectedStatuses.size) items = items.filter((item) => this.state.selectedStatuses.has(item.status));
    if (this.state.query) items = items.filter((item) => itemMatchesQuery(item, this.state.query));

    items = items.slice().sort((a, b) => this.compareItems(a, b));
    this.state.memoKey = key;
    this.state.memoResults = items;
    return items;
  }

  compareItems(a, b) {
    if (this.state.view === "sold" && this.state.sort === "most-used") {
      return Number(b.metadata?.soldCount || 0) - Number(a.metadata?.soldCount || 0);
    }
    if (this.state.sort === "newest") {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() || a.metadata.originalIndex - b.metadata.originalIndex;
    }
    if (this.state.sort === "alphabetical") {
      return collator.compare(a.title, b.title);
    }
    if (this.state.sort === "last-updated") {
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime() || b.usageCount - a.usageCount;
    }
    if (this.state.sort === "favorites") {
      return Number(b.favorite) - Number(a.favorite) || b.usageCount - a.usageCount || a.metadata.originalIndex - b.metadata.originalIndex;
    }
    return b.usageCount - a.usageCount || b.metadata.quantity - a.metadata.quantity || a.metadata.originalIndex - b.metadata.originalIndex;
  }

  handleInput(event) {
    if (event.target.id !== "searchInput") return;
    this.state.query = event.target.value.trim();
    this.state.view = this.state.view === "search" ? "all" : this.state.view;
    this.state.expandedId = null;
    this.resetVisibleCount();
    this.invalidateMemo();
    this.updateSearchUi();
    this.renderDebounced();
    this.saveSearchDebounced(this.state.query);
  }

  async handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (actionTarget) {
      event.preventDefault();
      await this.handleAction(actionTarget.dataset, actionTarget);
      return;
    }
    const card = event.target.closest(".item-card");
    if (!card) return;
    if (this.ignoreNextClick) {
      this.ignoreNextClick = false;
      return;
    }
    await this.openItemSheet(card.dataset.id);
  }

  async handleAction(dataset, target) {
    const action = dataset.action;
    if (action !== "focus-search") Haptics.tap();
    const insideSheet = Boolean(target?.closest(".bottom-sheet"));
    switch (action) {
      case "clear-search":
        this.setQuery("");
        break;
      case "focus-search":
        this.focusSearch();
        break;
      case "set-view":
        this.setView(dataset.view || "all");
        break;
      case "quick-filter":
        this.applyQuickFilter(dataset.filterType, dataset.filterId);
        break;
      case "open-filters":
        this.openFilterSheet();
        break;
      case "close-sheet":
        this.sheet.close();
        break;
      case "retry-load":
        await this.load(true);
        break;
      case "toggle-category":
        this.toggleSetValue("selectedCategories", dataset.id);
        if (insideSheet) this.openFilterSheet();
        break;
      case "toggle-department":
        this.toggleSetValue("selectedDepartments", dataset.id);
        if (insideSheet) this.openFilterSheet();
        break;
      case "toggle-status":
        this.toggleSetValue("selectedStatuses", dataset.id);
        if (insideSheet) this.openFilterSheet();
        break;
      case "clear-categories":
        this.state.selectedCategories.clear();
        this.afterFilterChange();
        if (insideSheet) this.openFilterSheet();
        break;
      case "clear-departments":
        this.state.selectedDepartments.clear();
        this.afterFilterChange();
        if (insideSheet) this.openFilterSheet();
        break;
      case "set-sort":
        this.state.sort = dataset.sort || "most-used";
        this.afterFilterChange();
        if (insideSheet) this.openFilterSheet();
        break;
      case "save-filter":
        this.saveCurrentFilter();
        break;
      case "apply-saved-filter":
        this.applySavedFilter(dataset.id);
        break;
      case "remove-saved-filter":
        this.removeSavedFilter(dataset.id);
        break;
      case "reset-filters":
        this.resetFilters();
        break;
      case "select-suggestion":
        this.applySuggestion(dataset.type, dataset.value);
        break;
      case "toggle-theme":
        this.toggleTheme();
        break;
      case "favorite":
        this.toggleFavorite(dataset.id);
        break;
      case "request-sale":
        await this.openSaleConfirm(dataset.id);
        break;
      case "confirm-sale":
        this.confirmSale(dataset.id);
        break;
      case "copy-sku":
        await this.copyItemValue(dataset.id, "sku");
        break;
      case "copy-barcode":
        await this.copyItemValue(dataset.id, "barcode");
        break;
      case "share-item":
        await this.shareItem(dataset.id);
        break;
      default:
        break;
    }
  }

  handleKeydown(event) {
    if ((event.key !== "Enter" && event.key !== " ") || !event.target.classList.contains("item-card")) return;
    event.preventDefault();
    this.openItemSheet(event.target.dataset.id);
  }

  handlePointerDown(event) {
    const rippleTarget = event.target.closest("[data-ripple]");
    if (rippleTarget) createRipple(event, rippleTarget);
    const card = event.target.closest(".item-card");
    if (!card || event.target.closest("button, input")) return;
    this.pointerState = {
      id: card.dataset.id,
      card,
      x: event.clientX,
      y: event.clientY,
      moved: false
    };
    this.longPressTimer = window.setTimeout(() => {
      if (!this.pointerState || this.pointerState.moved) return;
      this.ignoreNextClick = true;
      Haptics.tap();
      this.openItemSheet(this.pointerState.id);
      this.clearPointerState();
    }, 540);
  }

  handlePointerMove(event) {
    if (!this.pointerState) return;
    const dx = event.clientX - this.pointerState.x;
    const dy = event.clientY - this.pointerState.y;
    if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
      this.pointerState.moved = true;
      window.clearTimeout(this.longPressTimer);
    }
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 14) {
      this.pointerState.card.style.transform = `translate3d(${dx * 0.16}px, 0, 0)`;
    }
  }

  async handlePointerUp(event) {
    if (!this.pointerState) return;
    const { id, x, y, card } = this.pointerState;
    const dx = event.clientX - x;
    const dy = event.clientY - y;
    card.style.transform = "";
    this.clearPointerState();
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      this.ignoreNextClick = true;
      if (dx > 0) {
        this.toggleFavorite(id);
      } else {
        await this.openItemSheet(id);
      }
    }
  }

  clearPointerState() {
    window.clearTimeout(this.longPressTimer);
    if (this.pointerState?.card) this.pointerState.card.style.transform = "";
    this.pointerState = null;
  }

  handleContextMenu(event) {
    const card = event.target.closest(".item-card");
    if (!card) return;
    event.preventDefault();
    Haptics.tap();
    this.openItemSheet(card.dataset.id);
  }

  handleHeroPointerMove(event) {
    const rect = this.elements.heroCard.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    this.motion.tiltX = x * 4;
    this.motion.tiltY = y * -3;
    this.updateHeroTransform();
  }

  resetHeroTilt() {
    this.motion.tiltX = 0;
    this.motion.tiltY = 0;
    this.updateHeroTransform();
  }

  handleScroll() {
    const y = window.scrollY || 0;
    this.elements.floatingSearch.classList.toggle("is-compact", y > 92);
    this.motion.parallaxY = Math.min(22, y * 0.055);
    this.updateHeroTransform();
  }

  updateHeroTransform() {
    const { tiltX, tiltY, parallaxY } = this.motion;
    this.elements.heroCard.style.transform = `perspective(1000px) rotateX(${tiltY}deg) rotateY(${tiltX}deg) translate3d(0, ${parallaxY}px, 0)`;
  }

  handlePullStart(event) {
    if (window.scrollY > 0 || !event.touches.length) return;
    this.pullState = { startY: event.touches[0].clientY, active: true, distance: 0 };
  }

  handlePullMove(event) {
    if (!this.pullState.active || !event.touches.length) return;
    const distance = Math.max(0, event.touches[0].clientY - this.pullState.startY);
    this.pullState.distance = distance;
    if (distance < 18) return;
    this.elements.pullIndicator.classList.add("is-visible");
    this.elements.pullLabel.textContent = distance > AppConfig.pullRefreshDistance ? "Release to refresh" : "Pull to refresh";
  }

  async handlePullEnd() {
    if (!this.pullState.active) return;
    const shouldRefresh = this.pullState.distance > AppConfig.pullRefreshDistance;
    this.pullState = { startY: 0, active: false, distance: 0 };
    this.elements.pullIndicator.classList.remove("is-visible");
    if (shouldRefresh) {
      Haptics.success();
      await this.load(true);
    }
  }

  installLazyObserver() {
    if (!("IntersectionObserver" in window) || !this.elements.sentinel) return;
    this.lazyObserver?.disconnect();
    this.lazyObserver = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      const total = this.getFilteredItems().length;
      if (this.state.visibleCount >= total) return;
      this.state.visibleCount += this.state.settings.pageSize || AppConfig.pageSize;
      this.renderItems();
    }, { rootMargin: "720px 0px" });
    this.lazyObserver.observe(this.elements.sentinel);
  }

  toggleCard(id) {
    this.state.expandedId = this.state.expandedId === id ? null : id;
    this.renderItems();
  }

  setQuery(value) {
    this.state.query = String(value || "").trim();
    this.elements.searchInput.value = this.state.query;
    this.afterFilterChange();
  }

  setView(view) {
    if (view === "search") {
      this.focusSearch();
      return;
    }
    this.state.view = view || "all";
    this.state.expandedId = null;
    this.afterFilterChange();
  }

  focusSearch() {
    this.elements.searchInput.focus({ preventScroll: true });
    this.elements.floatingSearch.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  applyQuickFilter(type, id) {
    this.state.view = "all";
    if (type === "department") {
      this.state.selectedDepartments = new Set([id]);
    }
    if (type === "category") {
      this.state.selectedCategories = new Set([id]);
    }
    if (type === "status") {
      this.state.selectedStatuses = new Set([id]);
    }
    this.afterFilterChange();
  }

  applySuggestion(type, value) {
    this.state.view = "all";
    if (type === "search") {
      this.setQuery(value);
      return;
    }
    if (type === "department") this.state.selectedDepartments = new Set([value]);
    if (type === "category") this.state.selectedCategories = new Set([value]);
    if (type === "status") this.state.selectedStatuses = new Set([value]);
    this.afterFilterChange();
  }

  toggleSetValue(setName, id) {
    if (!id || id === "all") return;
    const set = this.state[setName];
    if (set.has(id)) {
      set.delete(id);
    } else {
      set.add(id);
    }
    this.afterFilterChange();
  }

  afterFilterChange() {
    this.resetVisibleCount();
    this.state.expandedId = null;
    this.invalidateMemo();
    this.renderWithTransition();
  }

  renderWithTransition() {
    const canTransition = document.startViewTransition && window.matchMedia("(prefers-reduced-motion: no-preference)").matches;
    if (!canTransition) {
      this.renderDynamic();
      return;
    }
    document.startViewTransition(() => this.renderDynamic());
  }

  resetFilters() {
    this.state.query = "";
    this.state.view = "all";
    this.state.sort = "most-used";
    this.state.selectedCategories.clear();
    this.state.selectedDepartments.clear();
    this.state.selectedStatuses.clear();
    this.elements.searchInput.value = "";
    this.sheet.close();
    this.afterFilterChange();
    this.snackbar.show("Filters cleared", { tone: "success" });
  }

  resetVisibleCount() {
    this.state.visibleCount = this.state.settings.pageSize || AppConfig.pageSize;
  }

  invalidateMemo() {
    this.state.memoKey = "";
    this.state.memoResults = [];
  }

  updateSearchUi() {
    this.elements.searchClear.classList.toggle("is-visible", Boolean(this.state.query));
    if (document.activeElement !== this.elements.searchInput && this.elements.searchInput.value !== this.state.query) {
      this.elements.searchInput.value = this.state.query;
    }
  }

  updateNetworkState() {
    this.elements.offlineBanner.classList.toggle("is-visible", !navigator.onLine);
  }

  getResultsLabel() {
    const sortLabel = SORT_OPTIONS.find((option) => option.id === this.state.sort)?.label || "Most used";
    if (this.state.view === "favorites") return `Favorites · ${sortLabel}`;
    if (this.state.view === "sold") return `Sold items · ${sortLabel}`;
    return `All items · ${sortLabel}`;
  }

  getFilterSummary(count) {
    const filters = [];
    if (this.state.query) filters.push(`Search: ${this.state.query}`);
    if (this.state.selectedDepartments.size) filters.push(`${this.state.selectedDepartments.size} brands`);
    if (this.state.selectedCategories.size) filters.push(`${this.state.selectedCategories.size} types`);
    if (this.state.selectedStatuses.size) filters.push(`${this.state.selectedStatuses.size} statuses`);
    return filters.length ? `${formatNumber(count)} results · ${filters.join(" · ")}` : "All stock";
  }

  countActiveFilters() {
    return [
      this.state.query,
      this.state.selectedCategories.size,
      this.state.selectedDepartments.size,
      this.state.selectedStatuses.size,
      this.state.view !== "all" ? 1 : 0,
      this.state.sort !== "most-used" ? 1 : 0
    ].filter(Boolean).length;
  }

  saveRecentSearch(term) {
    if (!term || term.length < 2) return;
    this.state.recentSearches = this.repository.saveRecentSearch(term);
    this.renderSmartSuggestions();
  }

  saveCurrentFilter() {
    const filter = {
      id: `filter-${Date.now()}`,
      label: this.buildFilterLabel(),
      query: this.state.query,
      view: this.state.view,
      sort: this.state.sort,
      categories: Array.from(this.state.selectedCategories),
      departments: Array.from(this.state.selectedDepartments),
      statuses: Array.from(this.state.selectedStatuses),
      createdAt: new Date().toISOString()
    };
    this.state.savedFilters = this.repository.saveFilter(filter);
    this.openFilterSheet();
    this.snackbar.show("Filter saved", { tone: "success" });
  }

  buildFilterLabel() {
    if (this.state.query) return `Search: ${this.state.query}`;
    const department = this.state.departments.find((item) => this.state.selectedDepartments.has(item.id));
    const category = this.state.categories.find((item) => this.state.selectedCategories.has(item.id));
    return department?.title || category?.title || "Saved filter";
  }

  applySavedFilter(id) {
    const filter = this.state.savedFilters.find((item) => item.id === id);
    if (!filter) return;
    this.state.query = filter.query || "";
    this.state.view = filter.view || "all";
    this.state.sort = filter.sort || "most-used";
    this.state.selectedCategories = new Set(filter.categories || []);
    this.state.selectedDepartments = new Set(filter.departments || []);
    this.state.selectedStatuses = new Set(filter.statuses || []);
    this.elements.searchInput.value = this.state.query;
    this.sheet.close();
    this.afterFilterChange();
  }

  removeSavedFilter(id) {
    this.state.savedFilters = this.repository.removeFilter(id);
    this.openFilterSheet();
  }

  openFilterSheet() {
    const sortButtons = SORT_OPTIONS.map((option) => `
      <button class="chip ${this.state.sort === option.id ? "is-active" : ""}" data-ripple data-action="set-sort" data-sort="${option.id}">
        <span>${escapeHtml(option.label)}</span>
      </button>
    `).join("");
    const statusButtons = STATUS_OPTIONS.map((status) => `
      <button class="chip ${this.state.selectedStatuses.has(status.id) ? "is-active" : ""}" style="--chip-color: ${status.color}" data-ripple data-action="toggle-status" data-id="${status.id}">
        <span class="chip__dot"></span><span>${escapeHtml(status.label)}</span>
      </button>
    `).join("");
    const brandButtons = [
      `<button class="chip ${this.state.selectedDepartments.size ? "" : "is-active"}" data-ripple data-action="clear-departments" data-id="all"><span>All brands</span></button>`,
      ...this.state.departments.map((department) => `
        <button class="chip ${this.state.selectedDepartments.has(department.id) ? "is-active" : ""}" style="--chip-color: ${escapeHtml(department.color || "var(--color-accent)")}" data-ripple data-action="toggle-department" data-id="${escapeHtml(department.id)}">
          <span class="chip__dot"></span><span>${escapeHtml(department.title)}</span><span class="chip__count">${formatNumber(department.count)}</span>
        </button>
      `)
    ].join("");
    const typeButtons = [
      `<button class="chip ${this.state.selectedCategories.size ? "" : "is-active"}" data-ripple data-action="clear-categories" data-id="all"><span>All types</span></button>`,
      ...this.state.categories.map((category) => `
        <button class="chip ${this.state.selectedCategories.has(category.id) ? "is-active" : ""}" data-ripple data-action="toggle-category" data-id="${escapeHtml(category.id)}">
          <span>${icon(category.icon, 16)}</span><span>${escapeHtml(category.title)}</span><span class="chip__count">${formatNumber(category.count)}</span>
        </button>
      `)
    ].join("");
    const savedFilters = this.state.savedFilters.length
      ? this.state.savedFilters.map((filter) => `
        <div class="saved-filter-row">
          <button class="sheet-action" data-ripple data-action="apply-saved-filter" data-id="${escapeHtml(filter.id)}">
            <span>${escapeHtml(filter.label)}</span>${icon("chevronDown", 18)}
          </button>
          <button class="icon-button sheet-mini-button" data-ripple data-action="remove-saved-filter" data-id="${escapeHtml(filter.id)}" aria-label="Remove saved filter">${icon("x", 17)}</button>
        </div>
      `).join("")
      : '<p class="muted-copy">Save a filter you use a lot and it’ll show up here.</p>';
    const recentSearches = this.state.recentSearches.length
      ? `<div class="filter-grid">${this.state.recentSearches.map((term) => `
        <button class="chip" data-ripple data-action="select-suggestion" data-type="search" data-value="${escapeHtml(term)}">${escapeHtml(term)}</button>
      `).join("")}</div>`
      : '<p class="muted-copy">No recent searches yet.</p>';

    this.sheet.open(`
      <div class="sheet-title">
        <div>
          <h3>Smart filters</h3>
          <p>${escapeHtml(this.getFilterSummary(this.getFilteredItems().length))}</p>
        </div>
        <button class="icon-button" data-ripple data-action="close-sheet" aria-label="Close">${icon("x", 20)}</button>
      </div>
      <div class="sheet-section">
        <h4>Sort by</h4>
        <div class="filter-grid">${sortButtons}</div>
      </div>
      <div class="sheet-section">
        <h4>Status</h4>
        <div class="filter-grid">${statusButtons}</div>
      </div>
      <div class="sheet-section">
        <h4>Brands</h4>
        <div class="filter-grid">${brandButtons}</div>
      </div>
      <div class="sheet-section">
        <h4>Types</h4>
        <div class="filter-grid">${typeButtons}</div>
      </div>
      <div class="sheet-section">
        <h4>Recent searches</h4>
        ${recentSearches}
      </div>
      <div class="sheet-section">
        <h4>Saved filters</h4>
        ${savedFilters}
      </div>
      <div class="sheet-section">
        <button class="sheet-action" data-ripple data-action="save-filter"><span>Save this filter</span>${icon("star", 20)}</button>
        <button class="sheet-action" data-ripple data-action="reset-filters"><span>Clear everything</span>${icon("x", 20)}</button>
        <button class="sheet-action" data-ripple data-action="toggle-theme"><span>Switch theme</span>${icon(this.state.theme === "dark" ? "sun" : "moon", 20)}</button>
      </div>
    `, { label: "Smart filters" });
  }

  toggleTheme() {
    const nextTheme = this.state.theme === "auto" ? "light" : this.state.theme === "light" ? "dark" : "auto";
    this.state.theme = this.repository.setTheme(nextTheme);
    this.applyTheme();
    this.renderDynamic();
    this.snackbar.show(nextTheme === "auto" ? "Theme is auto" : nextTheme === "dark" ? "Dark mode is on" : "Light mode is on", { tone: "success" });
  }

  applyTheme() {
    if (this.state.theme === "auto") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.dataset.theme = this.state.theme;
    }
  }

  toggleFavorite(id) {
    const result = this.repository.toggleFavorite(id);
    this.applySnapshot(result.snapshot);
    const item = this.findItem(id);
    this.renderDynamic();
    this.snackbar.show(item?.favorite ? "Added to favorites" : "Removed from favorites", { tone: "success" });
  }

  async openItemSheet(id) {
    const item = this.findItem(id);
    if (!item) return;
    const { renderItemDetailSheet } = await import("./itemDetailSheet.js");
    this.sheet.open(renderItemDetailSheet(item), { label: item.title });
  }

  async openSaleConfirm(id) {
    const item = this.findItem(id);
    if (!item) return;
    if (Number(item.metadata?.quantity || 0) <= 0) {
      this.snackbar.show("This one is already sold out", { tone: "error" });
      return;
    }
    const { renderSaleConfirmSheet } = await import("./itemDetailSheet.js");
    this.sheet.open(renderSaleConfirmSheet(item), { label: "Confirm sale" });
  }

  confirmSale(id) {
    const result = this.repository.sellOne(id);
    if (!result.ok) {
      this.applySnapshot(result.snapshot);
      this.renderDynamic();
      this.sheet.close();
      this.snackbar.show(result.reason === "sold-out" ? "No pieces left to sell" : "Couldn’t sell this item", { tone: "error" });
      return;
    }
    this.applySnapshot(result.snapshot);
    this.renderDynamic();
    this.sheet.close();
    Haptics.success();
    this.snackbar.show("Sold. Qty updated.", { tone: "success" });
  }

  async copyItemValue(id, key) {
    const item = this.findItem(id);
    if (!item) return;
    const value = key === "barcode" ? item.metadata?.barcode : item.metadata?.sku || item.id;
    await copyText(value);
    Haptics.success();
    this.snackbar.show(key === "barcode" ? "Barcode copied" : "Code copied", { tone: "success" });
  }

  async shareItem(id) {
    const item = this.findItem(id);
    if (!item) return;
    const text = `${item.title}\nCode: ${item.metadata?.sku || item.id}\nBarcode: ${item.metadata?.barcode || "-"}\nPrice: ${formatPrice(item.metadata?.priceIQD)}\nQty: ${formatNumber(item.metadata?.quantity || 0)}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: item.title, text });
        return;
      } catch {
        // Fall back to copy when sharing is cancelled or unavailable.
      }
    }
    await copyText(text);
    this.snackbar.show("Item info copied", { tone: "success" });
  }

  findItem(id) {
    return this.state.items.find((item) => item.id === id);
  }
}
