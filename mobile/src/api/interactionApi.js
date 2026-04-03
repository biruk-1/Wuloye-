import apiClient from "./client";

export async function createInteraction(payload) {
    const { data } = await apiClient.post("/interactions", payload);
    return data;
}

export async function createInteractionsBatch(interactions) {
    const list = Array.isArray(interactions) ? interactions : [];

    try {
        const { data } = await apiClient.post("/interactions/batch", {
            interactions: list,
        });
        return data;
    } catch (error) {
        // Compatibility path for older backend payload naming.
        const status = error?.response?.status;
        if (status !== 400) {
            throw error;
        }

        const { data } = await apiClient.post("/interactions/batch", {
            items: list,
        });
        return data;
    }
}

export async function getInteractions() {
    const { data } = await apiClient.get("/interactions");
    return data;
}
