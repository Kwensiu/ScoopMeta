import { createRoot } from "solid-js";
import { createStore } from "solid-js/store";
import { Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { View } from "../types/scoop";

const STORE_NAME = 'settings.dat';

interface Settings {
  virustotal: {
    enabled: boolean;
    autoScanOnInstall: boolean;
    apiKey?: string;
  };
  window: {
    closeToTray: boolean;
    firstTrayNotificationShown: boolean;
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
}

const defaultSettings: Settings = {
  virustotal: {
    enabled: false,
    autoScanOnInstall: false,
  },
  window: {
    closeToTray: false,
    firstTrayNotificationShown: true,
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
};

function createSettingsStore() {
  let store: Store | null = null;
  let storeInitialized = false;

  // Initialize the Tauri store
  const initStore = async () => {
    if (storeInitialized) return store;
    
    store = await Store.load(STORE_NAME);
    // Store is loaded in the app's data directory
    console.log('Tauri store for settings loaded successfully');
    storeInitialized = true;
    
    // First-time setup: migrate from localStorage if exists
    try {
      const localStorageData = localStorage.getItem('rscoop-settings');
      if (localStorageData) {
        // Migrate data from localStorage to Tauri store
        const settingsData = JSON.parse(localStorageData);
        await store!.set('settings', settingsData);
        localStorage.removeItem('rscoop-settings'); // Clean up localStorage after migration
      }
    } catch (error) {
      console.error('Error migrating settings from localStorage:', error);
    }
    
    return store;
  };

  const getInitialSettings = async (): Promise<Settings> => {
    const storeInstance = await initStore();
    
    // Check for factory reset marker
    const needsFactoryReset = await checkFactoryReset();
    
    if (needsFactoryReset) {
      console.log('Factory reset detected, loading default settings');
      // Clear any existing settings and return defaults
      if (storeInstance) {
        try {
          await storeInstance.delete('settings');
        } catch (error) {
          console.error('Error clearing settings during factory reset:', error);
        }
      }
      return defaultSettings;
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
          };
        }
      } catch (error) {
        console.error('Error loading settings from store:', error);
      }
    }
    return defaultSettings;
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
          const storeInstance = await initStore();
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

  return { settings, setVirusTotalSettings, setWindowSettings, setDebugSettings, setCleanupSettings, setBucketSettings, setUpdateSettings, setTheme, setDefaultLaunchPage, setUISettings };
}

export default createRoot(createSettingsStore);