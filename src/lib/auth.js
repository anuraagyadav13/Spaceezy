// src/lib/auth.js
// Frontend-only session handling. Replace with real auth (NextAuth, JWT,
// etc.) later — every page only calls these getters/setters, so swapping
// the implementation won't require touching the UI.

export const ROLES = { OWNER: "owner", EMPLOYEE: "employee" };

const ROLE_KEY = "se_role";
const EMPLOYEE_KEY = "se_employee_id";

export function getRole() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ROLE_KEY);
}

export function getCurrentEmployeeId() {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(EMPLOYEE_KEY);
}

export function loginAsOwner() {
    window.localStorage.setItem(ROLE_KEY, ROLES.OWNER);
    window.localStorage.removeItem(EMPLOYEE_KEY);
}

export function loginAsEmployee(employeeId) {
    window.localStorage.setItem(ROLE_KEY, ROLES.EMPLOYEE);
    window.localStorage.setItem(EMPLOYEE_KEY, employeeId);
}

export function logout() {
    window.localStorage.removeItem(ROLE_KEY);
    window.localStorage.removeItem(EMPLOYEE_KEY);
}