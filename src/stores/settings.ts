import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { View } from "../types/scoop";

/// Current store file name for frontend settings
const STORE_NAME = 'settings.json';

/// Global store instance for frontend settings (shared with signals)
let globalStore: Store | null = null;
let storeInitialized = false;

/// Get or initialize the shared store instance
export async function getSettingsStore(): Promise<Store> {
  if (!globalStore) {
    globalStore = await Store.load(STORE_NAME);
    console.log('Tauri store for frontend settings loaded successfully');
  }
  return globalStore;
}

interface Settings {
  virustotal: {
    enabled: boolean;
    autoScanOnInstall: boolean;
    apiKey?: string;
  };
  window: {
    closeToTray: boolean;
    firstTrayNotificationShown: boolean;
    silentStartup: boolean;
    trayAppsEnabled: boolean;
  };
  theme: 'dark' | 'light';
  debug: {
    enabled: boolean;
  };
  cleanup: {
    autoCleanupEnabled: boolean;
    cleanupOldVersions: boolean;
    cleanupCache: boolean;
    preserveVersionCount: number;
  };
  buckets: {
    autoUpdateInterval: string; // "off" | "1h" | "6h" | "24h"
    autoUpdatePackagesEnabled: boolean;
    silentUpdateEnabled: boolean;
    updateHistoryEnabled: boolean;
  };
  update: {
    channel: 'stable' | 'test';
  };
  defaultLaunchPage: View;
  ui: {
    showGlobalUpdateButton: boolean;
  };
  scoopPath?: string;
  language: string;
  trayAppsList: string[];
}

const defaultSettings: Settings = {
  virustotal: {
    enabled: false,
    autoScanOnInstall: false,
  },
  window: {
    closeToTray: false,
    firstTrayNotificationShown: true,
    silentStartup: false,
    trayAppsEnabled: true,
  },
  theme: 'dark',
  debug: {
    enabled: false,
  },
  cleanup: {
    autoCleanupEnabled: false,
    cleanupOldVersions: true,
    cleanupCache: true,
    preserveVersionCount: 3,
  },
  buckets: {
    autoUpdateInterval: "off",
    autoUpdatePackagesEnabled: false,
    silentUpdateEnabled: false,
    updateHistoryEnabled: true, // 默认启用
  },
  update: {
    channel: "stable",
  },
  defaultLaunchPage: "installed",
  ui: {
    showGlobalUpdateButton: true,
  },
  language: "en",
  trayAppsList: [],
};

