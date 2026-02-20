import Modal from "./common/Modal";
import { t } from "../i18n";

interface ConfirmationModalProps {
    isOpen: boolean;
    title: string;
    onConfirm: () => void;
    onCancel: () => void;
    confirmText?: string;
    cancelText?: string;
    children: any;
}

function ConfirmationModal(props: ConfirmationModalProps) {
    return (
        <Modal
            isOpen={props.isOpen}
            onClose={props.onCancel}
            title={props.title}
            size="medium"
            footer={
                <>
                    <button class="btn-close-outline" onClick={props.onCancel}>
                        {props.cancelText || t('buttons.cancel')}
                    </button>
                    <button class="btn btn-error" onClick={props.onConfirm}>
                        {props.confirmText || t('buttons.confirm')}
                    </button>
                </>
            }
        >
            <div class="py-4 space-y-2">
                {props.children}
            </div>
        </Modal>
    );
}

export default ConfirmationModal;