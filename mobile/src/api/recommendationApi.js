import apiClient from "./client";

export async function getRecommendations(params = {}) {
    const { data } = await apiClient.get("/recommendations", { params });
    return data;
}

export function parseRecommendationsResponse(envelope) {
    const payload = envelope?.data;

    if (Array.isArray(payload)) {
        return {
            recommendations: payload,
            context: envelope?.meta?.context ?? null,
            meta: envelope?.meta ?? null,
        };
    }

    return {
        recommendations: Array.isArray(payload?.recommendations)
            ? payload.recommendations
            : [],
        context: payload?.context ?? null,
        meta: payload?.meta ?? envelope?.meta ?? null,
    };
}
