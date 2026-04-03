import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import Loader from "../components/Loader";
import { getProfile } from "../api/profileApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";

function formatLabel(value) {
    if (!value || typeof value !== "string") {
        return "Not set";
    }

    return value.charAt(0).toUpperCase() + value.slice(1);
}

export default function ProfileScreen({ navigation }) {
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
                colors={["#0B1529", "#071326", "#050A17"]}
                style={styles.screen}
            >
                <View style={styles.headerRow}>
                    <Text style={styles.greeting}>
                        Good morning, {displayName}
                    </Text>
                    <Pressable style={styles.bellWrap}>
                        <Ionicons
                            name="notifications-outline"
                            size={18}
                            color="#D3DEEF"
                        />
                    </Pressable>
                </View>

                <View style={styles.profileCard}>
                    <View style={styles.avatar}>
                        <Ionicons name="person" size={36} color="#1D1D1D" />
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

                    <Pressable
                        style={styles.primaryBtn}
                        onPress={() => navigation.navigate("ProfileSetup")}
                    >
                        <Text style={styles.primaryBtnText}>
                            Edit preferences
                        </Text>
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
                            color="#B4C3D9"
                        />
                        <Text style={styles.logoutText}>Log out</Text>
                    </Pressable>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: "#050A17" },
    screen: { flex: 1, paddingHorizontal: 16 },
    headerRow: {
        marginTop: 2,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    greeting: {
        color: "#F7C72C",
        fontSize: 13,
        fontWeight: "800",
    },
    bellWrap: {
        width: 34,
        height: 34,
        borderRadius: 17,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
        alignItems: "center",
        justifyContent: "center",
    },
    profileCard: {
        marginTop: 14,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.04)",
        padding: 16,
    },
    avatar: {
        width: 76,
        height: 76,
        borderRadius: 38,
        backgroundColor: "#F7C72C",
        alignSelf: "center",
        alignItems: "center",
        justifyContent: "center",
    },
    name: {
        marginTop: 10,
        color: "#EFF4FD",
        fontSize: 28,
        textAlign: "center",
        fontWeight: "800",
    },
    meta: {
        marginTop: 4,
        color: "#90A5C4",
        textAlign: "center",
        fontSize: 12,
    },
    errorText: {
        marginTop: 8,
        color: "#F7B2B2",
        fontSize: 12,
        textAlign: "center",
    },
    sectionBlock: {
        marginTop: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "rgba(0,0,0,0.14)",
        padding: 12,
    },
    label: {
        color: "#9EB2CD",
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
        backgroundColor: "rgba(247,199,44,0.2)",
        color: "#FBE18A",
        borderWidth: 1,
        borderColor: "rgba(247,199,44,0.5)",
        paddingHorizontal: 10,
        paddingVertical: 5,
        fontSize: 11,
        fontWeight: "700",
    },
    value: {
        marginTop: 6,
        color: "#F0F6FD",
        fontSize: 20,
        fontWeight: "800",
    },
    valueMuted: {
        marginTop: 6,
        color: "#9BB0CC",
        fontSize: 12,
    },
    primaryBtn: {
        marginTop: 16,
        height: 50,
        borderRadius: 14,
        backgroundColor: "#F7C72C",
        alignItems: "center",
        justifyContent: "center",
    },
    primaryBtnText: {
        color: "#1D1D1D",
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
        color: "#B4C3D9",
        fontSize: 14,
        fontWeight: "600",
    },
});
