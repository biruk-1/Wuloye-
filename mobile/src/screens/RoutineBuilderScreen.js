import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Loader from "../components/Loader";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";
import { useAppTheme } from "../context/ThemeContext";

const ROUTINE_SAMPLES = [
    {
        weekday: "monday",
        timeOfDay: "morning",
        activityType: "gym",
        locationPreference: "indoor",
        budgetRange: "medium",
    },
    {
        weekday: "wednesday",
        timeOfDay: "evening",
        activityType: "coffee",
        locationPreference: "indoor",
        budgetRange: "low",
    },
    {
        weekday: "friday",
        timeOfDay: "afternoon",
        activityType: "reading",
        locationPreference: "any",
        budgetRange: "medium",
    },
];

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function RoutineBuilderScreen({ navigation }) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const [routines, setRoutines] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const nextSample = useMemo(
        () => ROUTINE_SAMPLES[routines.length % ROUTINE_SAMPLES.length],
        [routines.length],
    );

    useEffect(() => {
        let mounted = true;

        async function loadRoutines() {
            try {
                setLoading(true);
                setError("");
                const envelope = await getRoutines();
                const items = unwrapApiData(envelope, []);
                if (mounted) {
                    setRoutines(Array.isArray(items) ? items : []);
                }
            } catch (err) {
                if (mounted) {
                    setError(
                        getApiErrorMessage(err, "Unable to load routines."),
                    );
                }
            } finally {
                if (mounted) {
                    setLoading(false);
                }
            }
        }

        loadRoutines();

        return () => {
            mounted = false;
        };
    }, []);

    async function addRoutine() {
        if (saving) {
            return;
        }

        try {
            setSaving(true);
            setError("");
            const envelope = await createRoutine(nextSample);
            const created = unwrapApiData(envelope, null);
            if (created) {
                setRoutines((current) => [created, ...current]);
            }
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to create routine."));
        } finally {
            setSaving(false);
        }
    }

    async function removeRoutine(id) {
        try {
            setError("");
            await deleteRoutine(id);
            setRoutines((current) => current.filter((item) => item.id !== id));
        } catch (err) {
            setError(getApiErrorMessage(err, "Unable to delete routine."));
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={gradients.appBackground}
                style={styles.screen}
            >
                <Text style={styles.step}>Step 2 of 2</Text>
                <View style={styles.progressTrack}>
                    <View style={styles.progressFill} />
                </View>

                <Text style={styles.title}>Build your weekly routines</Text>
                <Text style={styles.subtitle}>
                    Add habits so we can suggest places at the right time.
                </Text>
                {error ? <Text style={styles.errorText}>{error}</Text> : null}
                {loading ? <Loader /> : null}

                <ScrollView
                    style={styles.list}
                    contentContainerStyle={styles.listContent}
                >
                    {routines.map((routine) => (
                        <View key={routine.id} style={styles.card}>
                            <View>
                                <Text style={styles.cardTitle}>
                                    {formatLabel(routine.weekday)} •{" "}
                                    {formatLabel(routine.timeOfDay)}
                                </Text>
                                <Text style={styles.cardActivity}>
                                    {formatLabel(routine.activityType)}
                                </Text>
                                <Text style={styles.cardMeta}>
                                    {formatLabel(routine.locationPreference)} •{" "}
                                    {formatLabel(routine.budgetRange)}
                                </Text>
                            </View>
                            <Pressable
                                onPress={() => removeRoutine(routine.id)}
                            >
                                <Ionicons
                                    name="trash-outline"
                                    size={18}
                                    color={palette.deepBlue}
                                />
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>

                <Pressable style={styles.fabWrap} onPress={addRoutine}>
                    <LinearGradient
                        colors={gradients.primaryButton}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.fab}
                    >
                        <Ionicons
                            name="add"
                            size={22}
                            color={palette.iceWhite}
                        />
                    </LinearGradient>
                </Pressable>

                <Pressable
                    style={styles.ctaWrap}
                    onPress={() => navigation.replace("MainTabs")}
                >
                    <LinearGradient
                        colors={gradients.primaryButtonMint}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.cta}
                    >
                        <Text style={styles.ctaText}>
                            Save all & start exploring
                        </Text>
                        <Ionicons
                            name="arrow-forward"
                            size={16}
                            color={palette.iceWhite}
                        />
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
            paddingTop: 8,
        },
        step: {
            color: palette.textMuted,
            fontSize: 11,
            letterSpacing: 1.2,
            textTransform: "uppercase",
            fontWeight: "800",
        },
        progressTrack: {
            marginTop: 8,
            height: 4,
            borderRadius: 999,
            backgroundColor: "rgba(10, 108, 168, 0.2)",
            overflow: "hidden",
        },
        progressFill: {
            width: "100%",
            height: "100%",
            backgroundColor: palette.oceanBlue,
        },
        title: {
            marginTop: 18,
            color: palette.textPrimary,
            fontSize: 42,
            lineHeight: 45,
            fontWeight: "800",
        },
        subtitle: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
        },
        errorText: {
            marginTop: 10,
            color: palette.danger,
            fontSize: 12,
        },
        list: {
            marginTop: 16,
        },
        listContent: {
            paddingBottom: 120,
            gap: 10,
        },
        card: {
            borderRadius: 18,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            padding: 14,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
        },
        cardTitle: {
            color: palette.textMuted,
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: 0.8,
            fontWeight: "700",
        },
        cardActivity: {
            marginTop: 6,
            color: palette.oceanBlue,
            fontSize: 18,
            fontWeight: "800",
        },
        cardMeta: {
            marginTop: 4,
            color: palette.textSecondary,
            fontSize: 12,
        },
        fabWrap: {
            position: "absolute",
            right: 20,
            bottom: 94,
            borderRadius: 25,
            overflow: "hidden",
        },
        fab: {
            width: 50,
            height: 50,
            borderRadius: 25,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#2A9DE5",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.34,
            shadowRadius: 14,
            elevation: 6,
        },
        ctaWrap: {
            position: "absolute",
            left: 20,
            right: 20,
            bottom: 24,
            borderRadius: 16,
            overflow: "hidden",
        },
        cta: {
            height: 54,
            borderRadius: 16,
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: 8,
            shadowColor: "#2DAAFF",
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.24,
            shadowRadius: 14,
            elevation: 7,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "800",
            textTransform: "uppercase",
            letterSpacing: 0.3,
        },
    });
}
