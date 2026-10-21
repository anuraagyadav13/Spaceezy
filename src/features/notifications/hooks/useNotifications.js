import { useQuery } from "@tanstack/react-query";
import { fetchNotifications } from "../../../lib/api/notifications";

// Recent notifications for the current user. Polls so the bell badge and
// dropdown stay fresh without a websocket.
export const useNotifications = (limit = 15) => {
    return useQuery({
        queryKey: ["notifications", limit],
        queryFn: () => fetchNotifications({ limit }),
        refetchInterval: 30000,
        refetchOnWindowFocus: true,
    });
};
