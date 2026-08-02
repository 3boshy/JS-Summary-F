import { icon } from "../components/icons.js";

export class SnackbarService {
  constructor(region) {
    this.region = region;
  }

  show(message, { tone = "default", timeout = 2600 } = {}) {
    if (!this.region) return;
    const node = document.createElement("div");
    node.className = `snackbar snackbar--${tone}`;
    node.innerHTML = `${icon(tone === "success" ? "check" : tone === "error" ? "alert" : "sparkles", 18)}<span>${message}</span>`;
    this.region.append(node);
    window.setTimeout(() => {
      node.style.opacity = "0";
      node.style.transform = "translate3d(0, 10px, 0)";
      window.setTimeout(() => node.remove(), 180);
    }, timeout);
  }
}
