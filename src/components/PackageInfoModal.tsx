import { For, Show, createEffect, createSignal, createMemo, Switch, Match } from "solid-js";
import { ScoopPackage, ScoopInfo, VersionedPackageInfo } from "../types/scoop";
import { Portal } from "solid-js/web";
import hljs from 'highlight.js/lib/core';

import json from 'highlight.js/lib/languages/json';
import { Download, Ellipsis, FileText, Trash2, ExternalLink, RefreshCw, X } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import ManifestModal from "./ManifestModal";
import { openPath } from '@tauri-apps/plugin-opener';
import settingsStore from "../stores/settings";
import { t } from "../i18n";

hljs.registerLanguage('json', json);

interface PackageInfoModalProps {
  pkg?: ScoopPackage | null;
  info?: ScoopInfo | null;
  loading?: boolean;
  error?: string | null;
  autoShowVersions?: boolean;
  isPackageVersioned?: (packageName: string) => boolean;
  onClose: () => void;
  onInstall?: (pkg: ScoopPackage) => void;
  onUninstall?: (pkg: ScoopPackage) => void;
  onUpdate?: (pkg: ScoopPackage) => void;
  onForceUpdate?: (pkg: ScoopPackage) => void;
  onSwitchVersion?: (pkg: ScoopPackage, version: string) => void;
  onChangeBucket?: (pkg: ScoopPackage) => void;
  onPackageStateChanged?: () => void;
  setOperationTitle?: (title: string) => void;
  showBackButton?: boolean;
  context?: 'installed' | 'search'; // 新增 context 属性以区分页面来源
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
    <Show when={parsed()} fallback={<span class="wrap-break-word">{props.value}</span>}>
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
    <div class="max-h-18 overflow-y-auto">
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
          <span class="wrap-break-word">{license()?.identifier}</span>
        </Match>
      </Switch>
    </Show>
  );
}

