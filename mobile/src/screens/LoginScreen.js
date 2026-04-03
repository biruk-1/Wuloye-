import { useEffect, useState } from "react";
import {
    Alert,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Google from "expo-auth-session/providers/google";
import { useAuth } from "../context/AuthContext";
import { GOOGLE_WEB_CLIENT_ID } from "../utils/constants";
import { getApiErrorMessage } from "../utils/api";

function AuthButton({ label, icon, onPress, primary = false, disabled = false }) {
    return (
        <Pressable
            onPress={onPress}
            disabled={disabled}
            style={[
                styles.buttonBase,
                primary && styles.primaryButton,
                disabled && styles.buttonDisabled,
            ]}
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

function GoogleAuthBlock({ disabled, onBusy, signInWithGoogleIdToken }) {
    const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
        webClientId: GOOGLE_WEB_CLIENT_ID,
    });

    useEffect(() => {
        if (response?.type !== "success") {
            return;
        }
        const idToken = response.params?.id_token;
        if (!idToken) {
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                onBusy(true);
                await signInWithGoogleIdToken(idToken);
            } catch (error) {
                if (!cancelled) {
                    Alert.alert(
                        "Google sign-in failed",
                        getApiErrorMessage(error, "Could not complete sign-in."),
                    );
                }
            } finally {
                if (!cancelled) {
                    onBusy(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [response, onBusy, signInWithGoogleIdToken]);

    return (
        <AuthButton
            label="Continue with Google"
            icon="logo-google"
            disabled={disabled || !request}
            onPress={() => {
                promptAsync().catch((error) => {
                    Alert.alert(
                        "Google",
                        getApiErrorMessage(error, "Could not open Google sign-in."),
                    );
                });
            }}
        />
    );
}

export default function LoginScreen() {
    const {
        signInWithEmail,
        signUpWithEmail,
        signInWithGoogleIdToken,
        signInWithApple,
    } = useAuth();

    const [isSignUp, setIsSignUp] = useState(false);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function submitEmailAuth() {
        const trimmedEmail = email.trim();
        if (!trimmedEmail || !password) {
            Alert.alert("Missing fields", "Enter email and password.");
            return;
        }

        if (isSignUp) {
            if (password !== confirmPassword) {
                Alert.alert("Passwords", "Passwords do not match.");
                return;
            }
            if (password.length < 6) {
                Alert.alert(
                    "Password",
                    "Use at least 6 characters (Firebase requirement).",
                );
                return;
            }
        }

        try {
            setSubmitting(true);
            if (isSignUp) {
                await signUpWithEmail(trimmedEmail, password);
            } else {
                await signInWithEmail(trimmedEmail, password);
            }
        } catch (error) {
            Alert.alert(
                isSignUp ? "Sign up failed" : "Sign in failed",
                getApiErrorMessage(
                    error,
                    isSignUp
                        ? "Could not create account."
                        : "Invalid email or password.",
                ),
            );
        } finally {
            setSubmitting(false);
        }
    }

    async function onApplePress() {
        try {
            setSubmitting(true);
            await signInWithApple();
        } catch (error) {
            const code = error?.code;
            if (code === "ERR_REQUEST_CANCELED") {
                return;
            }
            Alert.alert(
                "Apple sign-in failed",
                getApiErrorMessage(error, "Could not complete sign-in."),
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
                <KeyboardAvoidingView
                    style={styles.flex}
                    behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                    <ScrollView
                        keyboardShouldPersistTaps="handled"
                        contentContainerStyle={styles.scrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.heroGlowA} />
                        <View style={styles.heroGlowB} />

                        <Text style={styles.title}>
                            Welcome to{" "}
                            <Text style={styles.titleAccent}>Wuloye</Text>
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

                        {GOOGLE_WEB_CLIENT_ID ? (
                            <GoogleAuthBlock
                                disabled={submitting}
                                onBusy={setSubmitting}
                                signInWithGoogleIdToken={signInWithGoogleIdToken}
                            />
                        ) : (
                            <Text style={styles.hintText}>
                                Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID to enable
                                Google sign-in.
                            </Text>
                        )}

                        {Platform.OS === "ios" ? (
                            <AuthButton
                                label="Continue with Apple"
                                icon="logo-apple"
                                disabled={submitting}
                                onPress={onApplePress}
                            />
                        ) : null}

                        <View style={styles.dividerRow}>
                            <View style={styles.divider} />
                            <Text style={styles.dividerText}>or</Text>
                            <View style={styles.divider} />
                        </View>

                        <View style={styles.emailBlock}>
                            <Text style={styles.fieldLabel}>Email</Text>
                            <TextInput
                                value={email}
                                onChangeText={setEmail}
                                style={styles.fieldInput}
                                placeholder="you@example.com"
                                placeholderTextColor="#7084A7"
                                autoCapitalize="none"
                                autoCorrect={false}
                                keyboardType="email-address"
                                textContentType="emailAddress"
                            />
                            <Text style={styles.fieldLabel}>Password</Text>
                            <TextInput
                                value={password}
                                onChangeText={setPassword}
                                style={styles.fieldInput}
                                placeholder={
                                    isSignUp
                                        ? "At least 6 characters"
                                        : "Your password"
                                }
                                placeholderTextColor="#7084A7"
                                secureTextEntry
                                textContentType={
                                    isSignUp ? "newPassword" : "password"
                                }
                            />
                            {isSignUp ? (
                                <>
                                    <Text style={styles.fieldLabel}>
                                        Confirm password
                                    </Text>
                                    <TextInput
                                        value={confirmPassword}
                                        onChangeText={setConfirmPassword}
                                        style={styles.fieldInput}
                                        placeholder="Repeat password"
                                        placeholderTextColor="#7084A7"
                                        secureTextEntry
                                        textContentType="newPassword"
                                    />
                                </>
                            ) : null}
                        </View>

                        <AuthButton
                            label={
                                submitting
                                    ? "Please wait..."
                                    : isSignUp
                                      ? "Create account"
                                      : "Sign in with email"
                            }
                            primary
                            disabled={submitting}
                            onPress={submitEmailAuth}
                        />

                        <Pressable
                            onPress={() => {
                                setIsSignUp((v) => !v);
                                setConfirmPassword("");
                            }}
                            style={styles.toggleRow}
                        >
                            <Text style={styles.switchText}>
                                {isSignUp
                                    ? "Already have an account? "
                                    : "New here? "}
                                <Text style={styles.switchLink}>
                                    {isSignUp ? "Sign in" : "Create an account"}
                                </Text>
                            </Text>
                        </Pressable>

                        <View style={styles.bottomBlock}>
                            <Text style={styles.legalText}>Terms of Service</Text>
                            <Text style={styles.legalText}>Privacy Policy</Text>
                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    flex: {
        flex: 1,
    },
    scrollContent: {
        paddingHorizontal: 22,
        paddingTop: 18,
        paddingBottom: 32,
    },
    hintText: {
        marginTop: 12,
        color: "#6E82A6",
        fontSize: 12,
        lineHeight: 18,
    },
    safeArea: {
        flex: 1,
        backgroundColor: "#050A17",
    },
    screen: {
        flex: 1,
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
        fontSize: 38,
        fontWeight: "800",
        lineHeight: 46,
    },
    titleAccent: {
        color: "#F7C72C",
    },
    subtitle: {
        marginTop: 8,
        color: "#9AACC9",
        fontSize: 17,
        lineHeight: 25,
    },
    visualCard: {
        marginTop: 22,
        borderRadius: 26,
        height: 170,
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
    buttonDisabled: {
        opacity: 0.55,
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
    emailBlock: {
        marginTop: 8,
        gap: 6,
    },
    fieldLabel: {
        marginTop: 8,
        color: "#92A7C7",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 1,
        fontWeight: "700",
    },
    fieldInput: {
        height: 46,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.14)",
        backgroundColor: "rgba(255,255,255,0.05)",
        color: "#EAF0FA",
        paddingHorizontal: 12,
        fontSize: 15,
    },
    toggleRow: {
        marginTop: 16,
        alignItems: "center",
    },
    bottomBlock: {
        marginTop: 22,
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
