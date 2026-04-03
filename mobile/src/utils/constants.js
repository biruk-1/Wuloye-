export const API_BASE_URL =
    process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://10.0.2.2:5000/api";

export const INTERACTION_TYPES = {
    VIEW: "view",
    CLICK: "click",
    SAVE: "save",
    DISMISS: "dismiss",
};
