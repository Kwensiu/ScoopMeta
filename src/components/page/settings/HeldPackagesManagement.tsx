import { For, Show } from "solid-js";
import { CirclePause, LockOpen } from "lucide-solid";
import heldStore from "../../../stores/held";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface HeldPackagesManagementProps {
  onUnhold: (packageName: string) => void;
  operationInProgress: boolean;
}

export default function HeldPackagesManagement(props: HeldPackagesManagementProps) {
  const { store: heldPackagesStore } = heldStore;

  return (
    <Card
      title={t("settings.heldPackages.title")}
      icon={CirclePause}
      description={t("settings.heldPackages.description")}
    >
      <Show
        when={!heldPackagesStore.isLoading}
        fallback={<div class="flex justify-center p-4"><span class="loading loading-dots loading-md"></span></div>}
      >
        <Show
          when={heldPackagesStore.packages.length > 0}
          fallback={<p class="text-base-content/60 p-4 text-center">{t("settings.heldPackages.noPackagesHeld")}</p>}
        >
          <div class="max-h-60 overflow-y-auto pr-2">
            <ul class="space-y-2">
              <For each={heldPackagesStore.packages}>
                {(pkgName) => (
                  <li class="flex justify-between items-center bg-base-100 p-2 rounded-lg transition-colors hover:bg-base-300">
                    <span class="font-mono text-sm">{pkgName}</span>
                    <button
                      class="btn btn-xs btn-ghost text-info"
                      onClick={() => props.onUnhold(pkgName)}
                      aria-label={`Remove hold from ${pkgName} `}
                      disabled={props.operationInProgress}
                    >
                      <LockOpen class="w-4 h-4 mr-1" />
                      {t("settings.heldPackages.unhold")}
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </div>
        </Show>
      </Show>
    </Card>
  );
}
