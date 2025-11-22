import { For, Show, Accessor } from "solid-js";
import { MoreHorizontal, ArrowUpCircle, Trash2, Lock, Unlock, RefreshCw, ArrowLeftRight} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";

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
  
  return (
    <div class="card bg-base-300 shadow-xl transition-all transform hover:scale-101 hover:bg-base-400 z-0 focus-within:z-20" data-no-close-search>
      <div class="card-body">
        <div class="flex justify-between items-start mb-2">
          <div class="flex-1 min-w-0">
            <h2 class="card-title">
              <button class="hover:underline overflow-hidden" onClick={() => props.onViewInfo(pkg)}>
                <div class="truncate" style="max-width: 10rem;">
                  {pkg.name}
                </div>
              </button>
              <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                  <div class="tooltip" data-tip={`Update available: ${pkg.available_version}`}>
                    <ArrowUpCircle class="w-4 h-4 text-primary cursor-pointer transition-transform hover:scale-125 mr-1" onClick={() => props.onUpdate(pkg)} />
                  </div>
              </Show>
              <Show when={pkg.is_versioned_install}>
                  <div class="tooltip" data-tip="Versioned install - cannot be updated">
                    <Lock class="w-4 h-4 text-cyan-400" />
                  </div>
              </Show>
              <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                   <div class="tooltip" data-tip="This package is on hold">
                     <Lock class="w-4 h-4 text-warning" />
                   </div>
                </Show>
            </h2>
          </div>
          <div class="dropdown dropdown-end flex-shrink-0">
              <label tabindex="0" class="btn btn-ghost btn-xs btn-circle bg-base-400">
                <MoreHorizontal class="w-4 h-4" />
              </label>
              <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-400 rounded-box w-52 z-[1]">
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
                    Change Bucket
                  </a>
                </li>
                <li>
                  <a class="text-error" onClick={() => props.onUninstall(pkg)}>
                    <Trash2 class="w-4 h-4 mr-2" />
                    Uninstall
                  </a>
                </li>
              </ul>
            </div>
        </div>
        <p class="text-sm text-base-content/70">
          Version {pkg.version}
        </p>
        <p class="text-xs text-base-content/70">
          Bucket {pkg.source}
        </p>
        <p class="text-xs text-base-content/50" title={pkg.updated}>Updated on {formatIsoDate(pkg.updated)}</p>
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
                  <span>Hold Package</span>
                </a>
              }
            >
              <a onClick={() => props.onUnhold(props.pkgName)}>
                <Unlock class="w-4 h-4 mr-2" />
                <span>Unhold Package</span>
              </a>
            </Show>
          }
        >
          <a class="btn-disabled cursor-not-allowed">
            <Lock class="w-4 h-4 mr-2 text-cyan-400" />
            <span>Cannot Unhold (Versioned)</span>
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
          Switch Version
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