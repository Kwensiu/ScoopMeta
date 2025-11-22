import { For, Show, createEffect, createSignal, createMemo, Switch, Match } from "solid-js";
import { ScoopPackage, ScoopInfo, VersionedPackageInfo } from "../types/scoop";
import hljs from 'highlight.js/lib/core';
import 'highlight.js/styles/github-dark.css';
import bash from 'highlight.js/lib/languages/bash';
import json from 'highlight.js/lib/languages/json';
import { Download, MoreHorizontal, FileText, Trash2, ExternalLink, RefreshCw, X } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import ManifestModal from "./ManifestModal";
import { openPath } from '@tauri-apps/plugin-opener';

hljs.registerLanguage('bash', bash);
hljs.registerLanguage('json', json);

interface PackageInfoModalProps {
  pkg: ScoopPackage | null;
  info: ScoopInfo | null;
  loading: boolean;
  error: string | null;
  onClose: () => void;
  onInstall?: (pkg: ScoopPackage) => void;
  onUninstall?: (pkg: ScoopPackage) => void;
  onSwitchVersion?: (pkg: ScoopPackage, version: string) => void;
  showBackButton?: boolean;
  autoShowVersions?: boolean; // Auto-expand version switcher
  isPackageVersioned?: (packageName: string) => boolean; // Function to check if package has multiple versions
  onPackageStateChanged?: () => void; // Callback for when package state changes
}

// Component to render detail values. If it's a JSON string of an object/array, it pretty-prints and highlights it.
function DetailValue(props: { value: string }) {
  const parsed = createMemo(() => {
    try {
      const p = JSON.parse(props.value);
      if (p && typeof p === 'object') {
        return p;
      }
    } catch (e) {
      // Not a JSON object string
    }
    return null;
  });

  let codeRef: HTMLElement | undefined;
  createEffect(() => {
    if (parsed() && codeRef) {
      hljs.highlightElement(codeRef);
    }
    
    // Cleanup function to prevent memory leaks
    return () => {
      if (codeRef) {
        codeRef.innerHTML = '';
      }
    };
  });

  return (
    <Show when={parsed()} fallback={<span class="break-words">{props.value}</span>}>
      <pre class="text-xs p-2 bg-base-100 rounded-lg whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
        <code ref={codeRef} class="language-json">
          {JSON.stringify(parsed(), null, 2)}
        </code>
      </pre>
    </Show>
  );
}

// Component to render long "Includes" lists in a compact, scrollable form
function IncludesValue(props: { value: string }) {
  const items = createMemo(() => props.value.split(/,\s*/).filter((s) => s.length > 0));
  return (
    <div class="max-h-60 overflow-y-auto">
      <ul class="list-disc list-inside text-xs space-y-0.5">
        <For each={items()}>{(item) => <li class="break-all">{item}</li>}</For>
      </ul>
    </div>
  );
}

function LicenseValue(props: { value: string }) {
  const license = createMemo(() => {
    try {
      const p = JSON.parse(props.value);
      if (p && typeof p === 'object' && p.identifier) {
        return {
          identifier: p.identifier as string,
          url: p.url as string | undefined,
        };
      }
    } catch (e) {
      // Not a JSON object string
    }
    return null;
  });

  return (
    <Show when={license()} fallback={<DetailValue value={props.value} />}>
      <Switch>
        <Match when={license()?.url}>
          <a
            href={license()?.url}
            target="_blank"
            rel="noopener noreferrer"
            class="link link-primary"
          >
            {license()?.identifier}
          </a>
        </Match>
        <Match when={!license()?.url}>
          <span class="break-words">{license()?.identifier}</span>
        </Match>
      </Switch>
    </Show>
  );
}

