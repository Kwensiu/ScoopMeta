import { Download, RefreshCw, Github, BookOpen, AlertCircle, CircleCheckBig, Check } from "lucide-solid";
import { createSignal, Show, For, createMemo } from "solid-js";
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';
import { openUrl } from '@tauri-apps/plugin-opener';
import pkgJson from "../../../../package.json";
import { t } from "../../../i18n";
import settingsStore from "../../../stores/settings";
import { invoke } from "@tauri-apps/api/core";

// Custom update type for our hybrid update system
interface CustomUpdateInfo {
  version: string;
  pub_date: string;
  download_url: string;
  signature: string;
  notes: string;
  body?: string;
  channel: string;
}

export interface AboutSectionRef {
  checkForUpdates: (manual: boolean) => Promise<void>;
}

export interface AboutSectionProps {
  ref: (ref: AboutSectionRef) => void;
  isScoopInstalled?: boolean;
}


export default function AboutSection(props: AboutSectionProps) {
  const { settings, setUpdateSettings } = settingsStore;
  const [updateStatus, setUpdateStatus] = createSignal<'idle' | 'checking' | 'available' | 'downloading' | 'installing' | 'error'>('idle');
  const [updateInfo, setUpdateInfo] = createSignal<Update | null>(null);
  const [customUpdateInfo, setCustomUpdateInfo] = createSignal<CustomUpdateInfo | null>(null);
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [downloadProgress, setDownloadProgress] = createSignal<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });
  const [isUsingCustomUpdate, setIsUsingCustomUpdate] = createSignal(false);

  const handleChannelChange = async (channel: 'stable' | 'test') => {
    await setUpdateSettings({ channel });

    // Call backend to reload update configuration
    try {
      await invoke("reload_update_config");
      console.log(`Update channel changed to ${channel} and configuration reloaded`);
    } catch (error) {
      console.error("Failed to reload update configuration:", error);
      // Notify user about configuration reload failure
      await message(t("settings.about.config_reload_failed"), {
        title: t("settings.about.config_error"),
        kind: "error"
      });
      return;
    }

    // Show a message that restart is required for changes to take effect
    await message(
      channel === 'test'
        ? (t("update_channel.test_restart_required"))
        : (t("update_channel.stable_restart_required")),
      {
        title: channel === 'test'
          ? (t("settings.update_channel.test_channel"))
          : (t("settings.update_channel.stable_channel")),
        kind: "info"
      }
    );
  };

  // Helper function to sanitize error messages
  const sanitizeErrorMessage = (error: unknown): string => {
    if (error instanceof Error) {
      // Specific error handling with translated messages
      if (error.message.includes('network')) {
        return t("settings.about.network_error");
      } else if (error.message.includes('timeout')) {
        return t("settings.about.timeout_error");
      } else if (error.message.includes('certificate') || error.message.includes('TLS') || error.message.includes('SSL')) {
        return t("settings.about.certificate_error");
      } else if (error.message.includes('Could not fetch a valid release JSON')) {
        return t("settings.about.invalid_json_error");
      } else if (error.message.includes('download')) {
        return t("settings.about.download_failed");
      } else if (error.message.includes('permission') || error.message.includes('access')) {
        return t("settings.about.permission_error");
      } else if (error.message.includes('disk') || error.message.includes('space')) {
        return t("settings.about.insufficient_space");
      } else if (error.message.includes('integrity') || error.message.includes('verification')) {
        return t("settings.about.integrity_check_failed");
      }

      // Return the actual error message, but limit its length for security
      return error.message.substring(0, 200);
    }

    const errorString = String(error);
    return errorString.substring(0, 200);
  };

  const channels = createMemo(() => [
    {
      value: 'stable' as const,
      label: t("update_channel.stable"),
      description: t("update_channel.stable_description"),
      icon: <CircleCheckBig class="h-4 w-4" />,
      isSelected: () => settings.update.channel === 'stable',
    },
    {
      value: 'test' as const,
      label: t("update_channel.test"),
      description: t("update_channel.test_description"),
      icon: <AlertCircle class="h-4 w-4" />,
      isSelected: () => settings.update.channel === 'test',
    }
  ]);

  const checkForUpdates = async (manual: boolean) => {
    try {
      // Don't check for updates if installed via Scoop
      if (props.isScoopInstalled) {
        if (manual) {
          await message(t("settings.about.update_via_scoop"), {
            title: t("settings.about.updates_via_scoop"),
            kind: "info"
          });
        }
        return;
      }

      setUpdateStatus('checking');
      setUpdateError(null);
      setIsUsingCustomUpdate(false);

      // Get the current update channel information
      let channelInfo;
      try {
        channelInfo = await invoke("get_update_info_for_channel");
        console.log(`Update channel info: ${JSON.stringify(channelInfo)}`);
      } catch (configError) {
        console.warn("Could not get update channel info:", configError);
      }

      console.log(`Starting hybrid update check process for ${settings.update.channel} channel...`);
      
      // First, try to check for updates using the standard Tauri updater
      // Note: Tauri updater doesn't support dynamic endpoint configuration
      // The endpoint is determined by the configuration in tauri.conf.json or tauri.conf.test.json
      let update: Update | null = null;
      try {
        update = await check();
        console.log('Tauri update check completed', { 
          updateAvailable: !!update?.available,
          version: update?.version,
          channel: settings.update.channel,
          channelInfo: channelInfo
        });
      } catch (tauriError) {
        console.warn('Tauri update check failed:', tauriError);
      }

      // If Tauri updater found an update, check if it matches the expected channel
      if (update?.available) {
        // Get current app version to determine if installed app is stable or test
        const currentVersion = await invoke<string>("get_current_version");
        const isCurrentVersionTest = currentVersion.includes("-test") || currentVersion.includes("beta");
        
        // For stable channel, always use Tauri updater if it found an update
        // For test channel, we need to verify if the update matches our channel
        const shouldUseTauriUpdate = 
          settings.update.channel === 'stable' || 
          (settings.update.channel === 'test' && !isCurrentVersionTest);
        
        if (shouldUseTauriUpdate) {
          setUpdateStatus('available');
          setUpdateInfo(update);
          setIsUsingCustomUpdate(false);
          console.log('Update found via Tauri updater', {
            version: update.version,
            body: update.body,
            channel: settings.update.channel
          });

          // Only show dialog if user manually clicked "Check for updates"
          if (manual) {
            const versionText = update.version;
            const bodyText = update.body || t("settings.about.no_release_notes");

            const messageContent = t("settings.about.update_available_dialog", {
              version: versionText,
              body: bodyText
            });

            const shouldInstall = await ask(
              messageContent,
              {
                title: t("settings.about.update_available"),
                kind: "info",
                okLabel: t("buttons.install"),
                cancelLabel: t("buttons.cancel")
              }
            );

            if (shouldInstall) {
              await installAvailableUpdate();
            }
          }
          return;
        } else {
          console.log(`Tauri updater found version ${update.version} but it doesn't match channel ${settings.update.channel}, trying custom update check...`);
        }
      }

      // If Tauri updater didn't find an update or failed, try custom update check
      console.log('No update found via Tauri updater, trying custom update check...');
      try {
        const customUpdate = await invoke<CustomUpdateInfo>("check_for_custom_update");
        console.log('Custom update check completed', customUpdate);

        // Check if the custom update is actually newer than current version
        const currentVersion = await invoke<string>("get_current_version");
        
        // Special handling for channel switching
        const isCurrentVersionTest = currentVersion.includes("-test") || currentVersion.includes("beta");
        const isUpdateVersionTest = customUpdate.version.includes("-test") || customUpdate.version.includes("beta");
        
        // Determine if this update is appropriate for the current channel
        let shouldOfferUpdate = false;
        
        if (settings.update.channel === 'stable') {
          // For stable channel, only offer stable updates
          shouldOfferUpdate = !isUpdateVersionTest && isVersionNewer(customUpdate.version, currentVersion);
        } else if (settings.update.channel === 'test') {
          // For test channel, prefer test updates, but stable updates are also acceptable
          shouldOfferUpdate = isVersionNewer(customUpdate.version, currentVersion);
        }
        
        if (shouldOfferUpdate) {
          setUpdateStatus('available');
          setCustomUpdateInfo(customUpdate);
          setIsUsingCustomUpdate(true);
          console.log('New version found via custom update check', {
            version: customUpdate.version,
            currentVersion,
            channel: customUpdate.channel,
            isCurrentVersionTest,
            isUpdateVersionTest
          });

          // Only show dialog if user manually clicked "Check for updates"
          if (manual) {
            const versionText = customUpdate.version;
            const bodyText = customUpdate.body || t("settings.about.no_release_notes");
            const channelText = customUpdate.channel === 'test' ? t("update_channel.test") : t("update_channel.stable");

            const messageContent = t("settings.about.update_available_dialog", {
              version: `${versionText} (${channelText})`,
              body: bodyText
            });

            const shouldInstall = await ask(
              messageContent,
              {
                title: t("settings.about.update_available"),
                kind: "info",
                okLabel: t("buttons.install"),
                cancelLabel: t("buttons.cancel")
              }
            );

            if (shouldInstall) {
              await installAvailableUpdate();
            }
          }
        } else {
          setUpdateStatus('idle');
          if (manual) {
            await message(t("settings.about.latest_version", { version: currentVersion }), {
              title: t("settings.about.no_updates_available"),
              kind: "info"
            });
          }
          console.log('No suitable update found via custom update check', {
            version: customUpdate.version,
            channel: customUpdate.channel,
            isCurrentVersionTest,
            isUpdateVersionTest,
            shouldOfferUpdate
          });
        }
      } catch (customError) {
        console.error('Custom update check failed:', customError);
        
        // If both Tauri and custom update checks failed, show the last version info from Tauri if available
        setUpdateStatus('idle');
        if (manual) {
          const messageText = update?.version
            ? t("settings.about.latest_version", { version: update.version })
            : t("settings.about.latest_version_unknown");
          await message(messageText, {
            title: t("settings.about.no_updates_available"),
            kind: "info"
          });
        }
        console.log('No updates available from either method');
      }
    } catch (error) {
      console.error('Failed to check for updates:', error);
      setUpdateStatus('error');

      const errorMessage = sanitizeErrorMessage(error);
      setUpdateError(errorMessage);
      console.error('Update check error details:', errorMessage);

      // Show error to user if manually checking
      if (manual) {
        await message(errorMessage, {
          title: t("settings.about.update_failed"),
          kind: "error"
        });
      }
    }
  };

  // Helper function to compare versions
  const isVersionNewer = (newVersion: string, currentVersion: string): boolean => {
    try {
      const parseVersion = (version: string): number[] => {
        return version.split('.').map(part => {
          // Handle pre-release versions like "1.5.0-beta"
          const numericPart = part.split('-')[0];
          return parseInt(numericPart, 10) || 0;
        });
      };

      const newParts = parseVersion(newVersion);
      const currentParts = parseVersion(currentVersion);

      const maxLength = Math.max(newParts.length, currentParts.length);
      for (let i = 0; i < maxLength; i++) {
        const newPart = newParts[i] || 0;
        const currentPart = currentParts[i] || 0;
        
        if (newPart > currentPart) return true;
        if (newPart < currentPart) return false;
      }
      
      return false;
    } catch (error) {
      console.error('Error comparing versions:', error);
      // If version parsing fails, assume it's newer
      return true;
    }
  };

  const installAvailableUpdate = async () => {
    try {
      const usingCustomUpdate = isUsingCustomUpdate();
      
      if (usingCustomUpdate) {
        // Install custom update
        const currentCustomUpdateInfo = customUpdateInfo();
        if (!currentCustomUpdateInfo) {
          throw new Error("No custom update information available");
        }

        setUpdateStatus('downloading');
        setDownloadProgress({ downloaded: 0, total: null });
        console.log('Starting custom update download...', { version: currentCustomUpdateInfo.version });

        // For custom updates, we can't track progress easily, so show a simple indeterminate progress
        setDownloadProgress({ downloaded: 0, total: null });
        
        // Download and install the custom update
        await invoke("download_and_install_custom_update", { updateInfo: currentCustomUpdateInfo });
        
        // The custom update command will handle restarting the app
        // So we just set the status to installing
        setUpdateStatus('installing');
        console.log('Custom update installation initiated');
        
      } else {
        // Install Tauri update
        const currentUpdateInfo = updateInfo();
        if (!currentUpdateInfo) {
          throw new Error("No update information available");
        }

        setUpdateStatus('downloading');
        setDownloadProgress({ downloaded: 0, total: null });
        console.log('Starting Tauri update download...', { version: currentUpdateInfo.version });

        // Download and install the update with progress reporting
        await currentUpdateInfo.downloadAndInstall((progress) => {
          console.log('Update progress event:', progress.event, progress);

          if (progress.event === 'Started') {
            console.log('Download started', { contentLength: progress.data.contentLength });
            setDownloadProgress({
              downloaded: 0,
              total: progress.data.contentLength || null
            });
          } else if (progress.event === 'Progress') {
            const newDownloaded = progress.data.chunkLength || 0;

            setDownloadProgress(prev => {
              const updatedDownloaded = prev.downloaded + newDownloaded;
              return {
                downloaded: updatedDownloaded,
                total: prev.total
              };
            });

            // Calculate percentage using the total from Started event
            const currentProgress = downloadProgress();
            const percent = currentProgress.total
              ? Math.round((currentProgress.downloaded + newDownloaded) / currentProgress.total * 100)
              : undefined;

            if (percent !== undefined) {
              console.log(`Download progress: ${percent}% (${currentProgress.downloaded + newDownloaded} bytes)`);
            }
          } else if (progress.event === 'Finished') {
            console.log('Download finished, starting installation...');
            setUpdateStatus('installing');
          }
        });

        console.log('Tauri update installation completed successfully');

        // Restart the app after successful installation
        const confirmed = await ask(
          t("settings.about.update_complete"),
          {
            title: t("buttons.confirm"),
            kind: "info",
            okLabel: t("settings.about.restart_now"),
            cancelLabel: t("buttons.later")
          }
        );

        if (confirmed) {
          console.log('User confirmed restart, relaunching application...');
          await relaunch();
        } else {
          console.log('User postponed restart');
          setUpdateStatus('idle');
        }
      }
    } catch (error) {
      console.error('Failed to install update:', error);
      setUpdateStatus('error');

      const errorMessage = sanitizeErrorMessage(error);
      setUpdateError(errorMessage);
      console.error('Update installation error details:', errorMessage);
    }
  };

  props.ref({ checkForUpdates });

  return (
    <div class="card bg-base-200 shadow-xl overflow-hidden">
      {/* Hero Section */}
      <div class="bg-base-300 p-8 flex flex-col items-center text-center space-y-4">
        <div>
          <h2 class="text-3xl font-bold tracking-tight">Rscoop-Fork</h2>
          <p class="text-base-content/60 font-medium">v{pkgJson.version}</p>
        </div>
        <p class="max-w-md  leading-relaxed">
          {t("settings.about.description")}
        </p>
        <p class="text-sm text-base-content/60 mt-2">
          {t("settings.about.customized_version")}
        </p>
        <p class="text-sm text-base-content/60">
          {t("settings.about.please_report_issues")}
        </p>
      </div>

      <div class="card-body p-6 space-y-8">

        {/* Update Section */}
        <div class="bg-base-100 rounded-xl p-5 border border-base-content/5 shadow-sm">
          <div class="flex items-center justify-between mb-4 min-h-[36px]">
            <div class="font-semibold flex items-center gap-2">
              <RefreshCw class="w-4 h-4 text-base-content/70" />
              {t("settings.about.update_status")}
            </div>
            <div class="flex items-center">
              {props.isScoopInstalled && (
                <span class="badge badge-sm badge-info badge-outline mr-2">{t("settings.about.managed_by_scoop")}</span>
              )}
              {updateStatus() === 'idle' && !props.isScoopInstalled && (
                <button
                  class="btn btn-sm btn-primary"
                  onClick={() => checkForUpdates(true)}
                >
                  {t("settings.about.check_now")}
                </button>
              )}
              {updateStatus() === 'checking' && (
                <div class="flex items-center justify-center py-1 text-base-content/70 min-h-[36px]">
                  <span class="loading loading-spinner loading-sm mr-2"></span>
                  {t("settings.about.checking_for_updates")}
                </div>
              )}
            </div>
          </div>

          {props.isScoopInstalled ? (
            <div class="alert alert-info text-sm shadow-sm">
              <span>{t("settings.about.scoop_update_instruction", { code: "scoop update rscoop" })}</span>
            </div>
          ) : (
            <div class="space-y-4">
              {updateStatus() === 'available' && (
                <div class="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div class="alert alert-success shadow-sm">
                    <Download class="w-5 h-5" />
                    <div>
                      <h3 class="font-bold">
                        {t("settings.about.update_available")}
                        {isUsingCustomUpdate() && (
                          <span class="badge badge-sm badge-info ml-2">GitHub</span>
                        )}
                      </h3>
                      <div class="text-xs">
                        {t("settings.about.update_ready", {
                          version: isUsingCustomUpdate() 
                            ? (customUpdateInfo()?.version || "unknown")
                            : (updateInfo()?.version || "unknown")
                        })}
                        {isUsingCustomUpdate() && customUpdateInfo()?.channel && (
                          <span class="ml-2">
                            ({customUpdateInfo()?.channel === 'test' ? t("update_channel.test") : t("update_channel.stable")})
                          </span>
                        )}
                      </div>
                    </div>
                    <button class="btn btn-sm" onClick={installAvailableUpdate}>{t("buttons.install")}</button>
                  </div>
                  <Show when={isUsingCustomUpdate() ? customUpdateInfo()?.body : updateInfo()?.body}>
                    <div class="bg-base-200 rounded-lg p-3 text-xs max-h-32 overflow-y-auto border border-base-content/5">
                      <div class="font-bold mb-1 opacity-70">{t("settings.about.release_notes")}</div>
                      <div class="whitespace-pre-wrap opacity-80">
                        {isUsingCustomUpdate() ? (customUpdateInfo()?.body || '') : (updateInfo()?.body || '')}
                      </div>
                    </div>
                  </Show>
                </div>
              )}

              {updateStatus() === 'downloading' && (
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-medium">
                    <span>{t("settings.about.downloading_update")}</span>
                    <span>{downloadProgress().total
                      ? `${Math.round((downloadProgress().downloaded / (downloadProgress().total || 1)) * 100)}%`
                      : (t("settings.about.downloading_no_size"))}</span>
                  </div>
                  <progress
                    class="progress progress-primary w-full"
                    value={downloadProgress().downloaded}
                    max={downloadProgress().total || undefined}
                  />
                </div>
              )}

              {updateStatus() === 'installing' && (
                <div class="flex items-center justify-center py-2 text-success font-medium">
                  <span class="loading loading-spinner loading-sm mr-3"></span>
                  {t("settings.about.installing_update")}
                </div>
              )}

              {updateStatus() === 'error' && (
                <div class="alert alert-error shadow-sm">
                  <div class="flex-1">
                    <div class="font-bold text-xs">{t("settings.about.update_failed")}</div>
                    <div class="text-xs opacity-80">{updateError()}</div>
                  </div>
                  <button class="btn btn-xs btn-outline" onClick={() => checkForUpdates(true)}>{t("settings.about.retry")}</button>
                </div>
              )}
            </div>
          )}
          {/* Update Channel Selection */}
          <div class="border-t mt-6">
            <div class="font-semibold flex items-center gap-2 mb-4 mt-4">
              {t("update_channel.title")}
            </div>
            <div class="space-y-3">
              <For each={channels()}>
                {(channel) => (
                  <div
                    class={`p-3 rounded-lg border cursor-pointer transition-colors ${channel.isSelected()
                      ? 'bg-primary/10 border-primary/50'
                      : 'bg-base-200 border-base-300 hover:bg-base-300'
                      }`}
                    onClick={() => handleChannelChange(channel.value)}
                  >
                    <div class="flex items-start space-x-3">
                      <div class={channel.isSelected() ? 'text-primary' : 'text-base-content/60'}>
                        {channel.icon}
                      </div>
                      <div class="flex-1">
                        <div class="font-medium">{channel.label}</div>
                        <div class="text-sm text-base-content/60 mt-1">{channel.description}</div>
                      </div>
                      <div class="flex items-center">
                        {channel.isSelected() && (
                          <div class="w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                            <Check class="w-3 h-3 " strokeWidth={3} />
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                )}
              </For>
              <div class="flex items-center justify-between">
                <span class="text-sm text-base-content/70">{t("settings.about.check_now_note")}</span>
                <button
                  class="btn btn-xs btn-outline"
                  onClick={async () => {
                    await relaunch();
                  }}
                >
                  {t("settings.about.restart_app")}
                </button>
              </div>
            </div>
          </div>

          {props.isScoopInstalled ? (
            <div class="alert alert-info text-sm shadow-sm">
              <span>Use <code>scoop update rscoop</code> in your terminal to update.</span>
            </div>
          ) : (
            <div class="space-y-4">
              {updateStatus() === 'idle' && (
                <div class="flex items-center justify-between">
                  <span class="text-sm text-base-content/70">Check for the latest version</span>
                  <button
                    class="btn btn-sm btn-primary"
                    onClick={() => checkForUpdates(true)}
                  >
                    Check Now
                  </button>
                </div>
              )}

              {updateStatus() === 'checking' && (
                <div class="flex items-center justify-center py-2 text-base-content/70">
                  <span class="loading loading-spinner loading-sm mr-3"></span>
                  Checking for updates...
                </div>
              )}

              {updateStatus() === 'available' && (
                <div class="space-y-3 animate-in fade-in slide-in-from-top-2">
                  <div class="alert alert-success shadow-sm">
                    <Download class="w-5 h-5" />
                    <div>
                      <h3 class="font-bold">Update Available!</h3>
                      <div class="text-xs">Version {updateInfo()?.version} is ready to install.</div>
                    </div>
                    <button class="btn btn-sm" onClick={installAvailableUpdate}>Install</button>
                  </div>
                  <Show when={updateInfo()?.body}>
                    <div class="bg-base-200 rounded-lg p-3 text-xs max-h-32 overflow-y-auto border border-base-content/5">
                      <div class="font-bold mb-1 opacity-70">Release Notes:</div>
                      <div class="whitespace-pre-wrap opacity-80">{updateInfo()?.body}</div>
                    </div>
                  </Show>
                </div>
              )}

              {updateStatus() === 'downloading' && (
                <div class="space-y-2">
                  <div class="flex justify-between text-xs font-medium">
                    <span>Downloading update...</span>
                    <span>{downloadProgress().total
                      ? `${Math.round((downloadProgress().downloaded / (downloadProgress().total || 1)) * 100)}%`
                      : '...'}</span>
                  </div>
                  <progress
                    class="progress progress-primary w-full"
                    value={downloadProgress().downloaded}
                    max={downloadProgress().total || 100}
                  />
                </div>
              )}

              {updateStatus() === 'installing' && (
                <div class="flex items-center justify-center py-2 text-success font-medium">
                  <span class="loading loading-spinner loading-sm mr-3"></span>
                  Installing update...
                </div>
              )}

              {updateStatus() === 'error' && (
                <div class="alert alert-error shadow-sm">
                  <div class="flex-1">
                    <div class="font-bold text-xs">Update Failed</div>
                    <div class="text-xs opacity-80">{updateError()}</div>
                  </div>
                  <button class="btn btn-xs btn-outline" onClick={() => checkForUpdates(true)}>Retry</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Links */}
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            class="btn btn-outline hover:bg-base-content hover:text-base-100 transition-all"
            onClick={() => openUrl('https://github.com/Kwensiu/Rscoop/').catch(console.error)}
          >
            <Github class="w-5 h-5" />
            {t("settings.about.my_fork")}
          </button>
          <button
            class="btn btn-outline hover:bg-base-content hover:text-base-100 transition-all"
            onClick={() => openUrl('https://github.com/AmarBego/Rscoop').catch(console.error)}
          >
            <Github class="w-5 h-5" />
            {t("settings.about.upstream")}
          </button>

          <button
            class="btn btn-outline btn-info hover:text-info-content transition-all"
            onClick={() => openUrl('https://amarbego.github.io/Rscoop/').catch(console.error)}
          >
            <BookOpen class="w-5 h-5" />
            {t("settings.about.docs")}
          </button>

        </div>

        {/* Footer */}
        <div class="text-center text-xs text-base-content/30 pt-4">
          <p>Copyright © {new Date().getFullYear()} AmarBego / Kwensiu. MIT License.</p>
        </div>
      </div>
    </div>
  );
}