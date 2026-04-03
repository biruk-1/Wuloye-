import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

export default function PlaceCard({ place, onPress, onSave, onDismiss }) {
    return (
        <Pressable onPress={onPress} style={styles.wrapper}>
            <LinearGradient
                colors={["#0B1B34", "#0A1430", "#071326"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.card}
            >
                <View style={styles.badgesRow}>
                    <View style={styles.typeBadge}>
                        <Text style={styles.typeBadgeText}>
                            {place?.type ?? "Cafe"}
                        </Text>
                    </View>
                    <View style={styles.scoreBadge}>
                        <Text style={styles.scoreText}>
                            {place?.score ?? "92% match"}
                        </Text>
                    </View>
                </View>

                <Text style={styles.title}>{place?.name ?? "Place name"}</Text>
                <Text style={styles.description} numberOfLines={2}>
                    {place?.description ??
                        "Premium venue with modern atmosphere and strong community vibe."}
                </Text>

                <View style={styles.footerRow}>
                    <Text style={styles.distance}>
                        {place?.distance ?? "1.1 miles away"}
                    </Text>
                    <View style={styles.actions}>
                        <Pressable onPress={onSave} hitSlop={8}>
                            <Ionicons
                                name="heart-outline"
                                size={16}
                                color="#D4DCE9"
                            />
                        </Pressable>
                        <Pressable onPress={onDismiss} hitSlop={8}>
                            <Ionicons name="close" size={16} color="#D4DCE9" />
                        </Pressable>
                    </View>
                </View>
            </LinearGradient>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        marginBottom: 14,
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        padding: 16,
    },
    badgesRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    typeBadge: {
        backgroundColor: "rgba(247,199,44,0.16)",
        borderColor: "rgba(247,199,44,0.55)",
        borderWidth: 1,
        borderRadius: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
    },
    typeBadgeText: {
        color: "#F7C72C",
        fontSize: 11,
        fontWeight: "700",
        letterSpacing: 0.3,
    },
    scoreBadge: {
        backgroundColor: "rgba(247,199,44,0.2)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 5,
    },
    scoreText: {
        color: "#FBE086",
        fontSize: 11,
        fontWeight: "700",
    },
    title: {
        marginTop: 14,
        color: "#F4F7FD",
        fontSize: 26,
        fontWeight: "800",
    },
    description: {
        marginTop: 6,
        color: "#8EA3C2",
        fontSize: 13,
        lineHeight: 19,
    },
    footerRow: {
        marginTop: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    distance: {
        color: "#B6C5DC",
        fontSize: 12,
        fontWeight: "600",
    },
    actions: {
        flexDirection: "row",
        gap: 12,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
});
