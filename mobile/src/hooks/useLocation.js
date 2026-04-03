import { useCallback, useState } from "react";
import * as Location from "expo-location";

export default function useLocation() {
    const [location, setLocation] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const requestCurrentLocation = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const { status } =
                await Location.requestForegroundPermissionsAsync();

            if (status !== "granted") {
                setError("Location permission was not granted.");
                return null;
            }

            const current = await Location.getCurrentPositionAsync({});
            setLocation(current);
            return current;
        } catch (err) {
            setError(err?.message ?? "Failed to get location.");
            return null;
        } finally {
            setLoading(false);
        }
    }, []);

    return {
        location,
        loading,
        error,
        requestCurrentLocation,
    };
}
