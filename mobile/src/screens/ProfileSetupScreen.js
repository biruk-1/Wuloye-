import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Loader from "../components/Loader";
import { getProfile, updateProfile } from "../api/profileApi";
import { useAuth } from "../context/AuthContext";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const INTERESTS = [
    "gym",
    "coffee",
    "hiking",
    "reading",
    "shopping",
    "restaurant",
    "yoga",
    "cinema",
];

const BUDGETS = ["low", "medium", "high"];
const LOCATION_PREF = ["indoor", "outdoor", "any"];

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

function SelectChip({ label, selected, onPress }) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.chip, selected && styles.chipSelected]}
        >
            <Text
                style={[styles.chipText, selected && styles.chipTextSelected]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

export default function ProfileSetupScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const { refreshProfile } = useAuth();
    const [interests, setInterests] = useState([]);
    const [budget, setBudget] = useState("medium");
    const [locationPreference, setLocationPreference] = useState("any");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        let mounted = true;

        async function loadProfile() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getProfile();
                const profile = unwrapApiData(envelope, {});

                if (!mounted) {
                    return;
                }

                if (
                    Array.isArray(profile?.interests) &&
                    profile.interests.length > 0
                ) {
                    setInterests(profile.interests);
                }
                if (profile?.budgetRange) {
                    setBudget(profile.budgetRange);
                }
                if (profile?.locationPreference) {
                    setLocationPreference(profile.locationPreference);
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

    const isValid = useMemo(
        () => interests.length > 0 && !!budget && !!locationPreference,
        [budget, interests, locationPreference],
    );

    function toggleInterest(item) {
        setInterests((current) => {
            if (current.includes(item)) {
                return current.filter((x) => x !== item);
            }
            return [...current, item];
        });
    }

    async function saveAndContinue() {
        if (!isValid || saving) {
            return;
        }

        try {
            setSaving(true);
            setError("");
            await updateProfile({
                interests,
                budgetRange: budget,
                locationPreference,
            });
            await refreshProfile();
            navigation.navigate("RoutineBuilder");
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to save profile."));
        } finally {
            setSaving(false);
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <ScrollView contentContainerStyle={styles.scrollContent}>
                    <Text style={styles.step}>Step 1 of 2</Text>
                    <View style={styles.progressTrack}>
                        <View style={styles.progressFill} />
                    </View>

                    <Text style={styles.title}>Tell us about you</Text>
                    <Text style={styles.subtitle}>
                        This helps us recommend the right places for your
                        lifestyle.
                    </Text>

                    <Text style={styles.section}>Interests</Text>
                    {loading ? <Loader /> : null}
                    {error ? (
                        <Text style={styles.errorText}>{error}</Text>
                    ) : null}
                    <View style={styles.chipsWrap}>
                        {INTERESTS.map((item) => (
                            <SelectChip
                                key={item}
                                label={formatLabel(item)}
                                selected={interests.includes(item)}
                                onPress={() => toggleInterest(item)}
                            />
                        ))}
                    </View>

                    <Text style={styles.section}>Budget</Text>
                    <View style={styles.optionStack}>
                        {BUDGETS.map((item) => (
                            <Pressable
                                key={item}
                                onPress={() => setBudget(item)}
                                style={[
                                    styles.optionCard,
                                    budget === item &&
                                        styles.optionCardSelected,
                                ]}
                            >
                                <Text style={styles.optionTitle}>
                                    {formatLabel(item)}
                                </Text>
                                <Text style={styles.optionSubtitle}>
                                    {item === "low" &&
                                        "Budget-friendly and easy"}
                                    {item === "medium" &&
                                        "Balanced and comfortable"}
                                    {item === "high" && "Luxury and premium"}
                                </Text>
                            </Pressable>
                        ))}
                    </View>

                    <Text style={styles.section}>Location Preference</Text>
                    <View style={styles.inlineOptions}>
                        {LOCATION_PREF.map((item) => (
                            <SelectChip
                                key={item}
                                label={formatLabel(item)}
                                selected={locationPreference === item}
                                onPress={() => setLocationPreference(item)}
                            />
                        ))}
                    </View>
                </ScrollView>

                <Pressable
                    onPress={saveAndContinue}
                    disabled={!isValid || saving}
                    style={[styles.ctaWrap, !isValid && styles.ctaDisabled]}
                >
                    <LinearGradient
                        colors={gradients.primaryButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cta}
                    >
                        <Text style={styles.ctaText}>
                            {saving ? "Saving..." : "Continue"}
                        </Text>
                    </LinearGradient>
                </Pressable>
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
            paddingHorizontal: 20,
        },
        scrollContent: {
            paddingBottom: 120,
        },
        step: {
            marginTop: 6,
            color: palette.textMuted,
            fontSize: 11,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 1.2,
        },
        progressTrack: {
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(10, 108, 168, 0.2)",
            overflow: "hidden",
        },
        progressFill: {
            width: "50%",
            height: "100%",
            borderRadius: 999,
            backgroundColor: palette.oceanBlue,
        },
        title: {
            marginTop: 20,
            color: palette.textPrimary,
            fontSize: 38,
            lineHeight: 42,
            fontWeight: "800",
        },
        subtitle: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
        },
        section: {
            marginTop: 22,
            marginBottom: 10,
            color: palette.textMuted,
            fontSize: 11,
            letterSpacing: 1.1,
            textTransform: "uppercase",
            fontWeight: "800",
        },
        errorText: {
            color: palette.danger,
            fontSize: 12,
            marginBottom: 10,
        },
        chipsWrap: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        chip: {
            borderRadius: 999,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            paddingHorizontal: 13,
            paddingVertical: 8,
        },
        chipSelected: {
            borderColor: palette.oceanBlue,
            backgroundColor: "rgba(31, 159, 234, 0.18)",
        },
        chipText: {
            color: palette.textSecondary,
            fontSize: 12,
            fontWeight: "700",
        },
        chipTextSelected: {
            color: palette.deepBlue,
        },
        optionStack: {
            gap: 10,
        },
        optionCard: {
            borderRadius: 16,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
        },
        optionCardSelected: {
            borderColor: palette.emerald,
            backgroundColor: "rgba(38, 201, 122, 0.15)",
        },
        optionTitle: {
            color: palette.textPrimary,
            fontSize: 16,
            fontWeight: "800",
        },
        optionSubtitle: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 12,
        },
        inlineOptions: {
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
        },
        ctaWrap: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 26,
            borderRadius: 16,
            overflow: "hidden",
        },
        cta: {
            height: 54,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2FAAFF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        ctaDisabled: {
            opacity: 0.5,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.5,
        },
    });
}
