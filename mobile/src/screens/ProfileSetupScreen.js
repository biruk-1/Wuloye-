import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import Loader from "../components/Loader";
import { getProfile, updateProfile } from "../api/profileApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";

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
                colors={["#0B152A", "#071326", "#050A17"]}
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
                    style={[styles.cta, !isValid && styles.ctaDisabled]}
                >
                    <Text style={styles.ctaText}>
                        {saving ? "Saving..." : "Continue"}
                    </Text>
                </Pressable>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#050A17",
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
        color: "#A4B2C8",
        fontSize: 11,
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 1.2,
    },
    progressTrack: {
        marginTop: 8,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.13)",
        overflow: "hidden",
    },
    progressFill: {
        width: "50%",
        height: "100%",
        borderRadius: 999,
        backgroundColor: "#F7C72C",
    },
    title: {
        marginTop: 20,
        color: "#F1F5FB",
        fontSize: 38,
        lineHeight: 42,
        fontWeight: "800",
    },
    subtitle: {
        marginTop: 10,
        color: "#8DA2C1",
        fontSize: 15,
        lineHeight: 22,
    },
    section: {
        marginTop: 22,
        marginBottom: 10,
        color: "#7F93B4",
        fontSize: 11,
        letterSpacing: 1.1,
        textTransform: "uppercase",
        fontWeight: "800",
    },
    errorText: {
        color: "#F7B2B2",
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
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.06)",
        paddingHorizontal: 13,
        paddingVertical: 8,
    },
    chipSelected: {
        borderColor: "#F7C72C",
        backgroundColor: "rgba(247,199,44,0.2)",
    },
    chipText: {
        color: "#B3C1D8",
        fontSize: 12,
        fontWeight: "700",
    },
    chipTextSelected: {
        color: "#FCE68A",
    },
    optionStack: {
        gap: 10,
    },
    optionCard: {
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 14,
    },
    optionCardSelected: {
        borderColor: "#F7C72C",
        backgroundColor: "rgba(247,199,44,0.14)",
    },
    optionTitle: {
        color: "#EDF3FD",
        fontSize: 16,
        fontWeight: "800",
    },
    optionSubtitle: {
        marginTop: 4,
        color: "#9BB0CC",
        fontSize: 12,
    },
    inlineOptions: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    cta: {
        position: "absolute",
        left: 20,
        right: 20,
        bottom: 26,
        backgroundColor: "#F7C72C",
        height: 54,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
    },
    ctaDisabled: {
        opacity: 0.5,
    },
    ctaText: {
        color: "#1E1E1E",
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
});
