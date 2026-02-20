import { Show, For } from "solid-js";
import { CircleCheckBig, TriangleAlert, WifiOff, FolderOpen } from "lucide-solid";
import { View } from "../types/scoop";
import Modal from "./common/Modal";
import { t } from "../i18n"

interface AppWithIssue {
  name: string;
  installed_version: string;
  latest_version?: string;
  is_held?: boolean;
  is_outdated?: boolean;
  info: string[];
}

interface ScoopStatus {
  is_everything_ok: boolean;
  scoop_needs_update?: boolean;
  bucket_needs_update?: boolean;
  network_failure?: boolean;
  apps_with_issues?: AppWithIssue[];
}

interface ScoopStatusModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: ScoopStatus | null;
  loading: boolean;
  error: string | null;
  onNavigate?: (view: View) => void;
}

const getBadgeClass = (info: string): string => {
  if (info.includes("Deprecated")) return "badge-warning";
  if (info.includes("failed") || info.includes("removed")) return "badge-error";
  if (info.includes("Versioned install")) return "badge-info text-cyan-400";
  return "badge-info";
};

function AppsWithIssuesTable(props: { apps: AppWithIssue[] }) {
  return (
    <div class="space-y-2">
      <h4 class="font-semibold">{t('scoopStatus.appsWithIssues')}</h4>
      <div class="overflow-x-auto">
        <table class="table table-zebra w-full">
          <thead>
            <tr>
              <th>{t('scoopStatus.table.name')}</th>
              <th>{t('scoopStatus.table.installed')}</th>
              <th>{t('scoopStatus.table.latest')}</th>
              <th>{t('scoopStatus.table.status')}</th>
            </tr>
          </thead>
          <tbody>
            <For each={props.apps}>
              {(app) => (
                <tr>
                  <td class="font-medium">{app.name}</td>
                  <td>{app.installed_version}</td>
                  <td>{app.latest_version || "-"}</td>
                  <td>
                    <div class="flex flex-wrap gap-1">
                      {app.is_held && (
                        <div class="badge badge-sm badge-warning">{t('scoopStatus.badges.heldPackage')}</div>
                      )}
                      <For
                        each={app.info.filter(
                          (info) => !info.includes("Held package")
                        )}
                      >
                        {(info) => (
                          <div
                            class={`badge badge-sm ${getBadgeClass(info)}`}
                          >
                            {info}
                          </div>
                        )}
                      </For>
                      {app.is_outdated && (
                        <div class="badge badge-sm badge-success">
                          {t('scoopStatus.badges.updateAvailable')}
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </For>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScoopStatusModal(props: ScoopStatusModalProps) {
  const handleGoToBuckets = () => {
    props.onNavigate?.("bucket");
    props.onClose();
  };

  return (
    <Modal
      isOpen={props.isOpen}
      onClose={props.onClose}
      title={t('scoopStatus.title')}
      size="large"
      footer={
        <Show when={props.status?.bucket_needs_update && props.onNavigate}>
          <button
            class="btn btn-primary btn-sm"
            onClick={handleGoToBuckets}
          >
            <FolderOpen class="w-4 h-4 mr-2" />
            {t('buttons.goToBuckets')} </button>
        </Show>
      }
    >
      <Show when={props.loading}>
        <div class="flex justify-center items-center py-8">
          <span class="loading loading-spinner loading-lg"></span>
        </div>
      </Show>

      <Show when={props.error}>
        <div class="alert alert-error alert-outline">
          <TriangleAlert class="w-4 h-4" />
          <span>{t('scoopStatus.errorCheckingStatus')}: {props.error}</span>
        </div>
      </Show>

      <Show when={props.status && !props.loading && !props.error}>
        <div class="space-y-4">
          {/* Scoop Updates */}
          <Show when={props.status!.scoop_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>
                {t('scoopStatus.scoopOutOfDate')}
              </span>
            </div>
          </Show>

          {/* Bucket Updates */}
          <Show when={props.status!.bucket_needs_update}>
            <div class="alert alert-warning alert-outline">
              <TriangleAlert class="w-4 h-4" />
              <span>
                {t('scoopStatus.bucketsOutOfDate')}
              </span>
            </div>
          </Show>

          {/* Network Issues */}
          <Show when={props.status!.network_failure}>
            <div class="alert alert-error alert-outline">
              <WifiOff class="w-4 h-4" />
              <span>
                {t('scoopStatus.networkFailure')}
              </span>
            </div>
          </Show>

          {/* Apps with Issues */}
          <Show when={props.status!.apps_with_issues?.length}>
            <AppsWithIssuesTable apps={props.status!.apps_with_issues!} />
          </Show>

          {/* All Good Message */}
          <Show when={props.status!.is_everything_ok && !props.status!.network_failure}>
            <div class="alert alert-success alert-outline">
              <CircleCheckBig class="w-4 h-4" />
              <span>
                {t('scoopStatus.allGoodMessage')}
              </span>
            </div>
          </Show>
        </div>
      </Show>
    </Modal>
  );
}

export default ScoopStatusModal;