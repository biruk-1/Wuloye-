import {
    Alert,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { createInteraction } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage } from "../utils/api";

export default function PlaceDetailScreen({ navigation, route }) {
    const place = route?.params?.place;

    async function logAction(actionType, successMessage) {
        try {
            await createInteraction({
                placeId: place?.placeId ?? place?.id,
                actionType,
                metadata: {
                    source: "place_detail",
                    place,
                },
            });

            if (successMessage) {
                Alert.alert("Done", successMessage);
            }
        } catch (error) {
            Alert.alert("Action failed", getApiErrorMessage(error));
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={["#0B1529", "#071326", "#050A17"]}
                style={styles.screen}
            >
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    <View style={styles.heroCard}>
                        <Pressable
                            style={styles.backButton}
                            onPress={() => navigation.goBack()}
                        >
                            <Ionicons
                                name="chevron-back"
                                size={18}
                                color="#EFF4FC"
                            />
                        </Pressable>
                        <View style={styles.heroOverlay}>
                            <Text style={styles.scoreBadge}>
                                {place?.score ?? "92% match"}
                            </Text>
                            <Text style={styles.title}>
                                {place?.name ?? "The Glass Lab"}
                            </Text>
                            <Text style={styles.type}>
                                {(place?.type ?? "Specialty place") +
                                    " • " +
                                    (place?.distance ?? "Nearby")}
                            </Text>
                        </View>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.sectionLabel}>About</Text>
                        <Text style={styles.bodyText}>
                            {place?.description ??
                                "A curated sensory experience for minimalist lovers and focused conversations."}
                        </Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.sectionLabel}>Budget</Text>
                        <Text style={styles.valueText}>
                            Aligned with your profile
                        </Text>
                    </View>

                    <View style={styles.infoCard}>
                        <Text style={styles.sectionLabel}>Hours</Text>
                        <Text style={styles.bodyText}>
                            Tap save to keep this place for later.
                        </Text>
                    </View>
                </ScrollView>

                <View style={styles.bottomActions}>
                    <Pressable
                        style={styles.dismissBtn}
                        onPress={async () => {
                            await logAction(
                                INTERACTION_TYPES.DISMISS,
                                "We'll show fewer places like this.",
                            );
                            navigation.goBack();
                        }}
                    >
                        <Ionicons name="close" size={16} color="#D6E0F0" />
                        <Text style={styles.dismissText}>Not interested</Text>
                    </Pressable>
                    <Pressable
                        style={styles.saveBtn}
                        onPress={() =>
                            logAction(
                                INTERACTION_TYPES.SAVE,
                                "Place saved to your collection.",
                            )
                        }
                    >
                        <Ionicons name="heart" size={16} color="#1F1F1F" />
                        <Text style={styles.saveText}>Save this place</Text>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#050A17" },
    screen: { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
    heroCard: {
        marginTop: 8,
        borderRadius: 22,
        height: 290,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "#121822",
    },
    backButton: {
        position: "absolute",
        top: 14,
        left: 14,
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: "rgba(0,0,0,0.45)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 4,
    },
    heroOverlay: {
        position: "absolute",
        bottom: 16,
        left: 16,
        right: 16,
    },
    scoreBadge: {
        alignSelf: "flex-start",
        backgroundColor: "rgba(247,199,44,0.2)",
        color: "#FCE58B",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
        fontSize: 11,
        fontWeight: "800",
    },
    title: {
        marginTop: 12,
        color: "#F2F7FD",
        fontSize: 38,
        lineHeight: 41,
        fontWeight: "800",
    },
    type: {
        marginTop: 6,
        color: "#9FB3CE",
        fontSize: 13,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        fontWeight: "700",
    },
    infoCard: {
        marginTop: 12,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 14,
    },
    sectionLabel: {
        color: "#F7C72C",
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.9,
    },
    bodyText: {
        marginTop: 8,
        color: "#A3B5CE",
        fontSize: 14,
        lineHeight: 21,
    },
    valueText: {
        marginTop: 6,
        color: "#F4D065",
        fontSize: 30,
        fontWeight: "800",
    },
    bottomActions: {
        position: "absolute",
        left: 16,
        right: 16,
        bottom: 22,
        flexDirection: "row",
        gap: 10,
    },
    dismissBtn: {
        flex: 1,
        height: 52,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.16)",
        backgroundColor: "rgba(255,255,255,0.04)",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 7,
    },
    dismissText: {
        color: "#D6E0F0",
        fontSize: 13,
        fontWeight: "700",
    },
    saveBtn: {
        flex: 1.1,
        height: 52,
        borderRadius: 16,
        backgroundColor: "#F7C72C",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 7,
    },
    saveText: {
        color: "#1E1E1E",
        fontSize: 13,
        fontWeight: "800",
        textTransform: "uppercase",
    },
});
