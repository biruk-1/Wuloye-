export function unwrapApiData(response, fallback = null) {
    if (!response || typeof response !== "object") {
        return fallback;
    }

    if (Object.prototype.hasOwnProperty.call(response, "data")) {
        return response.data ?? fallback;
    }

    return fallback;
}

const FIREBASE_AUTH_MESSAGES = {
    "auth/email-already-in-use": "That email is already registered. Try signing in.",
    "auth/invalid-email": "That email address looks invalid.",
    "auth/weak-password": "Password is too weak. Use a stronger password.",
    "auth/user-disabled": "This account has been disabled.",
    "auth/user-not-found": "No account found for that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
};

export function getApiErrorMessage(error, fallback = "Something went wrong") {
    const firebaseCode = error?.code;
    if (
        typeof firebaseCode === "string" &&
        Object.prototype.hasOwnProperty.call(FIREBASE_AUTH_MESSAGES, firebaseCode)
    ) {
        return FIREBASE_AUTH_MESSAGES[firebaseCode];
    }

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
