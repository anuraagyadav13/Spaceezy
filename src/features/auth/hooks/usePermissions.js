import { useAuth } from "./useAuth";

const ROLE_PERMISSIONS = {
    SUPER_ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:delete", "lead:assign",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create", "booking:approve",
        "commission:view", "commission:approve"
    ],
    ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:assign",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create",
        "commission:view"
    ],
    SALES_MANAGER: [
        "lead:view", "lead:create", "lead:update", "lead:assign",
        "inventory:view",
        "booking:view", "booking:create",
        "commission:view"
    ],
    SALES_EXECUTIVE: [
        "lead:view", "lead:create", "lead:update",
        "inventory:view",
        "booking:view", "booking:create"
    ],
    CHANNEL_PARTNER: [
        "lead:view", "lead:create",
        "inventory:view",
        "commission:view"
    ]
};

export const usePermissions = () => {
    const { user } = useAuth();

    const hasRole = (roles) => {
        if (!user || !user.role) return false;
        if (Array.isArray(roles)) {
            return roles.includes(user.role);
        }
        return user.role === roles;
    };

    const hasPermission = (permission) => {
        if (!user || !user.role) return false;
        const permissions = ROLE_PERMISSIONS[user.role] || [];
        return permissions.includes(permission);
    };

    return { hasRole, hasPermission };
};
