import { For, Show, Accessor } from "solid-js";
import { Ellipsis, ArrowUpCircle, Trash2, Lock, RefreshCw, ArrowLeftRight, LockOpen } from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";
import { t } from "../../../i18n";

interface PackageGridViewProps {
  packages: Accessor<DisplayPackage[]>;
  onViewInfo: (pkg: ScoopPackage) => void;
  onViewInfoForVersions: (pkg: ScoopPackage) => void;
  onUpdate: (pkg: ScoopPackage) => void;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
  onSwitchVersion: (pkgName: string, version: string) => void;
  onUninstall: (pkg: ScoopPackage) => void;
  onChangeBucket: (pkg: ScoopPackage) => void;
  operatingOn: Accessor<string | null>;
  isPackageVersioned: (packageName: string) => boolean;
}

// 单个包卡片组件
const PackageCard = (props: {
  pkg: DisplayPackage;
  onViewInfo: (pkg: ScoopPackage) => void;
  onViewInfoForVersions: (pkg: ScoopPackage) => void;
  onUpdate: (pkg: ScoopPackage) => void;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
  onSwitchVersion: (pkgName: string, version: string) => void;
  onUninstall: (pkg: ScoopPackage) => void;
  onChangeBucket: (pkg: ScoopPackage) => void;
  operatingOn: string | null;
  isPackageVersioned: (packageName: string) => boolean;
}) => {
  const { pkg } = props;

  // 检测是否为 CI 版本（beta/alpha/rc 后有额外后缀）
  const isCiVersion = (version: string): boolean => {
    return /beta\.\d+\..+/.test(version) || /alpha\.\d+\..+/.test(version) || /rc\.\d+\..+/.test(version);
  };

  return (
    <div class="card bg-base-300 shadow-xl transition-all transform hover:scale-101 hover:bg-base-400 z-0 hover:z-20 focus-within:z-20 cursor-pointer" onClick={() => props.onViewInfo(pkg)} data-no-close-search>
      <div class="card-body">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1 min-w-0">
            <h2 class="card-title">
              <button class="hover:underline overflow-hidden" onClick={(e) => { e.stopPropagation(); props.onViewInfo(pkg); }}>
                <div class="truncate" style="max-width: 10rem;">
                  {pkg.name}
                </div>
              </button>
              <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                <div class="tooltip" data-tip={t("installed.list.update_available_tooltip", { version: pkg.available_version }) + (isCiVersion(pkg.available_version || '') ? t("installed.list.ci_version_note") : '')}>
                  <ArrowUpCircle class="w-4 h-4 text-primary cursor-pointer transition-transform hover:scale-125 mr-1" onClick={(e) => { e.stopPropagation(); props.onUpdate(pkg); }} />
                </div>
              </Show>
              <Show when={pkg.is_versioned_install}>
                <div class="tooltip" data-tip={t("installed.list.versioned_tooltip")}>
                  <Lock class="w-4 h-4 text-cyan-400" />
                </div>
              </Show>
              <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                <div class="tooltip" data-tip={t("installed.list.held_tooltip")}>
                  <Lock class="w-4 h-4 text-warning" />
                </div>
              </Show>
            </h2>
          </div>
          <div class="dropdown dropdown-end shrink-0">
            <label tabindex="0" class="btn btn-ghost btn-xs btn-circle bg-base-400" onClick={(e) => e.stopPropagation()}>
              <Ellipsis class="w-4 h-4" />
            </label>
            <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-400 rounded-box w-44 z-1">
              <li>
                <HoldToggleButton
                  pkgName={pkg.name}
                  isHeld={heldStore.isHeld(pkg.name)}
                  isVersioned={pkg.is_versioned_install ?? false}
                  operatingOn={props.operatingOn}
                  onHold={props.onHold}
                  onUnhold={props.onUnhold}
                />
              </li>
              <SwitchVersionButton
                pkgName={pkg.name}
                isPackageVersioned={props.isPackageVersioned}
                onViewInfoForVersions={props.onViewInfoForVersions}
                pkg={pkg}
              />
              <li>
                <a onClick={() => props.onChangeBucket(pkg)}>
                  <ArrowLeftRight class="w-4 h-4 mr-2" />
                  {t("installed.list.change_bucket")}
                </a>
              </li>
              <li>
                <a class="text-error" onClick={() => props.onUninstall(pkg)}>
                  <Trash2 class="w-4 h-4 mr-2" />
                  {t("installed.list.uninstall")}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <p class="text-sm text-base-content/70">
          {t("installed.grid.version")} {pkg.version}
        </p>
        <p class="text-xs text-base-content/70">
          {t("installed.grid.bucket")} {pkg.source}
        </p>
        <p class="text-xs text-base-content/50" title={pkg.updated}>{t("installed.grid.updated_on")} {formatIsoDate(pkg.updated)}</p>
      </div>
    </div>
  );
};

// Extract operation button component to avoid repeated creation
const HoldToggleButton = (props: {
  pkgName: string;
  isHeld: boolean;
  isVersioned: boolean;
  operatingOn: string | null;
  onHold: (pkgName: string) => void;
  onUnhold: (pkgName: string) => void;
}) => {
  return (
    <Show when={props.operatingOn === props.pkgName}
      fallback={
        <Show when={props.isVersioned}
          fallback={
            <Show when={props.isHeld}
              fallback={
                <a onClick={() => props.onHold(props.pkgName)}>
                  <Lock class="w-4 h-4 mr-2" />
                  <span>{t("installed.list.hold_package")}</span>
                </a>
              }
            >
              <a onClick={() => props.onUnhold(props.pkgName)}>
                <LockOpen class="w-4 h-4 mr-2" />
                <span>{t("installed.list.unhold_package")}</span>
              </a>
            </Show>
          }
        >
          <a class="btn-disabled cursor-not-allowed">
            <Lock class="w-4 h-4 mr-2 text-cyan-400" />
            <span>{t("installed.list.cannot_unhold")}</span>
          </a>
        </Show>
      }
    >
      <span class="flex items-center justify-center p-2">
        <span class="loading loading-spinner loading-xs"></span>
      </span>
    </Show>
  );
};

// Extract version switch button component
const SwitchVersionButton = (props: {
  pkgName: string;
  isPackageVersioned: (packageName: string) => boolean;
  onViewInfoForVersions: (pkg: ScoopPackage) => void;
  pkg: ScoopPackage;
}) => {
  return (
    <Show when={props.isPackageVersioned(props.pkgName)}>
      <li>
        <a onClick={() => props.onViewInfoForVersions(props.pkg)}>
          <RefreshCw class="w-4 h-4 mr-2" />
          {t("installed.list.switch_version")}
        </a>
      </li>
    </Show>
  );
};

function PackageGridView(props: PackageGridViewProps) {
  return (
    <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
      <For each={props.packages()}>
        {(pkg) => (
          <PackageCard
            pkg={pkg}
            onViewInfo={props.onViewInfo}
            onViewInfoForVersions={props.onViewInfoForVersions}
            onUpdate={props.onUpdate}
            onHold={props.onHold}
            onUnhold={props.onUnhold}
            onSwitchVersion={props.onSwitchVersion}
            onUninstall={props.onUninstall}
            onChangeBucket={props.onChangeBucket}
            operatingOn={props.operatingOn()}
            isPackageVersioned={props.isPackageVersioned}
          />
        )}
      </For>
    </div>
  );
}

export default PackageGridView;