"use client";
import { usePermissions } from "../hooks/usePermissions";

export const PermissionGate = ({ permission, children, fallback = null }) => {
    const { hasPermission } = usePermissions();
    
    if (hasPermission(permission)) {
        return children;
    }
    
    return fallback;
};
