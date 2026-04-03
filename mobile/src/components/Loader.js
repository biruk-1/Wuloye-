import { ActivityIndicator, StyleSheet, View } from "react-native";

export default function Loader() {
    return (
        <View style={styles.container}>
            <ActivityIndicator size="small" color="#F7C72C" />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 20,
        alignItems: "center",
    },
});
