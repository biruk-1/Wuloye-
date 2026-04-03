import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { useAuth } from "../context/AuthContext";
import LoginScreen from "../screens/LoginScreen";
import ProfileSetupScreen from "../screens/ProfileSetupScreen";
import PlaceDetailScreen from "../screens/PlaceDetailScreen";
import SplashScreen from "../screens/SplashScreen";
import RoutineBuilderScreen from "../screens/RoutineBuilderScreen";
import MainTabs from "./MainTabs";

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
    const { token, ready } = useAuth();

    if (!ready) {
        return <SplashScreen />;
    }

    return (
        <Stack.Navigator
            initialRouteName={token ? "MainTabs" : "Login"}
            screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#050B17" },
            }}
        >
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
            <Stack.Screen
                name="RoutineBuilder"
                component={RoutineBuilderScreen}
            />
            <Stack.Screen name="MainTabs" component={MainTabs} />
            <Stack.Screen name="PlaceDetail" component={PlaceDetailScreen} />
        </Stack.Navigator>
    );
}
