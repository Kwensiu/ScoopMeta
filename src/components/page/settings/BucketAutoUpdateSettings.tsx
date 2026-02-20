import { createSignal, onMount, Show } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { RefreshCcw } from "lucide-solid";
import settingsStore from "../../../stores/settings";
import Card from "../../common/Card";
import { t } from "../../../i18n";

// Predefined new intervals per requirement plus backward compatibility display
const INTERVAL_OPTIONS: { label: string; value: string; description: string }[] = [
    { label: "settings.bucketAutoUpdate.off", value: "off", description: "settings.bucketAutoUpdate.offDescription" },
    { label: "settings.bucketAutoUpdate.every24Hours", value: "24h", description: "settings.bucketAutoUpdate.every24HoursDescription" },
    { label: "settings.bucketAutoUpdate.everyWeek", value: "7d", description: "settings.bucketAutoUpdate.everyWeekDescription" },
];

export default function BucketAutoUpdateSettings() {
    const { settings, setBucketSettings } = settingsStore;
    const [loading, setLoading] = createSignal(false);
    const [saving, setSaving] = createSignal(false);
    const [error, setError] = createSignal<string | null>(null);

    const fetchInterval = async () => {
        setLoading(true);
        setError(null);
        try {
            const value = await invoke<unknown>("get_config_value", { key: "buckets.autoUpdateInterval" });
            if (typeof value === "string") {
                await setBucketSettings({ autoUpdateInterval: value });
            } else if (value && typeof value === "object" && (value as any).value) {
                // Edge case if store returns wrapped value
                const v = (value as any).value;
                if (typeof v === "string") await setBucketSettings({ autoUpdateInterval: v });
            }
        } catch (e) {
            // Non-fatal: setting may not exist yet
            setError(null);
        } finally {
            setLoading(false);
        }
    };

    const persistInterval = async (newValue: string) => {
        setSaving(true);
        setError(null);
        try {
            await setBucketSettings({ autoUpdateInterval: newValue });
            await invoke("set_config_value", { key: "buckets.autoUpdateInterval", value: newValue });
        } catch (e) {
            setError(t("settings.bucketAutoUpdate.error"));
        } finally {
            setSaving(false);
        }
    };

    const handleSelect = (value: string) => {
        persistInterval(value);
    };

    onMount(() => {
        fetchInterval();
    });

    return (
        <Card
            title={t("settings.bucketAutoUpdate.title")}
            icon={RefreshCcw}
            description={t("settings.bucketAutoUpdate.description")}
            headerAction={
                <div class="flex items-center gap-3">
                    <ActiveIntervalDisplay value={settings.buckets.autoUpdateInterval} />
                    {saving() && <span class="loading loading-spinner loading-xs" />}
                </div >
            }
        >
            <div class="flex flex-col gap-2">
                {INTERVAL_OPTIONS.map(opt => (
                    <label class="flex items-center justify-between bg-base-300/60 rounded-md px-3 py-2 cursor-pointer border border-base-content/50 hover:border-base-content/20 transition-colors">
                        <div class="flex flex-col">
                            <span class="text-sm font-medium">{t(opt.label)}</span>
                            <span class="text-[10px] opacity-70">{t(opt.description)}</span>
                        </div>
                        <input
                            type="radio"
                            name="bucketIntervalPreset"
                            value={opt.value}
                            checked={settings.buckets.autoUpdateInterval === opt.value}
                            disabled={loading() || saving()}
                            onChange={() => handleSelect(opt.value)}
                            class="radio radio-primary"
                        />
                    </label>
                ))}
            </div>

            {/* Custom interval */}
            <div class="mt-4 bg-base-300/40 rounded-md p-3 border border-dashed border-base-content/50">
                <label class="flex items-center justify-between cursor-pointer mb-3">
                    <div>
                        <span class="text-xs font-semibold uppercase tracking-wide opacity-90">{t("settings.bucketAutoUpdate.customInterval")}</span>
                        <p class="text-[11px] mt-1 opacity-70">{t("settings.bucketAutoUpdate.customIntervalDescription")}</p>
                    </div>
                    <input
                        type="radio"
                        name="bucketIntervalPreset"
                        value="custom"
                        checked={settings.buckets.autoUpdateInterval.startsWith('custom:')}
                        disabled={loading() || saving()}
                        onChange={() => {
                            // If the current value is not a custom value, set to a default custom value
                            if (!settings.buckets.autoUpdateInterval.startsWith('custom:')) {
                                persistInterval('custom:3600'); // Default to 1 hour
                            }
                        }}
                        class="radio radio-primary"
                    />
                </label>
                <CustomIntervalEditor
                    currentValue={settings.buckets.autoUpdateInterval}
                    onPersist={persistInterval}
                    disabled={loading() || saving()}
                    debug={settings.debug.enabled}
                />
                <Show when={settings.debug.enabled}>
                    <div class="mt-3 flex items-center gap-2">
                        <button
                            type="button"
                            class="btn btn-xs btn-warning"
                            disabled={saving() || loading()}
                            onClick={() => persistInterval("custom:10")}
                        >
                            {t("settings.bucketAutoUpdate.debug")}
                        </button>
                        <span class="text-[10px] opacity-60">{t("settings.bucketAutoUpdate.debugDescription")}</span>
                    </div>
                </Show>
            </div>

            <Show when={settings.buckets.autoUpdateInterval !== 'off'}>
                <div class="divider my-4"></div>

                <div class="flex items-center justify-between">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{t("settings.bucketAutoUpdate.silentUpdate")}</span>
                        <span class="text-[11px] text-base-content/60">{t("settings.bucketAutoUpdate.silentUpdateDescription")}</span>
                    </div>
                    <label class="label cursor-pointer">
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.buckets.silentUpdateEnabled}
                            onChange={async (e) => {
                                await setBucketSettings({ silentUpdateEnabled: e.currentTarget.checked });
                                await invoke("set_config_value", { key: "buckets.silentUpdateEnabled", value: e.currentTarget.checked });
                            }}
                        />
                    </label>
                </div>

                <div class="flex items-center justify-between mt-4">
                    <div class="flex flex-col">
                        <span class="text-sm font-medium">{t("settings.bucketAutoUpdate.autoUpdatePackages")}</span>
                        <span class="text-[11px] text-base-content/60">{t("settings.bucketAutoUpdate.autoUpdatePackagesDescription")}</span>
                    </div>
                    <label class="label cursor-pointer">
                        <input
                            type="checkbox"
                            class="toggle toggle-primary"
                            checked={settings.buckets.autoUpdatePackagesEnabled}
                            onChange={async (e) => {
                                await setBucketSettings({ autoUpdatePackagesEnabled: e.currentTarget.checked });
                                await invoke("set_config_value", { key: "buckets.autoUpdatePackagesEnabled", value: e.currentTarget.checked });
                            }}
                        />
                    </label>
                </div>
            </Show>
            {error() && <div class="alert alert-error mt-4 text-xs">{error()}</div>}
        </Card >
    );
}

