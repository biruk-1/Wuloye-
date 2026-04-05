import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/services/apiClient";

export function useFetch(queryKey, url, options = {}) {
  return useQuery({
    queryKey,
    queryFn: async () => {
      const response = await apiClient.get(url);
      return response.data;
    },
    retry: 2,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    ...options,
  });
}
