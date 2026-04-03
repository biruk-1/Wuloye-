import apiClient from "./client";

export async function getRoutines() {
    const { data } = await apiClient.get("/routines");
    return data;
}

export async function createRoutine(payload) {
    const { data } = await apiClient.post("/routines", payload);
    return data;
}

export async function deleteRoutine(routineId) {
    const { data } = await apiClient.delete(`/routines/${routineId}`);
    return data;
}
