import { apiClient } from "@/services/apiClient";

export const endpoints = {
	health: "/health",
	metrics: "/health/metrics",
	profile: "/profile",
	recommendations: "/recommendations",
	interactions: "/interactions",
	routines: "/routines",
	experiments: "/dev/experiment-metrics",
};

export async function getHealth() {
	const response = await apiClient.get(endpoints.health);
	return response.data;
}

export async function getMetrics() {
	const response = await apiClient.get(endpoints.metrics);
	return response.data;
}

export async function getUserProfile(uid) {
	const response = await apiClient.get(endpoints.profile, {
		params: uid ? { uid } : undefined,
	});
	return response.data;
}

export async function getRecommendations(params) {
	const response = await apiClient.get(endpoints.recommendations, { params });
	return response.data;
}

export async function getInteractions() {
	const response = await apiClient.get(endpoints.interactions);
	return response.data;
}

export async function getRoutines() {
	const response = await apiClient.get(endpoints.routines);
	return response.data;
}

export async function getExperimentMetrics() {
	const response = await apiClient.get(endpoints.experiments);
	return response.data;
}
