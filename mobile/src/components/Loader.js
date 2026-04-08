import { ActivityIndicator, StyleSheet, View } from "react-native";
import { useAppTheme } from "../context/ThemeContext";

export default function Loader() {
    const { palette } = useAppTheme();

    return (
        <View style={styles.container}>
            <ActivityIndicator size="small" color={palette.oceanBlue} />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        paddingVertical: 20,
        alignItems: "center",
    },
});
