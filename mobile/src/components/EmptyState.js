import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useMemo } from "react";
import { useAppTheme } from "../context/ThemeContext";

export default function EmptyState({
    message = "No data yet.",
    ctaLabel,
    onPress,
}) {
    const { palette, gradients } = useAppTheme();
    const styles = useMemo(() => createStyles(palette), [palette]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Nothing here yet</Text>
            <Text style={styles.message}>{message}</Text>
            {ctaLabel ? (
                <Pressable style={styles.ctaWrap} onPress={onPress}>
                    <LinearGradient
                        colors={gradients.primaryButton}
                        style={styles.cta}
                    >
                        <Text style={styles.ctaText}>{ctaLabel}</Text>
                    </LinearGradient>
                </Pressable>
            ) : null}
        </View>
    );
}

function createStyles(palette) {
    return StyleSheet.create({
        container: {
            marginTop: 16,
            padding: 24,
            borderRadius: 20,
            borderWidth: 1,
            borderColor: palette.borderStrong,
            backgroundColor: palette.surface,
            alignItems: "center",
        },
        title: {
            color: palette.textPrimary,
            fontSize: 18,
            fontWeight: "800",
        },
        message: {
            marginTop: 8,
            color: palette.textSecondary,
            textAlign: "center",
            lineHeight: 20,
        },
        ctaWrap: {
            marginTop: 16,
            borderRadius: 14,
            overflow: "hidden",
        },
        cta: {
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 10,
        },
        ctaText: {
            color: palette.iceWhite,
            fontWeight: "700",
            fontSize: 12,
        },
    });
}