function createSettingsStore() {
  // Initialize the Tauri store
  const initStore = async () => {
    if (storeInitialized) return globalStore;
    
    globalStore = await getSettingsStore();
    storeInitialized = true;
    
    // First-time setup: migrate from localStorage if exists
    try {
      const localStorageData = localStorage.getItem('pailer-settings');
      if (localStorageData) {
        // Migrate data from localStorage to Tauri store
        const settingsData = JSON.parse(localStorageData);
        await globalStore!.set('settings', settingsData);
        localStorage.removeItem('pailer-settings'); // Clean up localStorage after migration
      }
    } catch (error) {
      console.error('Error migrating settings from localStorage:', error);
    }
    
    return globalStore;
  };

  // Supported locales list for extensibility
  const supportedLocales = ['en', 'zh'];

  const detectSystemLanguage = (): string => {
    if (typeof navigator !== 'undefined') {
      const lang = (navigator.language || navigator.languages?.[0] || 'en').split('-')[0];
      return supportedLocales.includes(lang) ? lang : 'en';
    }
    return 'en';
  };

  // Dynamic defaults for first launch detection
  const getFirstLaunchDefaults = (): Partial<Settings> => ({
    language: detectSystemLanguage(),
  });

  const getInitialSettings = async (): Promise<Settings> => {
    const storeInstance = await initStore();
    
    // Check for factory reset marker
    const needsFactoryReset = await checkFactoryReset();
    
    if (needsFactoryReset) {
      // Clear any existing settings and return defaults
      if (storeInstance) {
        try {
          await storeInstance.delete('settings');
        } catch (error) {
          console.error('Error clearing settings during factory reset:', error);
        }
      }
      return { ...defaultSettings, ...getFirstLaunchDefaults() };
    }
    
    if (storeInstance) {
      try {
        const stored = await storeInstance.get<Settings>('settings');
        if (stored) {
          // Deep merge stored settings with defaults to handle new/missing keys
          return {
            ...defaultSettings,
            virustotal: {
              ...defaultSettings.virustotal,
              ...stored.virustotal,
            },
            window: {
              ...defaultSettings.window,
              ...stored.window,
              silentStartup: stored.window?.silentStartup ?? defaultSettings.window.silentStartup,
              trayAppsEnabled: stored.window?.trayAppsEnabled ?? defaultSettings.window.trayAppsEnabled,
            },
            theme: stored.theme || defaultSettings.theme,
            debug: {
              ...defaultSettings.debug,
              ...stored.debug,
            },
            cleanup: {
              ...defaultSettings.cleanup,
              ...stored.cleanup,
            },
            buckets: {
              ...defaultSettings.buckets,
              ...stored.buckets,
              silentUpdateEnabled: stored.buckets?.silentUpdateEnabled ?? defaultSettings.buckets.silentUpdateEnabled,
            },
            update: {
              ...defaultSettings.update,
              ...stored.update,
            },
            defaultLaunchPage: stored.defaultLaunchPage || defaultSettings.defaultLaunchPage,
            ui: {
              ...defaultSettings.ui,
              ...stored.ui,
            },
            scoopPath: stored.scoopPath,
            language: stored.language || (() => { console.log('No stored language, detecting system language'); return detectSystemLanguage(); })(),
            trayAppsList: stored.trayAppsList || defaultSettings.trayAppsList,
          };
        }
      } catch (error) {
        console.error('Error loading settings from store:', error);
      }
    }
    // First launch: no stored settings
    console.log('First launch detected, using dynamic defaults');
    return { ...defaultSettings, ...getFirstLaunchDefaults() };
  };

  const checkFactoryReset = async (): Promise<boolean> => {
    try {
      // Check if factory reset marker exists using a Tauri command
      const markerExists = await invoke<boolean>('check_factory_reset_marker');
      return markerExists;
    } catch (error) {
      console.error('Error checking factory reset marker:', error);
      return false;
    }
  };

  const [settings, setSettings] = createStore<Settings>(defaultSettings);

  // Initialize settings from store on startup
  (async () => {
    const initialSettings = await getInitialSettings();
    setSettings(initialSettings);
  })();

  const saveSettings = async (newSettings: Partial<Settings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...newSettings };
      
      // Save to Tauri store
      (async () => {
        try {
          const storeInstance = await getSettingsStore();
          if (storeInstance) {
            await storeInstance.set('settings', updated);
          }
        } catch (error) {
          console.error('Error saving settings to store:', error);
        }
      })();
      
      return updated;
    });
  };

  const setVirusTotalSettings = async (newVtSettings: Partial<Settings['virustotal']>) => {
    await saveSettings({
      virustotal: {
        ...settings.virustotal,
        ...newVtSettings,
      },
    });
  };

  const setWindowSettings = async (newWindowSettings: Partial<Settings['window']>) => {
    await saveSettings({
      window: {
        ...settings.window,
        ...newWindowSettings,
      },
    });
  };

  const setTheme = (theme: 'dark' | 'light') => {
    saveSettings({ theme });
  };

  const setDebugSettings = async (newDebugSettings: Partial<Settings['debug']>) => {
    await saveSettings({
      debug: {
        ...settings.debug,
        ...newDebugSettings,
      },
    });
  };

  const setCleanupSettings = async (newCleanupSettings: Partial<Settings['cleanup']>) => {
    await saveSettings({
      cleanup: {
        ...settings.cleanup,
        ...newCleanupSettings,
      },
    });
  };

  const setBucketSettings = async (newBucketSettings: Partial<Settings['buckets']>) => {
    await saveSettings({
      buckets: {
        ...settings.buckets,
        ...newBucketSettings,
      },
    });
  };

  const setUpdateSettings = async (newUpdateSettings: Partial<Settings['update']>) => {
    await saveSettings({
      update: {
        ...settings.update,
        ...newUpdateSettings,
      },
    });
  };

  const setDefaultLaunchPage = async (page: View) => {
    await saveSettings({ defaultLaunchPage: page });
  };

  const setUISettings = async (newUISettings: Partial<Settings['ui']>) => {
    await saveSettings({
      ui: {
        ...settings.ui,
        ...newUISettings,
      },
    });
  };

  const setCoreSettings = async (newCoreSettings: Partial<Settings>) => {
    await saveSettings(newCoreSettings);
  };

  return { settings, setVirusTotalSettings, setWindowSettings, setDebugSettings, setCleanupSettings, setBucketSettings, setUpdateSettings, setTheme, setDefaultLaunchPage, setUISettings, setCoreSettings };
}

export default createRoot(createSettingsStore);