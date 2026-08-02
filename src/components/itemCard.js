import { icon } from "./icons.js";
import { escapeHtml } from "../utils/dom.js";
import { formatNumber, formatPrice, getStatusMeta } from "../utils/formatters.js";
import { highlightText } from "../utils/search.js";

const tagLabels = new Map([
  ["موبايلات", "Phones"],
  ["تابلت", "Tablets"],
  ["سماعات", "Audio"],
  ["ساعات", "Watches"],
  ["لابتوبات", "Laptops"],
  ["شاشات", "Monitors"],
  ["كمبيوترات", "Desktops"],
  ["ملحقات", "Accessories"],
  ["in-stock", "In stock"],
  ["low-stock", "Low stock"],
  ["limited", "Low stock"]
]);

export function renderItemCard(item, { query = "", expanded = false, index = 0 } = {}) {
  const status = getStatusMeta(item.status);
  const tags = [item.metadata?.brand, ...item.tags].filter(Boolean).slice(0, 4);
  const title = highlightText(item.title, query);
  const description = highlightText(item.description, query);
  const barcode = escapeHtml(item.metadata?.barcode || "");
  const sku = escapeHtml(item.metadata?.sku || item.id);
  const transitionName = `item-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const soldCount = Number(item.metadata?.soldCount || 0);
  const isSoldOut = item.status === "out-of-stock";
  return `
    <article
      class="item-card ${expanded ? "is-expanded" : ""}"
      style="--item-color: ${escapeHtml(item.color || "#21B8F3")}; --status-color: ${status.color}; animation-delay: ${Math.min(index, 16) * 24}ms; view-transition-name: ${transitionName}"
      data-id="${escapeHtml(item.id)}"
      data-ripple
      tabindex="0"
      aria-label="${escapeHtml(item.title)}"
    >
      <div class="item-main">
        <div class="item-icon">${icon(item.icon, 23)}</div>
        <div class="item-content">
          <h3 class="item-title">${title}</h3>
          <p class="item-description">${description}</p>
          <div class="item-tags">
            ${tags.map((tag) => `<span class="tag">${escapeHtml(prettyTag(tag))}</span>`).join("")}
          </div>
        </div>
        <div class="item-side">
          <div class="price">${formatPrice(item.metadata?.priceIQD)}</div>
          <div class="status-dot">${status.label}</div>
        </div>
      </div>

      <div class="item-meta">
        <div class="meta-pill">
          <span>Qty</span>
          <strong>${formatNumber(item.metadata?.quantity || 0)}</strong>
        </div>
        <div class="meta-pill">
          <span>Code</span>
          <strong>${sku}</strong>
        </div>
        <div class="meta-pill">
          <span>Sold</span>
          <strong>${formatNumber(soldCount)}</strong>
        </div>
      </div>

      <div class="card-actions is-visible" aria-label="Quick actions">
        <button class="card-action ${isSoldOut ? "is-muted" : ""}" data-ripple data-action="request-sale" data-id="${escapeHtml(item.id)}" aria-label="Mark as sold" ${isSoldOut ? "disabled" : ""}>
          ${icon("check", 18)}
          <span>Sold</span>
        </button>
        <button class="card-action favorite-button ${item.favorite ? "is-active" : "is-muted"}" data-ripple data-action="favorite" data-id="${escapeHtml(item.id)}" aria-label="Favorite item">
          ${icon("heart", 18)}
          <span>Fav</span>
        </button>
        <button class="card-action is-muted" data-ripple data-action="copy-sku" data-id="${escapeHtml(item.id)}" aria-label="Copy code">
          ${icon("copy", 18)}
          <span>Copy</span>
        </button>
        <button class="card-action is-muted" data-ripple data-action="share-item" data-id="${escapeHtml(item.id)}" aria-label="Share item">
          ${icon("share", 18)}
          <span>Share</span>
        </button>
      </div>
      <span class="sr-only">Barcode ${barcode}</span>
    </article>
  `;
}

function prettyTag(tag) {
  return tagLabels.get(tag) || tag;
}
