import AsyncStorage from '@react-native-async-storage/async-storage';

const FIREBASE_TOKEN_KEY = '@attendex/firebase_id_token';

export async function getFirebaseToken() {
  return AsyncStorage.getItem(FIREBASE_TOKEN_KEY);
}

export async function setFirebaseToken(token) {
  if (token == null || token === '') {
    return AsyncStorage.removeItem(FIREBASE_TOKEN_KEY);
  }
  return AsyncStorage.setItem(FIREBASE_TOKEN_KEY, token);
}

export async function clearFirebaseToken() {
  return AsyncStorage.removeItem(FIREBASE_TOKEN_KEY);
}
