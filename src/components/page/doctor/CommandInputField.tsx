import { createSignal, For, createEffect } from "solid-js";
import { Terminal } from "lucide-solid";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";

interface OperationOutput {
  line: string;
  source: string;
}

function CommandInputField() {
    const [command, setCommand] = createSignal("");
    const [output, setOutput] = createSignal<OperationOutput[]>([]);
    const [isRunning, setIsRunning] = createSignal(false);
    const [useScoopPrefix, setUseScoopPrefix] = createSignal(true);
    let scrollRef: HTMLDivElement | undefined;

    createEffect(() => {
        if (output().length > 0 && scrollRef) {
            const isNearBottom = scrollRef.scrollHeight - scrollRef.scrollTop <= scrollRef.clientHeight + 100;
            if (isNearBottom) {
                scrollRef.scrollTop = scrollRef.scrollHeight;
            }
        }
    });

    const handleRunCommand = async () => {
        if (!command().trim() || isRunning()) return;
        
        try {
            const fullCommand = useScoopPrefix() ? `scoop ${command()}` : command();
            
            setOutput(prev => [...prev, { line: `> ${fullCommand}`, source: 'command' }]);
            setIsRunning(true);
            
            const unlisten: UnlistenFn = await listen('operation-output', (event: any) => {
                setOutput(prev => [...prev, event.payload]);
            });
            
            const unlistenFinished: UnlistenFn = await listen('operation-finished', (event: any) => {
                unlisten();
                unlistenFinished();
                setIsRunning(false);
                setOutput(prev => [...prev, { line: event.payload.message, source: event.payload.success ? 'success' : 'error' }]);
            });
            
            if (useScoopPrefix()) {
                await invoke("run_scoop_command", { command: command() });
            } else {
                await invoke("run_powershell_command", { command: command() });
            }
        } catch (error: any) {
            console.error("Failed to execute command:", error);
            setIsRunning(false);
            setOutput(prev => [...prev, { line: "Error: " + error.message, source: 'error' }]);
        }
    };

    const handleKeyPress = (e: KeyboardEvent) => {
        if (e.key === "Enter") {
            handleRunCommand();
        }
    };

    const handleClearOutput = () => {
        setOutput([]);
    };

    const toggleScoopPrefix = () => {
        setUseScoopPrefix(!useScoopPrefix());
    };

    return (
        <div class="card bg-base-200 shadow-xl">
            <div class="card-body">
                <h2 class="card-title text-xl">
                    Scoop Commands
                </h2>
                <p class="text-base-content/80 mb-4">
                    Execute Scoop commands directly from here.
                </p>
                
                <div class="form-control">
                    <div class="join w-full">
                        <span 
                            class={`btn join-item transition-all duration-300 cursor-pointer ${
                                useScoopPrefix() 
                                    ? 'btn-success' 
                                    : 'bg-gray-500 text-gray-300 hover:bg-gray-600'
                            }`}
                            onClick={toggleScoopPrefix}
                            style={{
                                "text-decoration": useScoopPrefix() ? "none" : "line-through"
                            }}
                            title={useScoopPrefix() ? "Scoop prefix enabled (click to disable)" : "Scoop prefix disabled (click to enable)"}
                        >
                            scoop
                        </span>
                        <input 
                            type="text" 
                            placeholder={useScoopPrefix() ? "Enter command (e.g. 'install git')" : "Enter full command (e.g. 'scoop install git')"} 
                            class="input input-bordered join-item flex-1" 
                            value={command()}
                            onInput={(e) => setCommand(e.currentTarget.value)}
                            onKeyPress={handleKeyPress}
                            disabled={isRunning()}
                        />
                        <button class="btn btn-primary join-item" onClick={handleRunCommand} disabled={isRunning()}>
                            {isRunning() ? (
                                <>
                                    <span class="loading loading-spinner loading-xs"></span>
                                    Running...
                                </>
                            ) : (
                                <>
                                    <Terminal class="w-4 h-4" />
                                    Run
                                </>
                            )}
                        </button>
                    </div>
                </div>
                
                {/* 终端模拟显示框 */}
                <div class="mt-4">
                    <div ref={el => scrollRef = el} class="bg-black rounded-lg p-3 font-mono text-sm max-h-60 overflow-y-auto">
                        <For each={output()}>
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
                        {output().length === 0 && !isRunning() && (
                            <div class="text-gray-500">
                                Waiting for Commands input...
                            </div>
                        )}
                        {isRunning() && (
                            <div class="flex items-center text-white">
                                <span class="loading loading-spinner loading-xs mr-2"></span>
                                Executing command...
                            </div>
                        )}
                        {/* 占位元素，用于确保滚动到底部 */}
                        <div />
                    </div>
                    <div class="mt-2 flex justify-end">
                        <button class="btn btn-xs btn-ghost" onClick={handleClearOutput}>Clear Output</button>
                    </div>
                </div>
                
                <div class="mt-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div class="bg-info/10 p-2 rounded">
                        <p><strong>Package Management:</strong> install, uninstall, update, info</p>
                    </div>
                    <div class="bg-info/10 p-2 rounded">
                        <p><strong>Information:</strong> list, status, checkup</p>
                    </div>
                    <div class="bg-info/10 p-2 rounded">
                        <p><strong>Search:</strong> search, show, cat</p>
                    </div>
                    <div class="bg-info/10 p-2 rounded">
                        <p><strong>Maintenance:</strong> cleanup, cache, reset</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default CommandInputField;