import { For, Show, Accessor, } from "solid-js";
import { 
  MoreHorizontal, ArrowUpCircle, Trash2, ArrowUp, ArrowDown, Lock, Unlock, RefreshCw
} from 'lucide-solid';
import type { DisplayPackage } from "../../../stores/installedPackagesStore";
import type { ScoopPackage } from "../../../types/scoop";
import heldStore from "../../../stores/held";
import { formatIsoDate } from "../../../utils/date";

type SortKey = 'name' | 'version' | 'source' | 'updated';

interface PackageListViewProps {
  packages: Accessor<DisplayPackage[]>;
  onSort: (key: SortKey) => void;
  sortKey: Accessor<SortKey>;
  sortDirection: Accessor<'asc' | 'desc'>;
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

const SortableHeader = (props: { 
  key: SortKey, 
  title: string, 
  onSort: (key: SortKey) => void,
  sortKey: Accessor<SortKey>,
  sortDirection: Accessor<'asc' | 'desc'>
}) => (
  <th class="cursor-pointer select-none" onClick={() => props.onSort(props.key)}>
    <div class="flex items-center gap-2">
      {props.title}
      <Show when={props.sortKey() === props.key}>
        <Show when={props.sortDirection() === 'asc'} fallback={<ArrowDown class="w-4 h-4" />}>
          <ArrowUp class="w-4 h-4" />
        </Show>
      </Show>
    </div>
  </th>
);

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

function PackageListView(props: PackageListViewProps) {
  return (
    <div class="overflow-x-auto bg-base-200 rounded-xl shadow-xl">
      <table class="table">
        <thead>
          <tr>
            <SortableHeader key="name" title="Name" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="version" title="Version" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="source" title="Bucket" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <SortableHeader key="updated" title="Updated" onSort={props.onSort} sortKey={props.sortKey} sortDirection={props.sortDirection} />
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          <For each={props.packages()}>
            {(pkg, index) => (
              <tr data-no-close-search>
                <td>
                  <div class="flex items-center gap-2">
                    <button class="btn btn-ghost btn-sm" onClick={() => props.onViewInfo(pkg)}>
                      {pkg.name}
                    </button>
                    <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                      <div class="tooltip" data-tip={`Update available: ${pkg.available_version}`}>
                        <ArrowUpCircle class="w-4 h-4 text-primary cursor-pointer transition-transform hover:scale-125" onClick={() => props.onUpdate(pkg)} />
                      </div>
                    </Show>
                    <Show when={pkg.is_versioned_install}>
                      <div class="tooltip" data-tip="Versioned install - cannot be updated">
                        <Lock class="w-4 h-4 text-cyan-400" />
                      </div>
                    </Show>
                    <Show when={heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                       <div class="tooltip" data-tip="This package is on hold.">
                         <Lock class="w-4 h-4 text-warning" />
                       </div>
                    </Show>
                  </div>
                </td>
                <td>{pkg.version}</td>
                <td>{pkg.source}</td>
                <td title={pkg.updated}>{formatIsoDate(pkg.updated)}</td>
                <td class="text-center">
                  <div
                    class="dropdown dropdown-end"
                    classList={{
                      'dropdown-top': index() * 2 >= props.packages().length - 1,
                    }}
                  >
                    <label tabindex="0" class="btn btn-ghost btn-xs btn-circle">
                      <MoreHorizontal class="w-4 h-4" />
                    </label>
                    <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-300 rounded-box w-52 z-[1]">
                      <Show when={pkg.available_version && !heldStore.isHeld(pkg.name) && !pkg.is_versioned_install}>
                        <li>
                          <a onClick={() => props.onUpdate(pkg)}>
                            <ArrowUpCircle class="w-4 h-4 mr-2" />
                            Update to {pkg.available_version}
                          </a>
                        </li>
                      </Show>
                      <li>
                        <HoldToggleButton 
                          pkgName={pkg.name}
                          isHeld={heldStore.isHeld(pkg.name)}
                          isVersioned={!!pkg.is_versioned_install}
                          operatingOn={props.operatingOn()}
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
                          <RefreshCw class="w-4 h-4 mr-2" />
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
                </td>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}

export default PackageListView;