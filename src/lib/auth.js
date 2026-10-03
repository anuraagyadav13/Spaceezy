// src/lib/auth.js
export const ROLES = { OWNER: "owner", EMPLOYEE: "employee" };

const ROLE_KEY = "se_role";
const EMPLOYEE_KEY = "se_employee_id";

export function clearAuthCache() {
    if (typeof window === "undefined") return;
    window.localStorage.removeItem(ROLE_KEY);
    window.localStorage.removeItem(EMPLOYEE_KEY);
}

/* ---------- helpers ---------- */
export function getRole() {
    return null;
}

export function getCurrentEmployeeId() {
    return null;
}

/* ---------- setters ---------- */
export function loginAsOwner() {
    clearAuthCache();
}

export function loginAsEmployee(employeeId) {
    clearAuthCache();
}

/* ---------- logout ---------- */
export function logout() {
    clearAuthCache();
}
