import { Component, For } from "solid-js";
import { View } from "../types/scoop.ts";
import { Package, Search, Settings, Stethoscope, FolderOpen } from "lucide-solid";
import installedPackagesStore from '../stores/installedPackagesStore';

interface HeaderProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const Header: Component<HeaderProps> = (props) => {
  const navItems: { view: View; label: string; icon: typeof Search }[] = [
    { view: "search", label: "Search", icon: Search },
    { view: "bucket", label: "Buckets", icon: FolderOpen },
    { view: "installed", label: "Packages", icon: Package },
    { view: "doctor", label: "Doctor", icon: Stethoscope },
    { view: "settings", label: "Settings", icon: Settings },
  ];

  const toggleCommandPalette = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      // The command palette component handles its own visibility
    }
  };

  document.addEventListener("keydown", toggleCommandPalette);

  return (
    <div class="navbar bg-base-200 overflow-x-hidden">
      <div class="flex-1">
        <a class="btn btn-ghost text-xl font-bold">Rscoop</a>
      </div>
      <div class="flex-none">
        <ul class="menu menu-horizontal px-1">
          <For each={navItems} fallback={<div>Loading...</div>}>
            {(item) => (
              <li>
                <button
                  class="btn btn-sm btn-ghost transition-colors duration-200"
                  classList={{
                    "btn-active": props.currentView === item.view,
                    "bg-base-300": props.currentView === item.view,
                  }}
                  onClick={() => props.onNavigate(item.view)}
                  onMouseEnter={() => {
                    if (item.view === 'installed') {
                      installedPackagesStore.fetch();
                    }
                  }}
                >
                  <item.icon class="w-4 h-4" />
                  <span class="nav-text">{item.label}</span>
                </button>
              </li>
            )}
          </For>
        </ul>
      </div>
    </div>
  );
};

export default Header;