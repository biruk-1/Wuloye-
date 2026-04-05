import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import PlaceCard from "../components/PlaceCard";
import EmptyState from "../components/EmptyState";
import Loader from "../components/Loader";
import { getProfile } from "../api/profileApi";
import {
    createInteraction,
    createInteractionsBatch,
} from "../api/interactionApi";
import {
    getRecommendations,
    parseRecommendationsResponse,
} from "../api/recommendationApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

function normalisePlace(item, index) {
    const id =
        item?.placeId ??
        item?.id ??
        item?.googlePlaceId ??
        `${item?.name ?? "place"}-${index}`;

    const numericScore =
        typeof item?.finalScore === "number"
            ? item.finalScore
            : typeof item?.score === "number"
              ? item.score
              : null;

    const score =
        typeof numericScore === "number"
            ? `${Math.max(1, Math.min(99, Math.round(numericScore)))}% match`
            : (item?.scoreLabel ?? "Top pick");

    const distance =
        item?.distanceText ??
        item?.distance ??
        (typeof item?.distanceKm === "number"
            ? `${item.distanceKm.toFixed(1)} km away`
            : "Nearby");

    return {
        ...item,
        id,
        placeId: id,
        type: item?.type ?? item?.category ?? "Place",
        name: item?.name ?? "Recommended place",
        description:
            item?.description ??
            item?.summary ??
            "Curated place recommendation for you.",
        score,
        distance,
    };
}

export default function HomeScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [name, setName] = useState("there");
    const [places, setPlaces] = useState([]);
    const [refreshing, setRefreshing] = useState(false);

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            setError("");

            const [profileEnvelope, recommendationsEnvelope] =
                await Promise.all([getProfile(), getRecommendations()]);

            const profile = unwrapApiData(profileEnvelope, {});
            const { recommendations } = parseRecommendationsResponse(
                recommendationsEnvelope,
            );
            const mapped = Array.isArray(recommendations)
                ? recommendations.map((item, index) =>
                      normalisePlace(item, index),
                  )
                : [];

            setName(profile?.name?.trim() || "there");
            setPlaces(mapped);

            if (mapped.length > 0) {
                const impressionItems = mapped.slice(0, 8).map((place) => ({
                    placeId: place.placeId,
                    actionType: INTERACTION_TYPES.VIEW,
                    metadata: {
                        source: "home_feed",
                        place,
                    },
                }));

                createInteractionsBatch(impressionItems).catch(() => null);
            }
        } catch (err) {
            setError(
                getApiErrorMessage(err, "Unable to load recommendations."),
            );
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    async function handleRefresh() {
        try {
            setRefreshing(true);
            await fetchData();
        } finally {
            setRefreshing(false);
        }
    }

    async function handleOpenDetail(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.CLICK,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
        } catch {
            // Non-blocking: still open detail screen.
        }

        navigation.navigate("PlaceDetail", { place });
    }

    async function handleSave(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.SAVE,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
            Alert.alert("Saved", "Place added to your saved list.");
        } catch (err) {
            Alert.alert("Unable to save", getApiErrorMessage(err));
        }
    }

    async function handleDismiss(place) {
        try {
            await createInteraction({
                placeId: place.placeId,
                actionType: INTERACTION_TYPES.DISMISS,
                metadata: {
                    source: "home_feed",
                    place,
                },
            });
            setPlaces((current) =>
                current.filter((item) => item.placeId !== place.placeId),
            );
        } catch (err) {
            Alert.alert("Unable to dismiss", getApiErrorMessage(err));
        }
    }

    const data = useMemo(() => places, [places]);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <View style={styles.topRow}>
                    <View>
                        <Text style={styles.greeting}>
                            Good morning, {name}
                        </Text>
                        <Text style={styles.heading}>
                            Places we think you'll love today
                        </Text>
                    </View>
                    <Pressable style={styles.bellWrap} onPress={handleRefresh}>
                        <Ionicons
                            name="notifications-outline"
                            size={18}
                            color={palette.deepBlue}
                        />
                    </Pressable>
                </View>

                <View style={styles.filtersRow}>
                    <Text style={styles.filterChipActive}>For You</Text>
                    <Text style={styles.filterChip}>Trending</Text>
                    <Text style={styles.filterChip}>Nearby</Text>
                </View>

                {loading ? <Loader /> : null}
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {!loading && data.length === 0 ? (
                    <EmptyState
                        message="We're still learning your taste. Update your profile to improve recommendations."
                        ctaLabel="Update Profile"
                        onPress={() => navigation.navigate("Profile")}
                    />
                ) : (
                    <FlatList
                        data={data}
                        keyExtractor={(item) => item.id}
                        showsVerticalScrollIndicator={false}
                        refreshing={refreshing}
                        onRefresh={handleRefresh}
                        contentContainerStyle={styles.listContent}
                        renderItem={({ item }) => (
                            <PlaceCard
                                place={item}
                                onPress={() => handleOpenDetail(item)}
                                onSave={() => handleSave(item)}
                                onDismiss={() => handleDismiss(item)}
                            />
                        )}
                    />
                )}
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: {
            flex: 1,
            backgroundColor: palette.pageTop,
        },
        screen: {
            flex: 1,
            paddingHorizontal: 16,
        },
        topRow: {
            marginTop: 4,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
        },
        greeting: {
            color: palette.emerald,
            fontSize: 13,
            fontWeight: "800",
        },
        errorText: {
            color: palette.danger,
            marginBottom: 10,
            fontSize: 12,
        },
        heading: {
            marginTop: 8,
            color: palette.textPrimary,
            fontSize: 33,
            lineHeight: 38,
            fontWeight: "800",
            maxWidth: 280,
        },
        bellWrap: {
            width: 34,
            height: 34,
            borderRadius: 17,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
        },
        filtersRow: {
            flexDirection: "row",
            gap: 10,
            marginTop: 14,
            marginBottom: 12,
        },
        filterChipActive: {
            backgroundColor: palette.oceanBlue,
            color: palette.iceWhite,
            fontWeight: "800",
            fontSize: 11,
            textTransform: "uppercase",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
        },
        filterChip: {
            color: palette.textSecondary,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            fontSize: 11,
            textTransform: "uppercase",
            fontWeight: "700",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 999,
        },
        listContent: {
            paddingBottom: 20,
        },
    });
}
