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
import { useMemo } from "react";
import { createInteraction } from "../api/interactionApi";
import { INTERACTION_TYPES } from "../utils/constants";
import { getApiErrorMessage } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

export default function PlaceDetailScreen({ navigation, route }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

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
                colors={gradients.appBackground}
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
                                color={palette.iceWhite}
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
                        <Ionicons
                            name="close"
                            size={16}
                            color={palette.deepBlue}
                        />
                        <Text style={styles.dismissText}>Not interested</Text>
                    </Pressable>
                    <Pressable
                        style={styles.saveBtnWrap}
                        onPress={() =>
                            logAction(
                                INTERACTION_TYPES.SAVE,
                                "Place saved to your collection.",
                            )
                        }
                    >
                        <LinearGradient
                            colors={gradients.primaryButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.saveBtn}
                        >
                            <Ionicons
                                name="heart"
                                size={16}
                                color={palette.iceWhite}
                            />
                            <Text style={styles.saveText}>Save this place</Text>
                        </LinearGradient>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1 },
        scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
        heroCard: {
            marginTop: 8,
            borderRadius: 22,
            height: 290,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
        },
        backButton: {
            position: "absolute",
            top: 14,
            left: 14,
            width: 34,
            height: 34,
            borderRadius: 17,
            backgroundColor: "rgba(23, 111, 178, 0.78)",
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
            backgroundColor: "rgba(38, 201, 122, 0.18)",
            color: palette.emerald,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 5,
            fontSize: 11,
            fontWeight: "800",
        },
        title: {
            marginTop: 12,
            color: palette.textPrimary,
            fontSize: 38,
            lineHeight: 41,
            fontWeight: "800",
        },
        type: {
            marginTop: 6,
            color: palette.textSecondary,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: 0.6,
            fontWeight: "700",
        },
        infoCard: {
            marginTop: 12,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surfaceStrong,
            padding: 14,
        },
        sectionLabel: {
            color: palette.oceanBlue,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.9,
        },
        bodyText: {
            marginTop: 8,
            color: palette.textSecondary,
            fontSize: 14,
            lineHeight: 21,
        },
        valueText: {
            marginTop: 6,
            color: palette.emerald,
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
            borderColor: palette.borderStrong,
            backgroundColor: palette.surfaceStrong,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 7,
        },
        dismissText: {
            color: palette.deepBlue,
            fontSize: 13,
            fontWeight: "700",
        },
        saveBtnWrap: {
            flex: 1.1,
            borderRadius: 16,
            overflow: "hidden",
        },
        saveBtn: {
            flex: 1,
            height: 52,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 7,
            shadowColor: "#2EA9FF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        saveText: {
            color: palette.iceWhite,
            fontSize: 13,
            fontWeight: "800",
            textTransform: "uppercase",
        },
    });
}
