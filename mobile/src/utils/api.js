export function unwrapApiData(response, fallback = null) {
    if (!response || typeof response !== "object") {
        return fallback;
    }

    if (Object.prototype.hasOwnProperty.call(response, "data")) {
        return response.data ?? fallback;
    }

    return fallback;
}

export function getApiErrorMessage(error, fallback = "Something went wrong") {
    const backendMessage = error?.response?.data?.message;
    if (typeof backendMessage === "string" && backendMessage.trim() !== "") {
        return backendMessage;
    }

    const axiosMessage = error?.message;
    if (typeof axiosMessage === "string" && axiosMessage.trim() !== "") {
        return axiosMessage;
    }

    return fallback;
}
