import { Pressable, StyleSheet, Text, View } from "react-native";

export default function EmptyState({
    message = "No data yet.",
    ctaLabel,
    onPress,
}) {
    return (
        <View style={styles.container}>
            <Text style={styles.title}>Nothing here yet</Text>
            <Text style={styles.message}>{message}</Text>
            {ctaLabel ? (
                <Pressable style={styles.cta} onPress={onPress}>
                    <Text style={styles.ctaText}>{ctaLabel}</Text>
                </Pressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginTop: 16,
        padding: 24,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "#091930",
        alignItems: "center",
    },
    title: {
        color: "#EAF0FB",
        fontSize: 18,
        fontWeight: "800",
    },
    message: {
        marginTop: 8,
        color: "#9EB0CA",
        textAlign: "center",
        lineHeight: 20,
    },
    cta: {
        marginTop: 16,
        backgroundColor: "#F7C72C",
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    ctaText: {
        color: "#202020",
        fontWeight: "700",
        fontSize: 12,
    },
});
