import { Pressable, StyleSheet, Text, View } from "react-native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useMemo } from "react";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import PlaceDetailScreen from "../screens/PlaceDetailScreen";
import SplashScreen from "../screens/SplashScreen";
import RoutineBuilderScreen from "../screens/RoutineBuilderScreen";
import MainTabs from "./MainTabs";
import { useAppTheme } from "../context/ThemeContext";

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
function ProfileErrorScreen({ onRetry, onSignOut, message, palette, styles }) {
    return (
        <View style={styles.container}>
            <View style={styles.iconWrap}>
                <Ionicons
                    name="cloud-offline-outline"
                    size={46}
                    color={palette.oceanBlue}
                />
            </View>
            <Text style={styles.title}>Could not connect</Text>
            <Text style={styles.body}>
                {message ??
                    "We couldn't reach the server. Check your connection and try again."}
            </Text>
            <Pressable style={styles.retryBtn} onPress={onRetry}>
                <Text style={styles.retryText}>Retry</Text>
            </Pressable>
            <Pressable style={styles.signOutBtn} onPress={onSignOut}>
                <Text style={styles.signOutText}>Sign out</Text>
            </Pressable>
        </View>
    );
}

// ─── Navigator ────────────────────────────────────────────────────────────────

export default function AppNavigator() {
    const { palette } = useAppTheme();
    const errStyles = useMemo(() => createErrStyles(palette), [palette]);

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
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: palette.pageTop },
                }}
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
                palette={palette}
                styles={errStyles}
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
                contentStyle: { backgroundColor: palette.pageTop },
            }}
        >
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen
                name="RoutineBuilder"
                component={RoutineBuilderScreen}
            />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
            {/* Keep Login in the stack so back-navigation works in edge cases */}
            <Stack.Screen name="Login" component={LoginScreen} />
        </Stack.Navigator>
    );
}

function createErrStyles(palette) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: palette.pageTop,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 32,
        },
        iconWrap: { marginBottom: 20 },
        title: {
            color: palette.textPrimary,
            fontSize: 26,
            fontWeight: "800",
            textAlign: "center",
        },
        body: {
            marginTop: 10,
            color: palette.textSecondary,
            fontSize: 15,
            lineHeight: 22,
            textAlign: "center",
        },
        retryBtn: {
            marginTop: 28,
            width: "100%",
            height: 52,
            borderRadius: 14,
            backgroundColor: palette.oceanBlue,
            alignItems: "center",
            justifyContent: "center",
        },
        retryText: {
            color: palette.iceWhite,
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
            color: palette.textMuted,
            fontSize: 13,
        },
    });
}
