import { For, createEffect, onCleanup } from "solid-js";
import { Terminal } from "lucide-solid";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { stripAnsi } from "../../../utils/ansiUtils";
import Card from "../../common/Card";
import { t } from "../../../i18n";
import { useOperations } from "../../../stores/operations";

function CommandInputField() {
    const { commandExecution, setCommand, setCommandRunning, toggleScoopPrefix, addCommandOutput, clearCommandOutput } = useOperations();
    
    const exec = commandExecution();
    let scrollRef: HTMLDivElement | undefined;
    let currentUnlisteners: UnlistenFn[] = [];

    onCleanup(() => {
        currentUnlisteners.forEach(unlisten => unlisten());
        currentUnlisteners = [];
    });

    createEffect(() => {
        if (exec.output.length > 0 && scrollRef) {
            const isNearBottom = scrollRef.scrollHeight - scrollRef.scrollTop <= scrollRef.clientHeight + 100;
            if (isNearBottom) {
                scrollRef.scrollTop = scrollRef.scrollHeight;
            }
        }
    });

    const fixEncoding = (str: string): string => {
        try {
            if (/[\x80-\xFF]/.test(str)) {
                const latin1Str = str.replace(/[\x80-\xFF]/g, (match) =>
                    String.fromCharCode(match.charCodeAt(0) & 0xFF)
                );
                return decodeURIComponent(escape(latin1Str));
            }
        } catch (e) {
            console.debug("Failed to fix encoding:", e);
        }
        return str;
    };

    const handleRunCommand = async () => {
        if (!exec.command.trim() || exec.isRunning) return;

        try {
            const fullCommand = exec.useScoopPrefix ? `scoop ${exec.command}` : exec.command;

            addCommandOutput({ line: `> ${fullCommand}`, source: 'command', timestamp: Date.now() });
            setCommandRunning(true);

            const unlisten: UnlistenFn = await listen('operation-output', (event: any) => {
                const cleanLine = {
                    line: fixEncoding(stripAnsi(event.payload.line)),
                    source: event.payload.source,
                    timestamp: Date.now()
                };
                addCommandOutput(cleanLine);
            });

            const unlistenFinished: UnlistenFn = await listen('operation-finished', (event: any) => {
                unlisten();
                unlistenFinished();
                currentUnlisteners = currentUnlisteners.filter(u => u !== unlisten && u !== unlistenFinished);
                setCommandRunning(false);
                addCommandOutput({ 
                    line: fixEncoding(stripAnsi(event.payload.message)), 
                    source: event.payload.success ? 'success' : 'error',
                    timestamp: Date.now()
                });
            });

            currentUnlisteners.push(unlisten, unlistenFinished);

            if (exec.useScoopPrefix) {
                await invoke("run_scoop_command", { command: exec.command });
            } else {
                await invoke("run_powershell_command", { command: exec.command });
            }
        } catch (error: any) {
            console.error("Failed to execute command:", error);
            setCommandRunning(false);
            currentUnlisteners.forEach(unlisten => unlisten());
            currentUnlisteners = [];
            addCommandOutput({ 
                line: "Error: " + error.message, 
                source: 'error',
                timestamp: Date.now()
            });
        }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            handleRunCommand();
        }
    };

    const handleClearOutput = () => {
        clearCommandOutput();
    };

    const handleToggleScoopPrefix = () => {
        toggleScoopPrefix();
    };

    return (
        <Card
            title={t('doctor.commandInput.title')}
            icon={Terminal}
            // description={t('doctor.commandInput.description')}
            additionalContent={t('doctor.commandInput.switchInputMode')}
        >
            <div class="form-control">
                <div class="join w-full">
                    <span
                        class={`btn join-item transition-all duration-300 cursor-pointer ${exec.useScoopPrefix
                            ? 'btn-success'
                            : 'bg-gray-500 text-gray-300 hover:bg-gray-600'
                            }`}
                        onClick={handleToggleScoopPrefix}
                        style={{
                            "text-decoration": exec.useScoopPrefix ? "none" : "line-through"
                        }}
                        title={exec.useScoopPrefix ? t('doctor.commandInput.scoopPrefixEnabled') : t('doctor.commandInput.scoopPrefixDisabled')}
                    >
                        scoop
                    </span>
                    <input
                        type="text"
                        placeholder={exec.useScoopPrefix ? t('doctor.commandInput.enterCommand') : t('doctor.commandInput.enterFullCommand')}
                        class="input input-bordered join-item flex-1"
                        value={exec.command}
                        onInput={(e) => setCommand(e.currentTarget.value)}
                        onKeyPress={handleKeyPress}
                        disabled={exec.isRunning}
                    />
                    <button class="btn btn-primary join-item" onClick={handleRunCommand} disabled={exec.isRunning}>
                        {exec.isRunning ? (
                            <>
                                <span class="loading loading-spinner loading-xs"></span>
                                {t('doctor.commandInput.running')}
                            </>
                        ) : (
                            <>
                                <Terminal class="w-4 h-4" />
                                {t('doctor.commandInput.run')}
                            </>
                        )}
                    </button>
                </div>
            </div>

            {/* 终端模拟显示框 */}
            <div class="mt-4">
                <div ref={el => scrollRef = el} class="bg-black rounded-lg p-3 font-mono text-sm max-h-60 overflow-y-auto">
                    <For each={exec.output}>
                        {(line) => (
                            <div class={
                                line.source === 'stderr' || line.source === 'error' ? 'text-red-500' :
                                    line.source === 'command' ? 'text-blue-400' :
                                        line.source === 'success' ? 'text-green-500' :
                                            'text-white'
                            }>
                                {line.line}
                            </div>
                        )}
                    </For>
                    {exec.output.length === 0 && !exec.isRunning && (
                        <div class="text-gray-500">
                            {t('doctor.commandInput.waitingForCommands')}
                        </div>
                    )}
                    {exec.isRunning && (
                        <div class="flex items-center text-white">
                            <span class="loading loading-spinner loading-xs mr-2"></span>
                            {t('doctor.commandInput.executingCommand')}
                        </div>
                    )}
                    {/* 占位元素，用于确保滚动到底部 */}
                    <div />
                </div>
                <div class="mt-2 flex justify-end">
                    <button class="btn btn-xs btn-ghost" onClick={handleClearOutput}>{t('doctor.commandInput.clearOutput')}</button>
                </div>
            </div>

            <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                <div class="bg-info/10 p-2 rounded">
                    <p><strong>{t('doctor.commandInput.packageManagement')}:</strong> install, uninstall, update, info</p>
                </div>
                <div class="bg-info/10 p-2 rounded">
                    <p><strong>{t('doctor.commandInput.information')}:</strong> list, status, checkup</p>
                </div>
                <div class="bg-info/10 p-2 rounded">
                    <p><strong>{t('doctor.commandInput.search')}:</strong> search, show, cat</p>
                </div>
                <div class="bg-info/10 p-2 rounded">
                    <p><strong>{t('doctor.commandInput.maintenance')}:</strong> cleanup, cache, reset</p>
                </div>
            </div>
        </Card>
    );
}

export default CommandInputField;