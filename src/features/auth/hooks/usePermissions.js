import { useAuth } from "./useAuth";

// Mirrors backend requirePermission() role matrix in src/middleware/auth.js
const ROLE_PERMISSIONS = {
    SUPER_ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:delete", "lead:assign", "lead:merge",
        "employee:view", "employee:create", "employee:update", "employee:delete",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create", "booking:update", "booking:approve",
        "payment:view", "payment:create",
        "commission:view", "commission:approve",
        "site_visit:view", "site_visit:create", "site_visit:update", "site_visit:delete",
        "customer:view", "customer:create", "customer:update", "customer:delete",
        "task:view", "task:create", "task:update", "task:delete",
        "project:view", "project:create", "project:update", "project:delete",
        "quotation:view", "quotation:create", "quotation:update",
        "call:view", "call:create", "call:update",
        "whatsapp:view", "whatsapp:create", "whatsapp:manage",
        "recording:view", "pii:view"
    ],
    ADMIN: [
        "lead:view", "lead:create", "lead:update", "lead:assign", "lead:merge",
        "employee:view", "employee:update",
        "inventory:view", "inventory:create", "inventory:update",
        "booking:view", "booking:create", "booking:update",
        "payment:view",
        "commission:view",
        "site_visit:view", "site_visit:create", "site_visit:update", "site_visit:delete",
        "customer:view", "customer:create", "customer:update",
        "task:view", "task:create", "task:update", "task:delete",
        "project:view", "project:create", "project:update",
        "quotation:view", "quotation:create", "quotation:update",
        "call:view", "call:create", "call:update",
        "whatsapp:view", "whatsapp:create", "whatsapp:manage",
        "recording:view", "pii:view"
    ],
    SALES_MANAGER: [
        "lead:view", "lead:create", "lead:update", "lead:assign", "lead:merge",
        "booking:view", "booking:create", "booking:update",
        "inventory:view",
        "site_visit:view", "site_visit:create", "site_visit:update",
        "customer:view", "customer:create", "customer:update",
        "task:view", "task:create", "task:update", "task:delete",
        "project:view",
        "employee:view",
        "quotation:view", "quotation:create", "quotation:update",
        "call:view", "call:create", "call:update",
        "whatsapp:view", "whatsapp:create", "whatsapp:manage",
        "recording:view"
    ],
    SALES_EXECUTIVE: [
        "lead:view", "lead:create", "lead:update",
        "booking:view", "booking:create",
        "inventory:view",
        "site_visit:view", "site_visit:create", "site_visit:update",
        "customer:view", "customer:create", "customer:update",
        "task:view", "task:create", "task:update",
        "project:view",
        "quotation:view", "quotation:create", "quotation:update",
        "call:view", "call:create", "call:update",
        "whatsapp:view", "whatsapp:create"
    ],
    CHANNEL_PARTNER: [
        "lead:view", "lead:create",
        "site_visit:view",
        "task:view",
        "project:view",
        "inventory:view",
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