interface CustomIntervalEditorProps {
    currentValue: string;
    onPersist: (newValue: string) => Promise<void> | void;
    disabled?: boolean;
    debug?: boolean;
}

function parseSeconds(value: string): number | null {
    if (value.startsWith("custom:")) {
        return value.substring(7).match(/^\d+$/) ? parseInt(value.substring(7), 10) : null;
    }
    if (/^\d+$/.test(value)) return parseInt(value, 10); // raw seconds
    const map: Record<string, number> = { "24h": 86400, "1d": 86400, "7d": 604800, "1w": 604800, "1h": 3600, "6h": 21600 };
    return map[value] ?? null;
}

function CustomIntervalEditor(props: CustomIntervalEditorProps) {
    const { currentValue, onPersist } = props;
    const [quantity, setQuantity] = createSignal(1);
    const [unit, setUnit] = createSignal("days");
    const [preview, setPreview] = createSignal<string>("");
    const [error, setError] = createSignal<string | null>(null);
    const [saving, setSaving] = createSignal(false);
    const [justSaved, setJustSaved] = createSignal(false);

    onMount(() => {
        const secs = parseSeconds(currentValue);
        if (secs) {
            // Try to map back to quantity/unit (prefer weeks, then days, hours, minutes)
            if (secs % 604800 === 0) { setQuantity(secs / 604800); setUnit("weeks"); }
            else if (secs % 86400 === 0) { setQuantity(secs / 86400); setUnit("days"); }
            else if (secs % 3600 === 0) { setQuantity(secs / 3600); setUnit("hours"); }
            else if (secs % 60 === 0) { setQuantity(secs / 60); setUnit("minutes"); }
        }
        updatePreview();
    });

    const unitSeconds = (u: string) => ({ minutes: 60, hours: 3600, days: 86400, weeks: 604800 }[u] || 0);

    const updatePreview = () => {
        const secs = quantity() * unitSeconds(unit());
        if (secs < 300) {
            setError(t("settings.bucketAutoUpdate.minimumInterval"));
        } else {
            setError(null);
        }
        setPreview(t("settings.bucketAutoUpdate.previewFormat", { seconds: secs, human: formatHuman(secs) }));
    };

    const formatHuman = (secs: number) => {
    if (secs % 604800 === 0) {
        const count = secs / 604800;
        return count === 1 
            ? t("settings.bucketAutoUpdate.weekFormat", { count })
            : t("settings.bucketAutoUpdate.weeksFormat", { count });
    }
    if (secs % 86400 === 0) {
        const count = secs / 86400;
        return count === 1 
            ? t("settings.bucketAutoUpdate.dayFormat", { count })
            : t("settings.bucketAutoUpdate.daysFormat", { count });
    }
    if (secs % 3600 === 0) {
        const count = secs / 3600;
        return count === 1 
            ? t("settings.bucketAutoUpdate.hourFormat", { count })
            : t("settings.bucketAutoUpdate.hoursFormat", { count });
    }
    if (secs % 60 === 0) {
        const count = secs / 60;
        return count === 1 
            ? t("settings.bucketAutoUpdate.minuteFormat", { count })
            : t("settings.bucketAutoUpdate.minutesFormat", { count });
    }
    return t("settings.bucketAutoUpdate.secondsFormat", { count: secs });
    };

    const handlePersist = async () => {
        const secs = quantity() * unitSeconds(unit());
        const minSecs = props.debug ? 10 : 300;
        if (secs < minSecs) { setError(`${t("settings.bucketAutoUpdate.intervalTooShort", { seconds: minSecs })}`); return; }
        setSaving(true);
        try {
            await onPersist(`custom:${secs}`);
            setJustSaved(true);
            setTimeout(() => setJustSaved(false), 2500);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div class="space-y-2">
            <div class="flex gap-2 items-end">
                <div class="flex-1">
                    <label class="label"><span class="label-text text-xs">{t("settings.bucketAutoUpdate.quantity")}</span></label>
                    <input
                        type="number"
                        min={1}
                        class="input input-sm input-bordered w-full"
                        value={quantity()}
                        disabled={props.disabled}
                        onInput={(e) => { setQuantity(parseInt(e.currentTarget.value || "1", 10)); updatePreview(); }}
                    />
                </div>
                <div class="flex-1">
                    <label class="label"><span class="label-text text-xs">{t("settings.bucketAutoUpdate.unit")}</span></label>
                    <select
                        class="select select-sm select-bordered w-full"
                        value={unit()}
                        disabled={props.disabled}
                        onChange={(e) => { setUnit(e.currentTarget.value); updatePreview(); }}
                    >
                        <option value="minutes">{t("settings.bucketAutoUpdate.minutes")}</option>
                        <option value="hours">{t("settings.bucketAutoUpdate.hours")}</option>
                        <option value="days">{t("settings.bucketAutoUpdate.days")}</option>
                        <option value="weeks">{t("settings.bucketAutoUpdate.weeks")}</option>
                    </select>
                </div>
                <button
                    type="button"
                    class="btn btn-sm btn-outline"
                    disabled={props.disabled || saving() || !!error()}
                    onClick={handlePersist}
                >
                    {saving() ? t("settings.bucketAutoUpdate.saving") : justSaved() ? t("settings.bucketAutoUpdate.saved") : t("settings.bucketAutoUpdate.save")}
                </button>
            </div>
            <div class="text-[11px] opacity-70">{preview()}</div>
            <Show when={!!error()}>
                <div class="text-error text-[11px]">{error()}</div>
            </Show>
            {/* Removed bottom Active badge per user request */}
        </div>
    );
}

function ActiveIntervalDisplay(props: { value: string }) {
    const human = () => formatIntervalDisplay(props.value);
    return (
        <div class="text-xs font-medium px-2 py-1 rounded bg-base-300 border border-base-content/10">
            {t("settings.bucketAutoUpdate.active", { interval: human() })}
        </div>
    );
}

function formatIntervalDisplay(raw: string): string {
    if (!raw || raw === 'off') return t("settings.bucketAutoUpdate.off");
    if (raw === '24h' || raw === '1d') return t("settings.bucketAutoUpdate.every24HoursDisplay");
    if (raw === '7d' || raw === '1w') return t("settings.bucketAutoUpdate.everyWeekDisplay");
    if (raw === '1h') return t("settings.bucketAutoUpdate.oneHourDisplay");
    if (raw === '6h') return t("settings.bucketAutoUpdate.sixHoursDisplay");
    if (raw.startsWith('custom:')) {
        const secsStr = raw.substring(7);
        const secs = parseInt(secsStr, 10);
        if (!Number.isFinite(secs) || secs <= 0) return t("settings.bucketAutoUpdate.customInterval");
        const week = 604800, day = 86400, hour = 3600, minute = 60;
        if (secs % week === 0) {
            const count = secs / week;
            return count === 1 
                ? t("settings.bucketAutoUpdate.weekDisplay", { count })
                : t("settings.bucketAutoUpdate.weeksFormat", { count });
        }
        if (secs % day === 0) {
            const count = secs / day;
            return count === 1 
                ? t("settings.bucketAutoUpdate.dayDisplay", { count })
                : t("settings.bucketAutoUpdate.daysFormat", { count });
        }
        if (secs % hour === 0) {
            const count = secs / hour;
            return count === 1 
                ? t("settings.bucketAutoUpdate.hourDisplay", { count })
                : t("settings.bucketAutoUpdate.hoursFormat", { count });
        }
        if (secs % minute === 0) {
            const count = secs / minute;
            return count === 1 
                ? t("settings.bucketAutoUpdate.minuteDisplay", { count })
                : t("settings.bucketAutoUpdate.minutesFormat", { count });
        }
        return t("settings.bucketAutoUpdate.secondsDisplay", { count: secs });
    }
    // Raw seconds fallback
    if (/^\d+$/.test(raw)) {
        const secs = parseInt(raw, 10);
        const week = 604800, day = 86400, hour = 3600, minute = 60;
        if (secs % week === 0) {
            const count = secs / week;
            return count === 1 
                ? t("settings.bucketAutoUpdate.weekDisplay", { count })
                : t("settings.bucketAutoUpdate.weeksFormat", { count });
        }
        if (secs % day === 0) {
            const count = secs / day;
            return count === 1 
                ? t("settings.bucketAutoUpdate.dayDisplay", { count })
                : t("settings.bucketAutoUpdate.daysFormat", { count });
        }
        if (secs % hour === 0) {
            const count = secs / hour;
            return count === 1 
                ? t("settings.bucketAutoUpdate.hourDisplay", { count })
                : t("settings.bucketAutoUpdate.hoursFormat", { count });
        }
        if (secs % minute === 0) {
            const count = secs / minute;
            return count === 1 
                ? t("settings.bucketAutoUpdate.minuteDisplay", { count })
                : t("settings.bucketAutoUpdate.minutesFormat", { count });
        }
        return t("settings.bucketAutoUpdate.secondsDisplay", { count: secs });
    }
    return raw; // Unknown format, display raw
}