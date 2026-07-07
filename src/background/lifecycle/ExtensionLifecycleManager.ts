import type { LifecycleStore } from "@/storage/LifecycleStore";
import type { ReconcileReason } from "@/shared/types";

type RuntimeInstallDetails = browser.runtime._OnInstalledDetails;

interface ExtensionLifecycleManagerDependencies {
  lifecycleStore: LifecycleStore;
  bootstrap: (reason: ReconcileReason) => Promise<void>;
  now?: () => number;
}

function normalizeInstallReason(
  reason: RuntimeInstallDetails["reason"] | string | undefined
): "install" | "update" | "browser_update" | "unknown" {
  if (reason === "install" || reason === "update" || reason === "browser_update") {
    return reason;
  }

  return "unknown";
}

export class ExtensionLifecycleManager {
  private readonly now: () => number;

  constructor(private readonly dependencies: ExtensionLifecycleManagerDependencies) {
    this.now = dependencies.now ?? Date.now;
  }

  async handleInstalled(details: RuntimeInstallDetails): Promise<void> {
    const manifest = browser.runtime.getManifest();

    await this.dependencies.lifecycleStore.recordInstallEvent(
      {
        extensionId: browser.runtime.id ?? null,
        installedVersion: manifest.version,
        previousVersion: details.previousVersion ?? null,
        lastInstallReason: normalizeInstallReason(details.reason),
        temporary: typeof details.temporary === "boolean" ? details.temporary : null
      },
      this.now()
    );

    await this.dependencies.bootstrap("installed");
  }
}