function PackageInfoModal(props: PackageInfoModalProps) {
  let codeRef: HTMLElement | undefined;
  const { settings } = settingsStore;
  // Theme-specific colors
  const isDark = () => settings.theme === 'dark';
  const codeBgColor = () => isDark() ? '#282c34' : '#f0f4f9';

  const [isVisible, setIsVisible] = createSignal(false);
  const [isClosing, setIsClosing] = createSignal(false);
  const [rendered, setRendered] = createSignal(false);

  // 格式化日期显示
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      // 检查日期是否有效
      if (isNaN(date.getTime())) return dateString;
      
      // 使用更简洁的日期格式
      return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      return dateString;
    }
  };

  const orderedDetails = createMemo(() => {
    if (!props.info?.details) return [];

    const desiredOrder = [
      { key: 'Name', label: t('packageInfo.name') },
      { key: 'Description', label: t('packageInfo.description') },
      { key: 'Bucket', label: t('packageInfo.bucket') },
      { key: 'Installed Version', label: t('packageInfo.installedVersion') },
      { key: 'Latest Version', label: t('packageInfo.latestVersion') },
      { key: 'Version', label: t('packageInfo.version') },
      // 根据 context 决定是否添加日期信息
      ...(props.pkg && props.context === 'installed'
        ? [{ key: 'Install Date', label: t('packageInfo.installDate') }]
        : []),
      ...(props.pkg && props.context === 'search'
        ? [{ key: 'Update Date', label: t('packageInfo.updateDate') }]
        : []),
      { key: 'Includes', label: t('packageInfo.includes') },
      { key: 'Installed', label: t('packageInfo.installed') },
      { key: 'Homepage', label: t('packageInfo.homepage') },
      { key: 'License', label: t('packageInfo.license') }
    ];

    const detailsMap = new Map(props.info.details);
    const result: [string, string, string][] = []; // [label, value, originalKey]

    for (const { key, label } of desiredOrder) {
      if (detailsMap.has(key)) {
        result.push([label, detailsMap.get(key)!, key]);
      } else if (key === 'Install Date' && props.pkg) {
        // 添加安装日期信息并格式化
        result.push([label, formatDate(props.pkg.updated), 'Install Date']);
      } else if (key === 'Update Date' && props.pkg) {
        // 添加更新日期信息并格式化
        result.push([label, formatDate(props.pkg.updated), 'Update Date']);
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

  // State for uninstall confirmation
  const [uninstallConfirm, setUninstallConfirm] = createSignal(false);
  const [uninstallTimer, setUninstallTimer] = createSignal<number | null>(null);

  // State for update button
  const [updateConfirm, setUpdateConfirm] = createSignal(false);
  const [updateTimer, setUpdateTimer] = createSignal<number | null>(null);

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

  // Clear info when switching to a different package
  createEffect((prevPackageName) => {
    const currentPackageName = props.pkg?.name;
    if (prevPackageName !== undefined && prevPackageName !== currentPackageName) {
      setVersionInfo(null);
      setVersionError(null);
      setVersionLoading(false);
      setSwitchingVersion(null);
      // Reset uninstall confirmation state when switching packages
      setUninstallConfirm(false);
      if (uninstallTimer()) {
        window.clearTimeout(uninstallTimer()!);
        setUninstallTimer(null);
      }
      // Reset update confirmation state when switching packages
      setUpdateConfirm(false);
      if (updateTimer()) {
        window.clearTimeout(updateTimer()!);
        setUpdateTimer(null);
      }
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
      setManifestError(t('packageInfo.errorLoadingManifest', { name: pkg.name, error: errorMsg }));
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
      setVersionError(t('packageInfo.errorLoadingVersions', { name: pkg.name, error: errorMsg }));
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
      setVersionError(t('packageInfo.errorSwitchingVersion', { version: targetVersion, error: errorMsg }));
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
    <Portal>
      <Show when={rendered()}>
        <div class="fixed inset-0 flex items-center justify-center z-51 p-20">
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
              <h3 class="font-bold text-lg">{t('packageInfo.title', { name: props.pkg?.name })}</h3>
              <div class="flex gap-2">
                <div class="dropdown dropdown-end">
                  <label tabindex="0" class="btn btn-ghost btn-sm btn-circle">
                    <Ellipsis class="w-5 h-5" />
                  </label>
                  <ul tabindex="0" class="dropdown-content menu p-2 shadow bg-base-400 rounded-box w-52">
                    <li>
                      <a onClick={() => props.pkg && fetchManifest(props.pkg)}>
                        <FileText class="w-4 h-4 mr-2" />
                        {t('packageInfo.viewManifest')}
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
                              console.error(t('packageInfo.failedToOpenPath'), error);
                            }
                          }
                        }}>
                          <ExternalLink class="w-4 h-4 mr-2" />
                          {t('packageInfo.openInExplorer')}
                        </button>
                      </li>
                    </Show>
                    <Show when={props.pkg?.is_installed && props.isPackageVersioned?.(props.pkg.name)}>
                      <li>
                        <a onClick={() => props.pkg && fetchVersionInfo(props.pkg)}>
                          <RefreshCw class="w-4 h-4 mr-2" />
                          {t('packageInfo.switchVersion')}
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
                              console.error(t('packageInfo.debugFailed'), error);
                            }
                          }
                        }}>
                          <FileText class="w-4 h-4 mr-2" />
                          {t('packageInfo.debugStructure')}
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

            <div class="overflow-y-auto grow p-4">
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
                    <h4 class="text-lg font-medium mb-3 pb-2 border-b">{t('packageInfo.details')}</h4>
                    <div class="grid grid-cols-1 gap-x-4 gap-y-2 text-sm">
                      <For each={orderedDetails()}>
                        {([label, value, originalKey]) => (
                          <div class="grid grid-cols-3 gap-2 py-1 border-b border-base-content/10">
                            <div class="font-semibold text-base-content/70 capitalize col-span-1">{label}:</div>
                            <div class="col-span-2">
                              <Switch fallback={<DetailValue value={value} />}>
                                <Match when={originalKey === 'Homepage'}>
                                  <a href={value} target="_blank" rel="noopener noreferrer" class="link link-primary break-all">{value}</a>
                                </Match>
                                <Match when={originalKey === 'License'}>
                                  <LicenseValue value={value} />
                                </Match>
                                <Match when={originalKey === 'Includes'}>
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
                      <h4 class="text-lg font-medium mb-3 border-b pb-2">{t('packageInfo.notes')}</h4>
                      <div
                        class="rounded-xl overflow-hidden border border-base-content/10 shadow-inner"
                        style={{ "background-color": codeBgColor() }}
                      >
                        <pre class="p-4 m-0">
                          <code ref={codeRef} class="nohighlight font-mono text-sm leading-relaxed bg-transparent! whitespace-pre-wrap">{props.info?.notes}</code>
                        </pre>
                      </div>
                    </div>
                  </Show>
                </div>
              </Show>

              {/* Version Switcher Section */}
              <Show when={versionInfo() || versionLoading()}>
                <div class="divider">{t('packageInfo.versionManager')}</div>
                <Show when={versionLoading()} fallback={
                  <div class="bg-base-300 rounded-lg p-4">
                    <h4 class="text-lg font-medium mb-3">{t('packageInfo.availableVersions')}</h4>
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
                                  <div class="text-xs text-primary font-medium">{t('packageInfo.current')}</div>
                                </Show>
                              </div>
                              <Show when={!version.is_current}>
                                <button
                                  class="btn btn-xs btn-primary"
                                  disabled={switchingVersion() === version.version}
                                  onClick={() => props.pkg && switchVersion(props.pkg, version.version)}
                                >
                                  <Show when={switchingVersion() === version.version}
                                    fallback={t('packageInfo.switch')}
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
            <div class="modal-action mt-0 p-4 border-t border-base-300 flex flex-wrap justify-between">
              <div class="flex space-x-2 mb-2 sm:mb-0">
                {/* Update (Force Update) Bottom in PackageInfoModal */}
                <Show when={props.pkg?.is_installed}>
                  <button
                    type="button"
                    class="btn w-24"
                    classList={{
                      "btn-primary": !!props.pkg?.available_version && !updateConfirm(),
                      "btn-soft text-base-content/50": !props.pkg?.available_version && !updateConfirm(),
                      "btn-warning": updateConfirm()
                    }}
                    onClick={() => {
                      if (updateConfirm()) {
                        // Execute force update
                        if (updateTimer()) {
                          window.clearTimeout(updateTimer()!);
                          setUpdateTimer(null);
                        }
                        setUpdateConfirm(false);
                        if (props.pkg) {
                          // Implement force update functionality and show in OperationModal
                          // Use the dedicated handleForceUpdate function if available
                          if (props.onForceUpdate) {
                            props.onForceUpdate(props.pkg);
                          } else if (props.setOperationTitle) {
                            // Fallback to direct invocation with proper UI feedback
                            props.setOperationTitle(`Force Updating ${props.pkg.name}`);
                            invoke("update_package", {
                              packageName: props.pkg.name,
                              force: true
                            }).catch(err => {
                              console.error("Force update invocation failed:", err);
                            });
                          } else {
                            console.warn("Neither onForceUpdate nor setOperationTitle is provided for force update operation");
                          }
                          props.onPackageStateChanged?.();
                        }
                      } else {
                        if (props.pkg?.available_version) {
                          // Normal update - use package operations hook for consistency
                          if (props.pkg && props.onUpdate) {
                            props.onUpdate(props.pkg);
                            // Notify parent that package state may change
                            props.onPackageStateChanged?.();
                          } else if (props.pkg) {
                            // Fallback to direct invocation if onUpdate is not provided
                            // We should not directly call setOperationTitle, but use the hook function
                            // This ensures the operationTitle signal is properly updated
                            if (props.setOperationTitle) {
                              props.setOperationTitle(`Updating ${props.pkg.name}`);
                            }
                            invoke("update_package", {
                              packageName: props.pkg.name
                            }).catch(err => {
                              console.error("Update invocation failed:", err);
                            });
                            props.onPackageStateChanged?.();
                          }
                        } else {
                          // No update available, show force update confirmation
                          setUpdateConfirm(true);
                          const timer = window.setTimeout(() => {
                            setUpdateConfirm(false);
                            setUpdateTimer(null);
                          }, 3000);
                          setUpdateTimer(timer);
                        }
                      }
                    }}
                  >

                    {updateConfirm() ? t('packageInfo.forceUpdate') : t('packageInfo.update')}
                  </button>
                </Show>
                {/* Change Bucket Bottom in PackageInfoModal */}
                <Show when={props.pkg?.is_installed && props.onChangeBucket}>
                  <button
                    type="button"
                    class="btn btn-outline btn-primary"
                    onClick={() => {
                      if (props.pkg) {
                        props.onChangeBucket!(props.pkg);
                      }
                    }}
                  >
                    {t('packageInfo.changeBucket')}
                  </button>
                </Show>
              </div>
              <div class="flex">
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
                      {t('buttons.install')}
                    </button>
                  </Show>
                  <Show when={props.pkg?.is_installed}>
                    <button
                      type="button"
                      class="btn btn-error mr-2 w-32"
                      classList={{ "btn-warning": uninstallConfirm() }}
                      onClick={() => {
                        if (uninstallConfirm()) {
                          // Execute uninstall
                          if (uninstallTimer()) {
                            window.clearTimeout(uninstallTimer()!);
                            setUninstallTimer(null);
                          }
                          setUninstallConfirm(false);
                          if (props.pkg) {
                            props.onUninstall?.(props.pkg);
                            // Notify parent that package state may change
                            props.onPackageStateChanged?.();
                          }
                        } else {
                          // First click - show confirmation
                          setUninstallConfirm(true);
                          const timer = window.setTimeout(() => {
                            setUninstallConfirm(false);
                            setUninstallTimer(null);
                          }, 3000);
                          setUninstallTimer(timer);
                        }
                      }}
                    >
                      <Trash2 class="w-4 h-4 mr-2" />
                      {uninstallConfirm() ? t('packageInfo.sure') : t('buttons.uninstall')}
                    </button>
                  </Show>
                  <button class="btn" onClick={(e) => {
                    e.preventDefault();
                    handleClose();
                  }}>
                    {props.showBackButton ? t('packageInfo.backToBucket') : t('packageInfo.close')}
                  </button>
                </form>
              </div>
            </div>
          </div>
          <div class="modal-backdrop" onClick={props.onClose}></div>
        </div>
        <ManifestModal
          packageName={props.pkg?.name ?? ""}
          manifestContent={manifestContent()}
          loading={manifestLoading()}
          error={manifestError()}
          onClose={closeManifestModal}
        />
      </Show>
    </Portal>
  );
}

export default PackageInfoModal;