import { icon } from "../../components/icons.js";
import { escapeHtml } from "../../utils/dom.js";
import { formatNumber, formatPrice, getStatusMeta } from "../../utils/formatters.js";

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

export function renderItemDetailSheet(item) {
  const status = getStatusMeta(item.status);
  const isSoldOut = item.status === "out-of-stock";
  return `
    <div class="sheet-title">
      <div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.description)}</p>
      </div>
      <button class="icon-button" data-ripple data-action="close-sheet" aria-label="Close">${icon("x", 20)}</button>
    </div>

    <div class="detail-hero" style="--item-color: ${escapeHtml(item.color || "#21B8F3")}; --status-color: ${status.color}">
      <div class="detail-icon">${icon(item.icon, 28)}</div>
      <div>
        <span class="status-dot">${status.label}</span>
        <strong>${formatPrice(item.metadata?.priceIQD)}</strong>
        <small>${escapeHtml(item.metadata?.brand || "DNA")}</small>
      </div>
    </div>

    <div class="detail-grid">
      <div class="meta-pill"><span>Code</span><strong>${escapeHtml(item.metadata?.sku || item.id)}</strong></div>
      <div class="meta-pill"><span>Barcode</span><strong>${escapeHtml(item.metadata?.barcode || "-")}</strong></div>
      <div class="meta-pill"><span>Qty now</span><strong>${formatNumber(item.metadata?.quantity || 0)}</strong></div>
      <div class="meta-pill"><span>Sold</span><strong>${formatNumber(item.metadata?.soldCount || 0)}</strong></div>
      <div class="meta-pill"><span>Base qty</span><strong>${formatNumber(item.metadata?.baseQuantity || item.metadata?.quantity || 0)}</strong></div>
      <div class="meta-pill"><span>Priority</span><strong>${escapeHtml(item.priority || "normal")}</strong></div>
    </div>

    <div class="item-tags detail-tags">
      ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(prettyTag(tag))}</span>`).join("")}
    </div>

    <div class="sheet-section">
      <button class="sheet-action is-danger" data-ripple data-action="request-sale" data-id="${escapeHtml(item.id)}" ${isSoldOut ? "disabled" : ""}>
        <span>${isSoldOut ? "Sold out" : "Sold"}</span>${icon("check", 20)}
      </button>
      <button class="sheet-action" data-ripple data-action="favorite" data-id="${escapeHtml(item.id)}">
        <span>${item.favorite ? "Remove favorite" : "Add favorite"}</span>${icon("heart", 20)}
      </button>
      <button class="sheet-action" data-ripple data-action="copy-sku" data-id="${escapeHtml(item.id)}">
        <span>Copy code</span>${icon("copy", 20)}
      </button>
      <button class="sheet-action" data-ripple data-action="copy-barcode" data-id="${escapeHtml(item.id)}">
        <span>Copy barcode</span>${icon("barcode", 20)}
      </button>
      <button class="sheet-action" data-ripple data-action="share-item" data-id="${escapeHtml(item.id)}">
        <span>Share item</span>${icon("share", 20)}
      </button>
    </div>
  `;
}

function prettyTag(tag) {
  return tagLabels.get(tag) || tag;
}

export function renderSaleConfirmSheet(item) {
  return `
    <div class="sheet-title">
      <div>
        <h3>Confirm sale</h3>
        <p>This will remove 1 piece from stock.</p>
      </div>
      <button class="icon-button" data-ripple data-action="close-sheet" aria-label="Close">${icon("x", 20)}</button>
    </div>

    <div class="detail-hero" style="--item-color: ${escapeHtml(item.color || "#21B8F3")}">
      <div class="detail-icon">${icon(item.icon, 28)}</div>
      <div>
        <small>${escapeHtml(item.metadata?.brand || "DNA")}</small>
        <strong>${escapeHtml(item.title)}</strong>
        <small>Current qty: ${formatNumber(item.metadata?.quantity || 0)}</small>
      </div>
    </div>

    <div class="confirm-actions">
      <button class="ghost-button confirm-button" data-ripple data-action="close-sheet">Cancel</button>
      <button class="primary-button confirm-button is-danger" data-ripple data-action="confirm-sale" data-id="${escapeHtml(item.id)}">
        Confirm sale
      </button>
    </div>
  `;
}
