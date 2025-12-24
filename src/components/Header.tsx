import { Component, For } from "solid-js";
import { View } from "../types/scoop.ts";
import { Package, Search, Settings, Stethoscope, FolderOpen } from "lucide-solid";
import installedPackagesStore from '../stores/installedPackagesStore';
import { t } from "../i18n";
import LanguageSelector from "./LanguageSelector";

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; labelKey: string; icon: typeof Search }[] = [
    { view: "search", labelKey: "app.search", icon: Search },
    { view: "bucket", labelKey: "app.buckets", icon: FolderOpen },
    { view: "installed", labelKey: "app.packages", icon: Package },
    { view: "doctor", labelKey: "app.doctor", icon: Stethoscope },
    { view: "settings", labelKey: "app.settings", icon: Settings },
  ];

  const toggleCommandPalette = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      // The command palette component handles its own visibility
    }
  };

  document.addEventListener("keydown", toggleCommandPalette);

  return (
    <div class="navbar bg-base-400 border-b border-base-300 shadow-sm overflow-x-hidden overflow-y-hidden">
      <div class="flex-1">
        <a class="btn btn-ghost text-xl font-bold">{t('app.title')}</a>
      </div>
      <div class="flex-none">
        <ul class="menu menu-horizontal gap-1">
          <For each={navItems} fallback={<div>{t('status.loading')}</div>}>
            {(item) => (
              <li>
                <button
                  class="btn btn-sm btn-ghost transition-colors duration-200"
                  classList={{
                    "bg-base-300 text-info font-semibold": props.currentView === item.view,
                    "hover:bg-base-300/50": props.currentView !== item.view,
                  }}
                  onClick={() => props.onNavigate(item.view)}
                  onMouseEnter={() => {
                    if (item.view === 'installed') {
                      installedPackagesStore.fetch();
                    }
                  }}
                >
                  <div class="flex items-center justify-center">
                    <item.icon class="w-4 h-4" />
                    <span class="nav-text">{t(item.labelKey)}</span>
                  </div>
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
      <div class="flex-none">
        <LanguageSelector />
      </div>
    </div>
  );
};

export default Header;