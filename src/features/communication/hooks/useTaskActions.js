import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateTaskStatus, rescheduleTask, createTask, toggleTaskStatus, deleteTask } from "../../../lib/api/tasks";
import { invalidateComm } from "./useCommunication";

export const useUpdateTaskStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: updateTaskStatus,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useRescheduleTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: rescheduleTask,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useCreateTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: createTask,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useToggleTaskStatus = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: toggleTaskStatus,
        onSettled: () => invalidateComm(queryClient)
    });
};

export const useDeleteTask = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: deleteTask,
        onSettled: () => invalidateComm(queryClient)
    });
};
