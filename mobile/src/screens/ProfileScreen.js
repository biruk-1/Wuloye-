import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import { getProfile } from "../api/profileApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { THEMES } from "../theme/theme";
import { useAppTheme } from "../context/ThemeContext";

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "Not set";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ProfileScreen({ navigation }) {
    const { palette, gradients, mode, setThemeMode } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);
    const thumbAnim = useRef(
        new Animated.Value(mode === THEMES.DARK ? 1 : 0),
    ).current;

    useEffect(() => {
        Animated.timing(thumbAnim, {
            toValue: mode === THEMES.DARK ? 1 : 0,
            duration: 220,
            useNativeDriver: true,
        }).start();
    }, [mode, thumbAnim]);

    const { clearAuth } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        let mounted = true;

        async function loadProfile() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getProfile();
                const data = unwrapApiData(envelope, null);
                if (mounted) {
                    setProfile(data);
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        getApiErrorMessage(err, "Unable to load profile."),
                    );
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        loadProfile();

        return () => {
            mounted = false;
        };
    }, []);

    async function handleRefreshProfile() {
        try {
            setLoading(true);
            setError("");
            const envelope = await getProfile();
            const data = unwrapApiData(envelope, null);
            setProfile(data);
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to load profile."));
        } finally {
            setLoading(false);
        }
    }

    const interests = Array.isArray(profile?.interests)
        ? profile.interests
        : [];
    const displayName =
        profile?.name?.trim() || profile?.email || "Wuloye User";
    const budget = formatLabel(profile?.budgetRange);
    const location = formatLabel(profile?.locationPreference);

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <View style={styles.headerRow}>
                    <Text style={styles.greeting}>
                        Good morning, {displayName}
                    </Text>
                    <Pressable
                        style={styles.bellWrap}
                        onPress={handleRefreshProfile}
                    >
                        <Ionicons
                            name="notifications-outline"
                            size={18}
                            color={palette.deepBlue}
                        />
                    </Pressable>
                </View>

                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Ionicons
                            name="person"
                            size={36}
                            color={palette.iceWhite}
                        />
                    </View>
                    <Text style={styles.name}>{displayName}</Text>
                    <Text style={styles.meta}>
                        {profile?.email ?? "No email on profile"}
                    </Text>
                    {loading ? <Loader /> : null}
                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}

                    <View style={styles.sectionBlock}>
                        <Text style={styles.label}>Interests</Text>
                        <View style={styles.tagRow}>
                            {interests.length > 0 ? (
                                interests.map((interest) => (
                                    <Text style={styles.tag} key={interest}>
                                        {formatLabel(interest)}
                                    </Text>
                                ))
                            ) : (
                                <Text style={styles.valueMuted}>
                                    No interests selected.
                                </Text>
                            )}
                        </View>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.label}>Budget</Text>
                        <Text style={styles.value}>{budget}</Text>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.label}>Location</Text>
                        <Text style={styles.value}>{location}</Text>
                    </View>

                    <View style={styles.sectionBlock}>
                        <Text style={styles.label}>Theme</Text>
                        <View style={styles.themeRow}>
                            <Text style={styles.valueMuted}>Light</Text>
                            <Pressable
                                style={styles.themeTrack}
                                onPress={() =>
                                    setThemeMode(
                                        mode === THEMES.DARK
                                            ? THEMES.LIGHT
                                            : THEMES.DARK,
                                    )
                                }
                            >
                                <Animated.View
                                    style={[
                                        styles.themeThumb,
                                        {
                                            transform: [
                                                {
                                                    translateX:
                                                        thumbAnim.interpolate({
                                                            inputRange: [0, 1],
                                                            outputRange: [
                                                                2, 26,
                                                            ],
                                                        }),
                                                },
                                            ],
                                        },
                                    ]}
                                >
                                    <Ionicons
                                        name={
                                            mode === THEMES.DARK
                                                ? "moon"
                                                : "sunny"
                                        }
                                        size={13}
                                        color={palette.deepBlue}
                                    />
                                </Animated.View>
                            </Pressable>
                            <Text style={styles.valueMuted}>Dark</Text>
                        </View>
                    </View>

                    <Pressable
                        style={styles.primaryBtnWrap}
                        onPress={() => navigation.navigate("ProfileSetup")}
                    >
                        <LinearGradient
                            colors={gradients.primaryButton}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={styles.primaryBtn}
                        >
                            <Text style={styles.primaryBtnText}>
                                Edit preferences
                            </Text>
                        </LinearGradient>
                    </Pressable>

                    <Pressable
                        style={styles.logoutBtn}
                        onPress={async () => {
                            await clearAuth();
                        }}
                    >
                        <Ionicons
                            name="log-out-outline"
                            size={15}
                            color={palette.textSecondary}
                        />
                        <Text style={styles.logoutText}>Log out</Text>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        safeArea: { flex: 1, backgroundColor: palette.pageTop },
        screen: { flex: 1, paddingHorizontal: 16 },
        headerRow: {
            marginTop: 2,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        greeting: {
            color: palette.emerald,
            fontSize: 13,
            fontWeight: "800",
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
        },
        profileCard: {
            marginTop: 14,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 16,
        },
        avatar: {
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: palette.oceanBlue,
            alignSelf: "center",
            alignItems: "center",
            justifyContent: "center",
        },
        name: {
            marginTop: 10,
            color: palette.textPrimary,
            fontSize: 28,
            textAlign: "center",
            fontWeight: "800",
        },
        meta: {
            marginTop: 4,
            color: palette.textSecondary,
            textAlign: "center",
            fontSize: 12,
        },
        errorText: {
            marginTop: 8,
            color: palette.danger,
            fontSize: 12,
            textAlign: "center",
        },
        sectionBlock: {
            marginTop: 14,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: palette.borderSoft,
            backgroundColor: palette.surfaceStrong,
            padding: 12,
        },
        label: {
            color: palette.textMuted,
            textTransform: "uppercase",
            fontSize: 10,
            fontWeight: "700",
            letterSpacing: 0.8,
        },
        tagRow: {
            marginTop: 8,
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        tag: {
            borderRadius: 999,
            backgroundColor: "rgba(31, 159, 234, 0.13)",
            color: palette.deepBlue,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            paddingHorizontal: 10,
            paddingVertical: 5,
            fontSize: 11,
            fontWeight: "700",
        },
        value: {
            marginTop: 6,
            color: palette.textPrimary,
            fontSize: 20,
            fontWeight: "800",
        },
        valueMuted: {
            marginTop: 6,
            color: palette.textSecondary,
            fontSize: 12,
        },
        themeRow: {
            marginTop: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
        },
        themeTrack: {
            width: 52,
            height: 28,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: "rgba(137,196,255,0.25)",
            paddingHorizontal: 2,
            justifyContent: "center",
        },
        themeThumb: {
            width: 22,
            height: 22,
            borderRadius: 11,
            backgroundColor: palette.iceWhite,
            alignItems: "center",
            justifyContent: "center",
        },
        primaryBtnWrap: {
            marginTop: 16,
            borderRadius: 14,
            overflow: "hidden",
        },
        primaryBtn: {
            height: 50,
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2EA9FF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        primaryBtnText: {
            color: palette.iceWhite,
            textTransform: "uppercase",
            fontWeight: "800",
            letterSpacing: 0.5,
        },
        logoutBtn: {
            marginTop: 12,
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
        },
        logoutText: {
            color: palette.textSecondary,
            fontSize: 14,
            fontWeight: "600",
        },
    });
}
