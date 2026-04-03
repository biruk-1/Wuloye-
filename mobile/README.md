# Attendex Mobile (Expo + React Native)

This app is initialized with Expo using JavaScript and prepared as a clean foundation for the Wuloye mobile frontend.

## Current Foundation

- Expo React Native app scaffold (JavaScript)
- Navigation stack configured in [src/navigation/AppNavigator.js](src/navigation/AppNavigator.js)
- Auth token storage/context in [src/context/AuthContext.js](src/context/AuthContext.js)
- Axios client with auth interceptor in [src/api/client.js](src/api/client.js)
- API modules for profile/routine/interactions/recommendations in [src/api](src/api)
- Base folder structure under [src](src)

## Required Dependencies

```bash
npm install axios
npm install @react-navigation/native
npm install @react-navigation/native-stack
npx expo install react-native-screens react-native-safe-area-context
npx expo install expo-location
```

## Configure Backend URL

Update [src/utils/constants.js](src/utils/constants.js) and replace `YOUR_LOCAL_IP`:

```js
export const API_BASE_URL = "http://YOUR_LOCAL_IP:5000/api";
```

Example: `http://192.168.1.10:5000/api`

## Run the App

```bash
npm install
npm run start
```