function PackageInfoModal(props: PackageInfoModalProps) {
  let codeRef: HTMLElement | undefined;
  const [isVisible, setIsVisible] = createSignal(false);
  const [isClosing, setIsClosing] = createSignal(false);
  const [rendered, setRendered] = createSignal(false);

  const orderedDetails = createMemo(() => {
    if (!props.info?.details) return [];

    const desiredOrder = [
      'Name',
      'Description',
      'Bucket',
      'Installed Version',
      'Latest Version',
      'Version',
      'Includes',
      'Installed',
      'Homepage',
      'License'
    ];

    const detailsMap = new Map(props.info.details);
    const result: [string, string][] = [];

    for (const key of desiredOrder) {
      if (detailsMap.has(key)) {
        result.push([key, detailsMap.get(key)!]);
      }
    }

    return result;
  });

  // State for manifest modal
  const [manifestContent, setManifestContent] = createSignal<string | null>(null);
  const [manifestLoading, setManifestLoading] = createSignal(false);
  const [manifestError, setManifestError] = createSignal<string | null>(null);

  // State for version switching
  const [versionInfo, setVersionInfo] = createSignal<VersionedPackageInfo | null>(null);
  const [versionLoading, setVersionLoading] = createSignal(false);
  const [versionError, setVersionError] = createSignal<string | null>(null);
  const [switchingVersion, setSwitchingVersion] = createSignal<string | null>(null);

  createEffect(() => {
    if (props.info?.notes && codeRef) {
      hljs.highlightElement(codeRef);
      
      // Clean up highlight on effect dispose
      return () => {
        if (codeRef) {
          codeRef.innerHTML = '';
        }
      };
    }
  });

  // Auto-fetch version info if autoShowVersions is true and package is versioned
  createEffect(() => {
    if (props.autoShowVersions && props.pkg?.is_installed && props.isPackageVersioned?.(props.pkg.name)) {
      fetchVersionInfo(props.pkg);
    }
  });

  // Clear version info when package changes or autoShowVersions becomes false
  createEffect(() => {
    if (!props.autoShowVersions || !props.pkg) {
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
    }
  });

  // Clear version info when switching to a different package
  createEffect((prevPackageName) => {
    const currentPackageName = props.pkg?.name;
    if (prevPackageName !== undefined && prevPackageName !== currentPackageName) {
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
    }
    return currentPackageName;
  });

  const fetchManifest = async (pkg: ScoopPackage) => {
    setManifestLoading(true);
    setManifestError(null);
    setManifestContent(null);

    try {
      const result = await invoke<string>("get_package_manifest", {
        packageName: pkg.name,
        bucket: pkg.source,
      });
      setManifestContent(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch manifest for ${pkg.name}:`, errorMsg);
      setManifestError(`Failed to load manifest for ${pkg.name}: ${errorMsg}`);
    } finally {
      setManifestLoading(false);
    }
  };

  const closeManifestModal = () => {
    setManifestContent(null);
    setManifestLoading(false);
    setManifestError(null);
  };

  const fetchVersionInfo = async (pkg: ScoopPackage) => {
    setVersionLoading(true);
    setVersionError(null);
    setVersionInfo(null);

    try {
      const result = await invoke<VersionedPackageInfo>("get_package_versions", {
        packageName: pkg.name,
        global: false, // TODO: Add support for global packages
      });
      setVersionInfo(result);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to fetch versions for ${pkg.name}:`, errorMsg);
      setVersionError(`Failed to load versions for ${pkg.name}: ${errorMsg}`);
    } finally {
      setVersionLoading(false);
    }
  };

  const switchVersion = async (pkg: ScoopPackage, targetVersion: string) => {
    setSwitchingVersion(targetVersion);
    try {
      await invoke<string>("switch_package_version", {
        packageName: pkg.name,
        targetVersion,
        global: false, // TODO: Add support for global packages
      });

      // Refresh version info after switching
      await fetchVersionInfo(pkg);

      // Notify parent that package state may have changed
      props.onPackageStateChanged?.();

      // Call the onSwitchVersion callback if provided
      props.onSwitchVersion?.(pkg, targetVersion);

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to switch ${pkg.name} to version ${targetVersion}:`, errorMsg);
      setVersionError(`Failed to switch to version ${targetVersion}: ${errorMsg}`);
    } finally {
      setSwitchingVersion(null);
    }
  };

  // Creat animation
  createEffect(() => {
    if (props.pkg) {
      setRendered(true);
      setTimeout(() => setIsVisible(true), 10);
    } else {
      setIsVisible(false);
    }
  });

  createEffect(() => {
    if (isClosing()) {
      const timer = setTimeout(() => {
        setRendered(false);
        setIsClosing(false);

        props.onClose();
      }, 300);
      return () => clearTimeout(timer);
    }
  });

  const handleClose = () => {
    setIsClosing(true);
    setIsVisible(false);
  };

  const handleBackdropClick = (e: MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <Show when={rendered()}>
      <div class="fixed inset-0 flex items-center justify-center z-50 p-20">
        <div 
          class="absolute inset-0 transition-all duration-300 ease-in-out"
          classList={{
            "opacity-0": !isVisible(),
            "opacity-100": isVisible() && !isClosing(),
          }}
          style="background-color: rgba(0, 0, 0, 0.3); backdrop-filter: blur(2px);"
          onClick={handleBackdropClick}
        ></div>
        <div 
          class="relative bg-base-200 rounded-lg shadow-xl border border-base-300 w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col transition-all duration-300 ease-in-out"
          classList={{
            "scale-95 opacity-0": !isVisible() || isClosing(),
            "scale-100 opacity-100": isVisible() && !isClosing(),
          }}
        >
          <div class="flex justify-between items-start p-4 border-b border-base-300">
            <h3 class="font-bold text-lg">Information for {props.pkg?.name}</h3>
            <div class="flex gap-2">
              <div class="dropdown dropdown-end">
                <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                  <MoreHorizontal class="w-5 h-5" />
                </label>
                <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-400 rounded-box w-52 z-[100]">
                  <li>
                    <a onClick={() => props.pkg && fetchManifest(props.pkg)}>
                      <FileText class="w-4 h-4 mr-2" />
                      View Manifest
                    </a>
                  </li>
                  <Show when={props.pkg?.is_installed}>
                    <li>
                      <button type="button" onClick={async () => {
                        if (props.pkg) {
                          try {
                            const packagePath = await invoke<string>("get_package_path", {
                              packageName: props.pkg.name
                            });
                            await openPath(packagePath);
                          } catch (error) {
                            console.error('Failed to open package path:', error);
                          }
                        }
                      }}>
                        <ExternalLink class="w-4 h-4 mr-2" />
                        Open in Explorer
                      </button>
                    </li>
                  </Show>
                  <Show when={props.pkg?.is_installed && props.isPackageVersioned?.(props.pkg.name)}>
                    <li>
                      <a onClick={() => props.pkg && fetchVersionInfo(props.pkg)}>
                        <RefreshCw class="w-4 h-4 mr-2" />
                        Switch Version
                      </a>
                    </li>
                  </Show>
                  <Show when={props.pkg?.is_installed}>
                    <li>
                      <a onClick={async () => {
                        if (props.pkg) {
                          try {
                            const debug = await invoke<string>("debug_package_structure", {
                              packageName: props.pkg.name,
                              global: false,
                            });
                            console.log("Package structure debug:", debug);
                            alert(debug);
                          } catch (error) {
                            console.error('Debug failed:', error);
                          }
                        }
                      }}>
                        <FileText class="w-4 h-4 mr-2" />
                        Debug Structure
                      </a>
                    </li>
                  </Show>
                </ul>
              </div>
              <button 
                class="btn btn-sm btn-circle btn-ghost"
                onClick={handleClose}
              >
                <X class="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div class="overflow-y-auto flex-grow p-4">
            <Show when={props.loading}>
              <div class="flex justify-center items-center h-40">
                <span class="loading loading-spinner loading-lg"></span>
              </div>
            </Show>
            <Show when={props.error}>
              <div role="alert" class="alert alert-error">
                <svg xmlns="http://www.w3.org/2000/svg" class="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <span>{props.error}</span>
              </div>
            </Show>
            <Show when={props.info}>
              <div class="flex flex-col md:flex-row gap-6">
                <div class="flex-1">
                  <h4 class="text-lg font-medium mb-3 pb-2 border-b">Details</h4>
                  <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                    <For each={orderedDetails()}>
                      {([key, value]) => (
                        <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                          <div class="font-semibold text-base-content/70 capitalize col-span-1">{key.replace(/([A-Z])/g, ' $1')}{key === 'Installed' || key === 'Includes'}:</div>
                          <div class="col-span-2">
                            <Switch fallback={<DetailValue value={value} />}>
                              <Match when={key === 'Homepage'}>
                                <a href={value} target="_blank" rel="noopener noreferrer" class="link link-primary break-all">{value}</a>
                              </Match>
                              <Match when={key === 'License'}>
                                <LicenseValue value={value} />
                              </Match>
                              <Match when={key === 'Includes'}>
                                <IncludesValue value={value} />
                              </Match>
                            </Switch>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
                <Show when={props.info?.notes}>
                  <div class="flex-1">
                    <h4 class="text-lg font-medium mb-3 border-b pb-2">Notes</h4>
                    <pre class="text-sm rounded-xl whitespace-pre-wrap font-sans">
                      <code ref={codeRef} class="language-bash">{props.info?.notes}</code>
                    </pre>
                  </div>
                </Show>
              </div>
            </Show>

            {/* Version Switcher Section */}
            <Show when={versionInfo() || versionLoading()}>
              <div class="divider">Version Manager</div>
              <Show when={versionLoading()} fallback={
                <div class="bg-base-300 rounded-lg p-4">
                  <h4 class="text-lg font-medium mb-3">Available Versions</h4>
                  <Show when={versionError()}>
                    <div role="alert" class="alert alert-error mb-3">
                      <span>{versionError()}</span>
                    </div>
                  </Show>
                  <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    <For each={versionInfo()?.available_versions || []}>
                      {(version) => (
                        <div 
                          class="card bg-base-100 shadow-sm p-3 transition-all hover:shadow-md"
                          classList={{
                            "ring-2 ring-primary": version.is_current,
                          }}
                        >
                          <div class="flex items-center justify-between">
                            <div>
                              <div class="font-semibold text-sm">{version.version}</div>
                              <Show when={version.is_current}>
                                <div class="text-xs text-primary font-medium">Current</div>
                              </Show>
                            </div>
                            <Show when={!version.is_current}>
                              <button
                                class="btn btn-xs btn-primary"
                                disabled={switchingVersion() === version.version}
                                onClick={() => props.pkg && switchVersion(props.pkg, version.version)}
                              >
                                <Show when={switchingVersion() === version.version}
                                  fallback="Switch"
                                >
                                  <span class="loading loading-spinner loading-xs"></span>
                                </Show>
                              </button>
                            </Show>
                          </div>
                        </div>
                      )}
                    </For>
                  </div>
                </div>
              }>
                <div class="bg-base-300 rounded-lg p-4 flex items-center justify-center">
                  <span class="loading loading-spinner"></span>
                </div>
              </Show>
            </Show>
          </div>
          <div class="modal-action p-4 border-t border-base-300">
            <form method="dialog">
              <Show when={!props.pkg?.is_installed && props.onInstall}>
                <button
                  type="button"
                  class="btn btn-primary mr-2"
                  onClick={() => {
                    if (props.pkg) {
                      props.onInstall!(props.pkg);
                      // Notify parent that package state may change
                      props.onPackageStateChanged?.();
                    }
                  }}
                >
                  <Download class="w-4 h-4 mr-2" />
                  Install
                </button>
              </Show>
              <Show when={props.pkg?.is_installed}>
                <button
                  type="button"
                  class="btn btn-error mr-2"
                  onClick={() => {
                    if (props.pkg) {
                      props.onUninstall?.(props.pkg);
                      // Notify parent that package state may change
                      props.onPackageStateChanged?.();
                    }
                  }}
                >
                  <Trash2 class="w-4 h-4 mr-2" />
                  Uninstall
                </button>
              </Show>
              <button class="btn" onClick={(e) => {
                e.preventDefault();
                handleClose();
              }}>
                {props.showBackButton ? "Back to Bucket" : "Close"}
              </button>
            </form>
          </div>
        </div>
        <ManifestModal
          packageName={props.pkg?.name ?? ""}
          manifestContent={manifestContent()}
          loading={manifestLoading()}
          error={manifestError()}
          onClose={closeManifestModal}
        />
      </div>
    </Show>
  );
}

export default PackageInfoModal;