import { InventoryController } from "./features/inventory/inventoryController.js";
import { JsonDataProvider } from "./providers/jsonDataProvider.js";
import { ItemRepository } from "./repositories/itemRepository.js";
import { StorageService } from "./services/storageService.js";

const root = document.querySelector("#app");

const storage = new StorageService();
const provider = new JsonDataProvider();
const repository = new ItemRepository({ provider, storage });
const app = new InventoryController({ root, repository });

app.init();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch(() => {
      // The app stays fully usable without the offline worker.
    });
  });
}
