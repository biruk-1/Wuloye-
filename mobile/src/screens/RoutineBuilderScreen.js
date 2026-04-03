import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Loader from "../components/Loader";
import { createRoutine, deleteRoutine, getRoutines } from "../api/routineApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";

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
                colors={["#0A1328", "#071326", "#050A17"]}
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
                                    color="#9FB0C9"
                                />
                            </Pressable>
                        </View>
                    ))}
                </ScrollView>

                <Pressable style={styles.fab} onPress={addRoutine}>
                    <Ionicons name="add" size={22} color="#1D1D1D" />
                </Pressable>

                <Pressable
                    style={styles.cta}
                    onPress={() => navigation.replace("MainTabs")}
                >
                    <Text style={styles.ctaText}>
                        Save all & start exploring
                    </Text>
                    <Ionicons name="arrow-forward" size={16} color="#1E1E1E" />
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
        paddingTop: 8,
    },
    step: {
        color: "#A8B6CB",
        fontSize: 11,
        letterSpacing: 1.2,
        textTransform: "uppercase",
        fontWeight: "800",
    },
    progressTrack: {
        marginTop: 8,
        height: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.13)",
        overflow: "hidden",
    },
    progressFill: {
        width: "100%",
        height: "100%",
        backgroundColor: "#F7C72C",
    },
    title: {
        marginTop: 18,
        color: "#F0F5FD",
        fontSize: 42,
        lineHeight: 45,
        fontWeight: "800",
    },
    subtitle: {
        marginTop: 10,
        color: "#93A8C6",
        fontSize: 15,
        lineHeight: 22,
    },
    errorText: {
        marginTop: 10,
        color: "#F7B2B2",
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
        borderColor: "rgba(255,255,255,0.11)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 14,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    cardTitle: {
        color: "#DAE4F5",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        fontWeight: "700",
    },
    cardActivity: {
        marginTop: 6,
        color: "#F7C72C",
        fontSize: 18,
        fontWeight: "800",
    },
    cardMeta: {
        marginTop: 4,
        color: "#9AAECB",
        fontSize: 12,
    },
    fab: {
        position: "absolute",
        right: 20,
        bottom: 94,
        width: 50,
        height: 50,
        borderRadius: 25,
        backgroundColor: "#F7C72C",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#F7C72C",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.34,
        shadowRadius: 14,
        elevation: 6,
    },
    cta: {
        position: "absolute",
        left: 20,
        right: 20,
        bottom: 24,
        height: 54,
        borderRadius: 16,
        backgroundColor: "#F7C72C",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 8,
    },
    ctaText: {
        color: "#202020",
        fontWeight: "800",
        textTransform: "uppercase",
        letterSpacing: 0.3,
    },
});
