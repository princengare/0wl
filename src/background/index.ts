import { bootstrap, registerBackgroundListeners } from "./bootstrap";

registerBackgroundListeners();

bootstrap("background-wakeup").catch((error) => {
  console.error("Failed to initialize extension background", error);
});
