"use client";
import Modal from "../../../../components/shared/Modal";
import ImportLeadsPage from "../../../../app/dashboard/leads/import/page";

export default function ImportLeadsModal({ isOpen, onClose }) {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Import Leads" maxWidth="max-w-3xl">
            <ImportLeadsPage />
        </Modal>
    );
}
