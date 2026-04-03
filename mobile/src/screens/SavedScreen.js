import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import PlaceCard from "../components/PlaceCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import { createInteraction, getInteractions } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";

function asSavedPlace(interaction, index) {
    const place = interaction?.metadata?.place;
    const placeId = interaction?.placeId ?? place?.placeId ?? `${index}`;

    return {
        id: placeId,
        placeId,
        name: place?.name ?? "Saved place",
        type: place?.type ?? "Place",
        score: place?.score ?? "Saved",
        distance: place?.distance ?? "Nearby",
        description:
            place?.description ?? "Saved from your recommendation history.",
        ...place,
    };
}

export default function SavedScreen({ navigation }) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [saved, setSaved] = useState([]);

    const loadSaved = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const envelope = await getInteractions();
            const interactions = unwrapApiData(envelope, []);
            const ordered = Array.isArray(interactions) ? interactions : [];
            const savedByPlace = new Map();

            ordered.forEach((interaction, index) => {
                const placeId = interaction?.placeId;
                if (!placeId) {
                    return;
                }

                if (interaction?.actionType === INTERACTION_TYPES.SAVE) {
                    savedByPlace.set(placeId, asSavedPlace(interaction, index));
                }

                if (interaction?.actionType === INTERACTION_TYPES.DISMISS) {
                    savedByPlace.delete(placeId);
                }
            });

            setSaved(Array.from(savedByPlace.values()));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load saved places."));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSaved();
    }, [loadSaved]);

    async function handleDismiss(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.DISMISS,
                metadata: {
                    source: "saved_screen",
                    place,
                },
            });
            setSaved((current) =>
                current.filter((item) => item.placeId !== place.placeId),
            );
        } catch (err) {
            Alert.alert("Unable to remove", getApiErrorMessage(err));
        }
    }

    const items = useMemo(() => saved, [saved]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={["#0B1529", "#071326", "#050A17"]}
                style={styles.screen}
            >
                <Text style={styles.title}>Saved Places</Text>
                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}

                {!loading && items.length === 0 ? (
                    <EmptyState
                        message="No saved places yet. Start saving your favorites."
                        ctaLabel="Browse Home"
                        onPress={() => navigation.navigate("Home")}
                    />
                ) : (
                    <FlatList
                        data={items}
                        keyExtractor={(item) => item.id}
                        contentContainerStyle={styles.list}
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() =>
                                    navigation.navigate("PlaceDetail", {
                                        place: item,
                                    })
                                }
                                onDismiss={() => handleDismiss(item)}
                            />
                        )}
                    />
                )}
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#050A17" },
    screen: { flex: 1, paddingHorizontal: 16 },
    title: {
        color: "#F0F5FD",
        fontSize: 31,
        fontWeight: "800",
        marginTop: 4,
    },
    errorText: {
        color: "#F7B2B2",
        marginTop: 8,
    },
    list: {
        marginTop: 14,
        paddingBottom: 16,
    },
});
