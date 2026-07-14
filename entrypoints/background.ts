import { defineBackground } from "wxt/utils/define-background";
import { startBackground } from "@/background";

export default defineBackground({
  type: "module",
  main() {
    startBackground();
  }
});
