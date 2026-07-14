import type { LifecycleStore } from "@/storage/LifecycleStore";
import { browser as extensionBrowser } from "@/shared/browser";
import type { ReconcileReason } from "@/shared/types";

interface RuntimeInstallDetails {
  reason?: string;
  previousVersion?: string;
  temporary?: boolean;
}

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
    const manifest = extensionBrowser.runtime.getManifest();

    await this.dependencies.lifecycleStore.recordInstallEvent(
      {
        extensionId: extensionBrowser.runtime.id ?? null,
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
