import { useAuth } from "./useAuth";

const ROLE_PERMISSIONS = {
    SUPER_ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:delete", "lead:assign",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create", "booking:approve",
        "commission:view", "commission:approve",
        "task:view", "task:create", "task:update", "task:delete",
        "quotation:view", "quotation:create", "quotation:update"
    ],
    ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:assign",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create",
        "commission:view",
        "task:view", "task:create", "task:update", "task:delete",
        "quotation:view", "quotation:create", "quotation:update"
    ],
    SALES_MANAGER: [
        "lead:view", "lead:create", "lead:update", "lead:assign",
        "inventory:view",
        "booking:view", "booking:create",
        "commission:view",
        "task:view", "task:create", "task:update",
        "quotation:view", "quotation:create", "quotation:update"
    ],
    SALES_EXECUTIVE: [
        "lead:view", "lead:create", "lead:update",
        "inventory:view",
        "booking:view", "booking:create",
        "task:view", "task:create", "task:update",
        "quotation:view", "quotation:create", "quotation:update"
    ],
    CHANNEL_PARTNER: [
        "lead:view", "lead:create",
        "inventory:view",
        "commission:view",
        "task:view",
        "quotation:view"
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
