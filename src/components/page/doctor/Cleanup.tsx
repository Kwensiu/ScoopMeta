import { Trash2, Archive, BrushCleaning } from "lucide-solid";
import Card from "../../common/Card";
import { t } from "../../../i18n";

interface CleanupProps {
    onCleanupApps: () => void;
    onCleanupCache: () => void;
}

function Cleanup(props: CleanupProps) {
    return (
        <Card
            title={t('doctor.cleanup.title')}
            icon={BrushCleaning}
            description={t('doctor.cleanup.description')}
        >
            <div class="flex gap-2 mt-2">
                <button class="btn btn-primary" onClick={props.onCleanupApps}>
                    <Trash2 class="w-4 h-4 mr-2" />
                    {t('doctor.cleanup.cleanupOldVersions')}
                </button>
                <button class="btn btn-secondary" onClick={props.onCleanupCache}>
                    <Archive class="w-4 h-4 mr-2" />
                    {t('doctor.cleanup.cleanupOutdatedCache')}
                </button>
            </div>
        </Card>
    );
}

export default Cleanup;