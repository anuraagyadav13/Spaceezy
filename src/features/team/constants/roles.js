// The five roles shown on Dashboard → Admin → Roles & Permissions.
// Shared by Add Employee (TeamMemberForm) and the employee profile editor so
// the two dropdowns can never drift from the documented matrix again.
//
// SUPER_ADMIN is guarded server-side: only a Super Admin requester may create
// or elevate to it (userService), so the option is disabled for everyone else.
export const ROLE_OPTIONS = [
    { value: "SUPER_ADMIN", label: "Super Admin (platform)" },
    { value: "ADMIN", label: "Owner Admin (owner)" },
    { value: "SALES_MANAGER", label: "Sales Manager" },
    { value: "SALES_EXECUTIVE", label: "Sales Executive (employee)" },
    { value: "CHANNEL_PARTNER", label: "Channel Partner" },
];

export const isSuperAdminAssignable = (userRole) =>
    String(userRole ?? "").toUpperCase() === "SUPER_ADMIN";
