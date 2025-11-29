import { createSignal, onMount, For, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCw, Settings, Folder, Edit } from "lucide-solid";
import Card from "../../common/Card";
import Modal from "../../common/Modal";

interface ScoopConfig {
    [key: string]: any;
}

export interface ScoopInfoProps {
    onOpenDirectory?: () => void;
}

function ScoopInfo(props: ScoopInfoProps) {
    const [scoopPath, setScoopPath] = createSignal<string | null>(null);
    const [scoopConfig, setScoopConfig] = createSignal<ScoopConfig | null>(null);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal<string | null>(null);
    const [isEditModalOpen, setIsEditModalOpen] = createSignal(false);
    const [editConfig, setEditConfig] = createSignal<string>("");
    const [isSaving, setIsSaving] = createSignal(false);
    const [saveError, setSaveError] = createSignal<string | null>(null);

    const fetchScoopInfo = async () => {
        setIsLoading(true);
        setError(null);

        try {
            // Get Scoop path
            const path = await invoke<string | null>("get_scoop_path");
            setScoopPath(path);

            // Get Scoop configuration
            const config = await invoke<ScoopConfig | null>("get_scoop_config");
            setScoopConfig(config);

        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to fetch scoop info:", errorMsg);
            setError("Could not load Scoop information.");
        } finally {
            setIsLoading(false);
        }
    };

    onMount(fetchScoopInfo);

    const openEditModal = () => {
        const config = scoopConfig();
        if (config) {
            setEditConfig(JSON.stringify(config, null, 2));
            setSaveError(null);
            setIsEditModalOpen(true);
        }
    };

    const closeEditModal = () => {
        setIsEditModalOpen(false);
        setEditConfig("");
        setSaveError(null);
    };

    const saveConfig = async () => {
        setIsSaving(true);
        setSaveError(null);

        try {
            const config = JSON.parse(editConfig());
            await invoke("update_scoop_config", { config });

            // Refresh the config after saving
            const newConfig = await invoke<ScoopConfig | null>("get_scoop_config");
            setScoopConfig(newConfig);

            closeEditModal();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error("Failed to save scoop config:", errorMsg);
            setSaveError("Failed to save configuration: " + errorMsg);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <>
            <Card
                title="Scoop Configuration"
                icon={Settings}
                headerAction={
                    <div class="flex items-center gap-2">
                        <Show when={scoopConfig()}>
                            <button
                                class="btn btn-ghost btn-sm"
                                onClick={openEditModal}
                                title="Edit Configuration"
                            >
                                <Edit class="w-5 h-5" />
                            </button>
                        </Show><Show when={props.onOpenDirectory && scoopPath()}>
                            <button
                                class="btn btn-ghost btn-sm"
                                onClick={props.onOpenDirectory}
                                title="Open Scoop Directory"
                            >
                                <Folder class="w-5 h-5" />
                            </button>
                        </Show>

                        <button
                            class="btn btn-ghost btn-sm"
                            onClick={fetchScoopInfo}
                            disabled={isLoading()}
                        >
                            <RefreshCw class="w-5 h-5" classList={{ "animate-spin": isLoading() }} />
                        </button>
                    </div>
                }
            >
                {isLoading() ? (
                    <div class="flex justify-center items-center h-32">
                        <div class="loading loading-spinner loading-md"></div>
                    </div>
                ) : error() ? (
                    <div class="alert alert-error">
                        <span>{error()}</span>
                    </div>
                ) : (
                    <div class="space-y-4">
                        <div>
                            {scoopConfig() ? (
                                <div class="bg-base-300 p-4 rounded-lg overflow-x-auto text-sm">
                                    <For each={Object.entries(scoopConfig()!)}>
                                        {([key, value]) => (
                                            <div class="flex py-1 border-b border-base-100 last:border-0">
                                                <span class="font-mono font-bold text-primary mr-2 min-w-[150px]">{key}:</span>
                                                <span class="font-mono">
                                                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                                                </span>
                                            </div>
                                        )}
                                    </For>
                                </div>
                            ) : (
                                <p class="ml-2">No configuration found</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>
            {/* --- Editer Modal --- */}
            <Modal
                isOpen={isEditModalOpen()}
                onClose={closeEditModal}
                title="Edit Scoop Configuration"
                footer={
                    <div class="flex justify-end gap-2">
                        <button
                            class="btn btn-error"
                            onClick={closeEditModal}
                        >
                            Cancel
                        </button>
                        <button
                            class="btn btn-primary"
                            onClick={saveConfig}
                            disabled={isSaving()}
                        >
                            {isSaving() ? "Saving..." : "Save"}
                        </button>
                    </div>
                }
                class="max-w-2xl"
            >
                <textarea
                    class="w-full h-64 font-mono text-sm leading-relaxed resize-none bg-base-200 p-4 border border-base-300 rounded"
                    value={editConfig()}
                    onInput={(e) => setEditConfig(e.target.value)}
                />
                <Show when={saveError()}>
                    <div class="alert alert-error mt-4">
                        <span>{saveError()}</span>
                    </div>
                </Show>
            </Modal>


        </>
    );
}

export default ScoopInfo;