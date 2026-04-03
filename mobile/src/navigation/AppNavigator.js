import { Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import PlaceDetailScreen from "../screens/PlaceDetailScreen";
import SplashScreen from "../screens/SplashScreen";
import RoutineBuilderScreen from "../screens/RoutineBuilderScreen";
import MainTabs from "./MainTabs";

const Stack = createNativeStackNavigator();

/** User has interests → they completed onboarding. */
function hasCompletedOnboarding(profile) {
    const interests = profile?.interests;
    return Array.isArray(interests) && interests.length > 0;
}

/**
 * Shown when the app is authenticated but GET /api/profile failed (network error,
 * server unreachable, etc.). Allows the user to retry or sign out.
 */
function ProfileErrorScreen({ onRetry, onSignOut, message }) {
    return (
        <View style={errStyles.container}>
            <View style={errStyles.iconWrap}>
                <Ionicons name="cloud-offline-outline" size={46} color="#F7C72C" />
            </View>
            <Text style={errStyles.title}>Could not connect</Text>
            <Text style={errStyles.body}>
                {message ?? "We couldn't reach the server. Check your connection and try again."}
            </Text>
            <Pressable style={errStyles.retryBtn} onPress={onRetry}>
                <Text style={errStyles.retryText}>Retry</Text>
            </Pressable>
            <Pressable style={errStyles.signOutBtn} onPress={onSignOut}>
                <Text style={errStyles.signOutText}>Sign out</Text>
            </Pressable>
        </View>
    );
}

const errStyles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#050A17",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 32,
    },
    iconWrap: { marginBottom: 20 },
    title: {
        color: "#EAF0FA",
        fontSize: 26,
        fontWeight: "800",
        textAlign: "center",
    },
    body: {
        marginTop: 10,
        color: "#8EA2C2",
        fontSize: 15,
        lineHeight: 22,
        textAlign: "center",
    },
    retryBtn: {
        marginTop: 28,
        width: "100%",
        height: 52,
        borderRadius: 14,
        backgroundColor: "#F7C72C",
        alignItems: "center",
        justifyContent: "center",
    },
    retryText: {
        color: "#1E1E1E",
        fontWeight: "800",
        fontSize: 15,
        textTransform: "uppercase",
        letterSpacing: 0.5,
    },
    signOutBtn: {
        marginTop: 14,
        padding: 10,
    },
    signOutText: {
        color: "#6E82A6",
        fontSize: 13,
    },
});

// ─── Navigator ────────────────────────────────────────────────────────────────

export default function AppNavigator() {
    const { user, ready, profile, profileError, retryProfileLoad, clearAuth } =
        useAuth();

    // ── 1. Not bootstrapped yet → splash ──────────────────────────────────
    if (!ready) {
        return <SplashScreen />;
    }

    // ── 2. Not signed in → Login ──────────────────────────────────────────
    if (!user) {
        return (
            <Stack.Navigator
                screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#050B17" } }}
            >
                <Stack.Screen name="Login" component={LoginScreen} />
            </Stack.Navigator>
        );
    }

    // ── 3. Signed in but profile failed to load (network / server error) ──
    if (profileError) {
        return (
            <ProfileErrorScreen
                message={profileError}
                onRetry={retryProfileLoad}
                onSignOut={clearAuth}
            />
        );
    }

    // ── 4. Signed in + profile loaded → decide which stack to start on ───

    const onboarded = hasCompletedOnboarding(profile);
    const initialRouteName = onboarded ? "MainTabs" : "ProfileSetup";

    return (
        <Stack.Navigator
            /**
             * key = uid so the stack is fully remounted on account switch.
             * Do NOT include onboarding state in the key — it would remount the
             * stack (and skip RoutineBuilder) whenever the profile is saved.
             */
            key={user.uid}
            initialRouteName={initialRouteName}
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#050B17" },
            }}
        >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen name="RoutineBuilder" component={RoutineBuilderScreen} />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
            {/* Keep Login in the stack so back-navigation works in edge cases */}
            <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
    );
}
