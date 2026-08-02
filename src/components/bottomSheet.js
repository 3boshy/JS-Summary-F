export class BottomSheet {
  constructor({ sheet, backdrop }) {
    this.sheet = sheet;
    this.backdrop = backdrop;
    this.body = sheet?.querySelector("[data-sheet-body]");
    this.onClose = null;
    this.backdrop?.addEventListener("click", () => this.close());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") this.close();
    });
  }

  open(html, { label = "Options", onClose = null } = {}) {
    if (!this.sheet || !this.body) return;
    this.onClose = onClose;
    this.sheet.setAttribute("aria-label", label);
    this.body.innerHTML = html;
    this.backdrop?.classList.add("is-open");
    this.sheet.classList.add("is-open");
    document.body.style.overflow = "hidden";
  }

  close() {
    if (!this.sheet) return;
    this.backdrop?.classList.remove("is-open");
    this.sheet.classList.remove("is-open");
    document.body.style.overflow = "";
    if (typeof this.onClose === "function") this.onClose();
    this.onClose = null;
  }
}
