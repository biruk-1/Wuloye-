import { useState } from "react";
import {
    Alert,
    Image,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import { getProfile } from "../api/profileApi";
import { getApiErrorMessage, unwrapApiData } from "../utils/api";

function AuthButton({ label, icon, onPress, primary = false }) {
    return (
        <Pressable
            onPress={onPress}
            style={[styles.buttonBase, primary && styles.primaryButton]}
        >
            {icon ? (
                <Ionicons
                    name={icon}
                    size={17}
                    color={primary ? "#1E1E1E" : "#E9EDF5"}
                />
            ) : null}
            <Text
                style={[styles.buttonText, primary && styles.primaryButtonText]}
            >
                {label}
            </Text>
        </Pressable>
    );
}

export default function LoginScreen({ navigation }) {
    const { setFirebaseToken } = useAuth();
    const [idToken, setIdToken] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function continueWithToken() {
        const trimmed = idToken.trim();
        if (!trimmed) {
            Alert.alert(
                "Token required",
                "Paste your Firebase ID token first.",
            );
            return;
        }

        try {
            setSubmitting(true);
            await setFirebaseToken(trimmed);
            const profileEnvelope = await getProfile();
            const profile = unwrapApiData(profileEnvelope, {});
            const interests = profile?.interests;
            const hasInterests =
                Array.isArray(interests) && interests.length > 0;

            if (hasInterests) {
                navigation.replace("MainTabs");
                return;
            }

            navigation.replace("ProfileSetup");
        } catch (error) {
            await setFirebaseToken(null);
            Alert.alert(
                "Login failed",
                getApiErrorMessage(error, "Invalid token."),
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <LinearGradient
                colors={["#0B1529", "#071326", "#050A17"]}
                style={styles.screen}
            >
                <View style={styles.heroGlowA} />
                <View style={styles.heroGlowB} />

                <Text style={styles.title}>
                    Welcome to <Text style={styles.titleAccent}>Wuloye</Text>
                </Text>
                <Text style={styles.subtitle}>
                    Curated discovery for the discerning traveler.
                </Text>

                <LinearGradient
                    colors={["#1A2130", "#111B2D"]}
                    style={styles.visualCard}
                >
                    <Image
                        source={require("../../assets/originaal.png")}
                        style={styles.visualImage}
                        resizeMode="cover"
                    />
                </LinearGradient>

                <AuthButton
                    label="Continue with Google"
                    icon="logo-google"
                    onPress={continueWithToken}
                />
                <AuthButton
                    label="Continue with Apple"
                    icon="logo-apple"
                    onPress={continueWithToken}
                />

                <View style={styles.dividerRow}>
                    <View style={styles.divider} />
                    <Text style={styles.dividerText}>or</Text>
                    <View style={styles.divider} />
                </View>

                <AuthButton
                    label={submitting ? "Verifying..." : "Continue with Email"}
                    primary
                    onPress={continueWithToken}
                />

                <View style={styles.tokenBlock}>
                    <Text style={styles.tokenLabel}>Firebase ID token</Text>
                    <TextInput
                        value={idToken}
                        onChangeText={setIdToken}
                        style={styles.tokenInput}
                        placeholder="Paste token for backend auth"
                        placeholderTextColor="#7084A7"
                        autoCapitalize="none"
                        autoCorrect={false}
                    />
                </View>

                <View style={styles.bottomBlock}>
                    <Text style={styles.switchText}>
                        Don't have an account?{" "}
                        <Text style={styles.switchLink}>Sign up</Text>
                    </Text>
                    <Text style={styles.legalText}>Terms of Service</Text>
                    <Text style={styles.legalText}>Privacy Policy</Text>
                </View>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: "#050A17",
    },
    tokenBlock: {
        marginTop: 12,
        gap: 6,
    },
    tokenLabel: {
        color: "#92A7C7",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        fontWeight: "700",
    },
    tokenInput: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.05)",
        color: "#EAF0FA",
        paddingHorizontal: 12,
        fontSize: 12,
    },
    screen: {
        flex: 1,
        paddingHorizontal: 22,
        paddingTop: 18,
    },
    heroGlowA: {
        position: "absolute",
        width: 240,
        height: 240,
        borderRadius: 120,
        backgroundColor: "#F7C72C",
        top: -50,
        left: -90,
        opacity: 0.12,
    },
    heroGlowB: {
        position: "absolute",
        width: 230,
        height: 230,
        borderRadius: 115,
        backgroundColor: "#1560D4",
        bottom: 120,
        right: -120,
        opacity: 0.12,
    },
    title: {
        color: "#EAF0FA",
        fontSize: 42,
        fontWeight: "800",
        lineHeight: 50,
    },
    titleAccent: {
        color: "#F7C72C",
    },
    subtitle: {
        marginTop: 8,
        color: "#9AACC9",
        fontSize: 18,
        lineHeight: 27,
    },
    visualCard: {
        marginTop: 22,
        borderRadius: 26,
        height: 190,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        overflow: "hidden",
        justifyContent: "center",
        alignItems: "center",
    },
    visualImage: {
        width: "86%",
        height: "86%",
        borderRadius: 20,
        transform: [{ rotate: "-7deg" }],
    },
    buttonBase: {
        marginTop: 12,
        height: 54,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
        backgroundColor: "rgba(255,255,255,0.04)",
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
    },
    primaryButton: {
        marginTop: 18,
        borderColor: "#F7C72C",
        backgroundColor: "#F7C72C",
        shadowColor: "#F7C72C",
        shadowOffset: { width: 0, height: 8 },
        shadowRadius: 16,
        shadowOpacity: 0.34,
        elevation: 6,
    },
    buttonText: {
        color: "#E7EDF8",
        fontSize: 16,
        fontWeight: "700",
    },
    primaryButtonText: {
        color: "#1E1E1E",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        fontSize: 14,
    },
    dividerRow: {
        marginTop: 18,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    divider: {
        flex: 1,
        height: 1,
        backgroundColor: "rgba(255,255,255,0.15)",
    },
    dividerText: {
        color: "#8EA2C2",
        textTransform: "uppercase",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 1,
    },
    bottomBlock: {
        marginTop: 18,
        alignItems: "center",
        gap: 8,
    },
    switchText: {
        color: "#B8C7DF",
        fontSize: 15,
    },
    switchLink: {
        color: "#F7C72C",
        fontWeight: "700",
        textDecorationLine: "underline",
    },
    legalText: {
        color: "#6E82A6",
        fontSize: 12,
    },
});
