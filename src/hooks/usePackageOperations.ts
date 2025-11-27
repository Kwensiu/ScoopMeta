import { createSignal } from "solid-js";
import { invoke } from "@tauri-apps/api/core";
import { ScoopPackage } from "../types/scoop";
import { OperationNextStep } from "../types/operations";
import installedPackagesStore from "../stores/installedPackagesStore";

interface UsePackageOperationsReturn {
  operationTitle: () => string | null;
  setOperationTitle: (title: string | null) => void;
  operationNextStep: () => OperationNextStep | null;
  isScanning: () => boolean;
  pendingInstallPackage: () => ScoopPackage | null;
  handleInstall: (pkg: ScoopPackage) => void;
  handleInstallConfirm: () => void;
  handleUninstall: (pkg: ScoopPackage) => void;
  handleUpdate: (pkg: ScoopPackage) => void;
  handleForceUpdate: (pkg: ScoopPackage) => void;
  handleUpdateAll: () => void;
  closeOperationModal: (wasSuccess: boolean) => void;
  addCloseListener: (handler: (wasSuccess: boolean) => void) => () => void;
}

const [operationTitle, setOperationTitle] = createSignal<string | null>(null);
const [operationNextStep, setOperationNextStep] = createSignal<OperationNextStep | null>(null);
const [isScanning, setIsScanning] = createSignal(false);
const [pendingInstallPackage, setPendingInstallPackage] = createSignal<ScoopPackage | null>(null);
const closeHandlers = new Set<(wasSuccess: boolean) => void>();

const addCloseListener = (handler: (wasSuccess: boolean) => void) => {
    closeHandlers.add(handler);
    return () => {
        closeHandlers.delete(handler);
    };
};

const performInstall = (pkg: ScoopPackage) => {
    setOperationTitle(`Installing ${pkg.name}`);
    setIsScanning(false);
    invoke("install_package", {
        packageName: pkg.name,
        bucket: pkg.source,
    }).catch((err) => {
        console.error(`Installation invocation failed for ${pkg.name}:`, err);
        setOperationNextStep(null);
    });
};

const handleInstall = (pkg: ScoopPackage) => {
    if (installedPackagesStore.packages().some(p => p.name === pkg.name)) {
        setOperationNextStep({
            buttonLabel: "OK",
            onNext: () => setOperationNextStep(null),
        } as OperationNextStep);
        return;
    }
    
    performInstall(pkg);
};

const handleInstallConfirm = () => {
    const pkg = pendingInstallPackage();
    if (pkg) {
        performInstall(pkg);
        setPendingInstallPackage(null);
    }
};

const handleUninstall = (pkg: ScoopPackage) => {
    setOperationTitle(`Uninstalling ${pkg.name}`);
    
    invoke("uninstall_package", {
        packageName: pkg.name,
        bucket: pkg.source,
    }).catch((err) => {
        console.error(`Uninstallation invocation failed for ${pkg.name}:`, err);
        setOperationNextStep(null);
    });
};

const handleUpdate = (pkg: ScoopPackage) => {
    setOperationTitle(`Updating ${pkg.name}`);
    invoke("update_package", { packageName: pkg.name }).catch(err => {
        console.error("Update invocation failed:", err);
    });
};

const handleForceUpdate = (pkg: ScoopPackage) => {
    setOperationTitle(`Force Updating ${pkg.name}`);
    invoke("update_package", { packageName: pkg.name, force: true }).catch(err => {
        console.error("Force update invocation failed:", err);
    });
};

const handleUpdateAll = () => {
    setOperationTitle("Updating all packages");
    return invoke("update_all_packages").catch(err => {
        console.error("Update all invocation failed:", err);
    });
};

const closeOperationModal = (wasSuccess: boolean) => {
    setOperationTitle(null);
    setOperationNextStep(null);
    setIsScanning(false);
    
    if (wasSuccess) {
        installedPackagesStore.fetch();
    }

    closeHandlers.forEach((handler) => handler(wasSuccess));
};

export function usePackageOperations(): UsePackageOperationsReturn {
    return {
        operationTitle,
        setOperationTitle,
        operationNextStep,
        isScanning,
        pendingInstallPackage,
        handleInstall,
        handleInstallConfirm,
        handleUninstall,
        handleUpdate,
        handleForceUpdate,
        handleUpdateAll,
        closeOperationModal,
        addCloseListener,
    };
}