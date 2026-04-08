import { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAppTheme } from "../context/ThemeContext";

export default function SplashScreen() {
    const { palette, isDark } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    const pulse = useRef(new Animated.Value(0)).current;
    const shimmer = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const pulseLoop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulse, {
                    toValue: 1,
                    duration: 1400,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
                Animated.timing(pulse, {
                    toValue: 0,
                    duration: 1400,
                    easing: Easing.inOut(Easing.quad),
                    useNativeDriver: true,
                }),
            ]),
        );

        const shimmerLoop = Animated.loop(
            Animated.timing(shimmer, {
                toValue: 1,
                duration: 1800,
                easing: Easing.inOut(Easing.cubic),
                useNativeDriver: true,
            }),
        );

        pulseLoop.start();
        shimmerLoop.start();

        return () => {
            pulseLoop.stop();
            shimmerLoop.stop();
        };
    }, [pulse, shimmer]);

    const haloScale = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [1, 1.22],
    });

    const haloOpacity = pulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.16, 0.34],
    });

    const progressX = shimmer.interpolate({
        inputRange: [0, 1],
        outputRange: [-130, 130],
    });

    return (
        <View style={styles.container}>
            <StatusBar style={isDark ? "light" : "dark"} />

            <View style={styles.backgroundOrbTop} />
            <View style={styles.backgroundOrbBottom} />

            <View style={styles.centerBlock}>
                <Animated.View
                    style={[
                        styles.logoHalo,
                        {
                            transform: [{ scale: haloScale }],
                            opacity: haloOpacity,
                        },
                    ]}
                />

                <View style={styles.logoCore}>
                    <Text style={styles.logoSpark}>✦</Text>
                </View>

                <Text style={styles.brand}>Wuloye</Text>
                <Text style={styles.tagline}>
                    YOUR PLACES, YOUR HABITS, SMARTER EVERY DAY
                </Text>
            </View>

            <View style={styles.footer}>
                <View style={styles.progressTrack}>
                    <Animated.View
                        style={[
                            styles.progressGlow,
                            {
                                transform: [{ translateX: progressX }],
                            },
                        ]}
                    />
                </View>
                <Text style={styles.syncText}>Synchronizing profile</Text>
            </View>
        </View>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        container: {
            flex: 1,
            backgroundColor: palette.pageTop,
            justifyContent: "space-between",
            overflow: "hidden",
        },
        backgroundOrbTop: {
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: 150,
            backgroundColor: "#2BC97F",
            opacity: 0.12,
            top: -80,
            left: -60,
        },
        backgroundOrbBottom: {
            position: "absolute",
            width: 360,
            height: 360,
            borderRadius: 180,
            backgroundColor: "#2DA6E7",
            opacity: 0.16,
            bottom: -160,
            right: -120,
        },
        centerBlock: {
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
        },
        logoHalo: {
            position: "absolute",
            width: 84,
            height: 84,
            borderRadius: 42,
            backgroundColor: "#2DB982",
        },
        logoCore: {
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: "rgba(255,255,255,0.76)",
            borderWidth: 1,
            borderColor: "rgba(15, 124, 199, 0.26)",
            alignItems: "center",
            justifyContent: "center",
        },
        logoSpark: {
            color: palette.oceanBlue,
            fontSize: 24,
            lineHeight: 24,
            marginTop: -2,
        },
        brand: {
            marginTop: 28,
            color: palette.textPrimary,
            fontSize: 50,
            fontWeight: "800",
            letterSpacing: 0.2,
        },
        tagline: {
            marginTop: 14,
            color: palette.textSecondary,
            fontSize: 12,
            letterSpacing: 1.5,
            fontWeight: "600",
            textAlign: "center",
            maxWidth: 300,
            lineHeight: 20,
        },
        footer: {
            paddingHorizontal: 34,
            paddingBottom: 48,
        },
        progressTrack: {
            height: 4,
            borderRadius: 999,
            backgroundColor: palette.borderSoft,
            overflow: "hidden",
        },
        progressGlow: {
            width: 120,
            height: 4,
            borderRadius: 999,
            backgroundColor: palette.oceanBlue,
            shadowColor: palette.oceanBlue,
            shadowOpacity: 0.8,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 0 },
        },
        syncText: {
            marginTop: 14,
            color: palette.textMuted,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.1,
            textAlign: "center",
        },
    });
}
