import { createSignal, createResource, createEffect, createRoot } from 'solid-js';
import * as i18n from '@solid-primitives/i18n';
import { invoke } from '@tauri-apps/api/core';
import settingsStore from './stores/settings';
import { Dict } from './types/dict-types';

export type Locale = string;

// Supported locales list for extensibility
const supportedLocales = ['en', 'zh'];

// Create a resource to load the dictionary for the current locale
const getInitialLocale = (): Locale => {
  // Try to get language from settings store first, fallback to localStorage
  try {
    const settings = settingsStore.settings;
    if (settings.language && (settings.language === 'en' || settings.language === 'zh')) {
      return settings.language;
    }
  } catch (error) {
    console.warn('Failed to get language from settings store:', error);
  }
  
  // Check if a locale is saved in localStorage (legacy fallback)
  const savedLocale = localStorage.getItem('pailer-language');
  if (savedLocale && supportedLocales.includes(savedLocale)) {
    return savedLocale as Locale;
  }
  
  // If no saved locale, detect system language
  const systemLang = (navigator.language || navigator.languages?.[0] || 'en').split('-')[0];
  if (supportedLocales.includes(systemLang)) {
    return systemLang;
  }
  return supportedLocales[0];
};

// Wrap reactive elements in createRoot to prevent memory leak warnings
const { locale, setLocale, dict, t } = createRoot(() => {
  const [locale, setLocale] = createSignal<Locale>(getInitialLocale());

  // Save current locale to settings store when it changes
  createEffect(async () => {
    const currentLocale = locale();
    const previousLocale = settingsStore.settings.language || 'en';
    
    // Only sync if locale actually changed
    if (currentLocale !== previousLocale) {
      try {
        // Also save to localStorage as backup
        localStorage.setItem('pailer-language', currentLocale);
      } catch (error) {
        console.warn('Failed to save language to localStorage:', error);
      }
    }
  });

  // Sync locale with settings store language
  createEffect(() => {
    const settingsLang = settingsStore.settings.language;
    if (settingsLang && settingsLang !== locale()) {
      setLocale(settingsLang as Locale);
    }
  });

  // Create a resource to load the dictionary for the current locale
  const [dict] = createResource(locale, async (lang) => {
    try {
      const localeModule = await import(`./locales/${lang}.json`);
      return i18n.flatten(localeModule.default as Record<string, any>) as Dict;
    } catch (error) {
      console.warn(`Failed to load locale ${lang}, falling back to en:`, error);
      const enModule = await import('./locales/en.json');
      return i18n.flatten(enModule.default as Record<string, any>) as Dict;
    }
  }, {
    initialValue: i18n.flatten({
      'app.title': 'Pailer',
      'messages.loading': 'Loading...',
      'status.error': 'Error',
      'buttons.close': 'Close'
    } as Record<string, any>) as Dict,
  });

  const t = i18n.translator(dict, i18n.resolveTemplate);

  return { locale, setLocale, dict, t };
});

export { locale, setLocale, dict, t };

const updateLanguage = async (newLang: Locale) => {
  setLocale(newLang);

  // Update backend store to trigger tray menu refresh
  try {
    await invoke('set_language_setting', { language: newLang });
  } catch (error) {
    console.error('Failed to update backend language setting:', error);
  }

  await settingsStore.setCoreSettings({ language: newLang });

  localStorage.setItem('pailer-language', newLang);
};

export const toggleLanguage = async () => {
  const newLocale = locale() === 'zh' ? 'en' : 'zh';
  await updateLanguage(newLocale);
};

export const setLanguage = async (lang: Locale) => {
  await updateLanguage(lang);
};