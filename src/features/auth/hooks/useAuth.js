import { useAuthContext } from "../providers/AuthProvider";

export const useAuth = () => {
    const context = useAuthContext();
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
