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
  const [updateError, setUpdateError] = createSignal<string | null>(null);
  const [downloadProgress, setDownloadProgress] = createSignal<{ downloaded: number; total: number | null }>({ downloaded: 0, total: null });

  const handleChannelChange = async (channel: 'stable' | 'test') => {
    await setUpdateSettings({ channel });

    // Call backend to reload update configuration
    try {
      await invoke("reload_update_config");
    } catch (error) {
      console.error("Failed to reload update configuration:", error);
      // Notify user about configuration reload failure
      await message(t("settings.about.config_reload_failed"), {
        title: t("settings.about.config_error"),
        kind: "error"
      });
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

      console.log('Starting update check process...');
      const update = await check();
      console.log('Update check completed', { updateAvailable: !!update?.available });

      if (update?.available) {
        setUpdateStatus('available');
        setUpdateInfo(update);
        console.log('Update found', {
          version: update.version,
          body: update.body
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
      } else {
        setUpdateStatus('idle');
        if (manual) {
          const messageText = t("settings.about.latest_version");
          await message(messageText, {
            title: t("settings.about.no_updates_available"),
            kind: "info"
          });
        }
        console.log('No updates available');
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

  const installAvailableUpdate = async () => {
    try {
      const currentUpdateInfo = updateInfo();
      if (!currentUpdateInfo) {
        throw new Error("No update information available");
      }

      setUpdateStatus('downloading');
      setDownloadProgress({ downloaded: 0, total: null });
      console.log('Starting update download...', { version: currentUpdateInfo.version });

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

      console.log('Update installation completed successfully');

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
                      <h3 class="font-bold">{t("settings.about.update_available")}</h3>
                      <div class="text-xs">
                        {t("settings.about.update_ready", {
                          version: updateInfo()?.version || "unknown"
                        })}
                      </div>
                    </div>
                    <button class="btn btn-sm" onClick={installAvailableUpdate}>{t("buttons.install")}</button>
                  </div>
                  <Show when={updateInfo()?.body}>
                    <div class="bg-base-200 rounded-lg p-3 text-xs max-h-32 overflow-y-auto border border-base-content/5">
                      <div class="font-bold mb-1 opacity-70">{t("settings.about.release_notes")}</div>
                      <div class="whitespace-pre-wrap opacity-80">{updateInfo()?.body || ''}</div>
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