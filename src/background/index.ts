import { bootstrap, registerBackgroundListeners } from "./bootstrap";

export function startBackground(): void {
  registerBackgroundListeners();

  bootstrap("background-wakeup").catch((error) => {
    console.error("Failed to initialize extension background", error);
  });
}
