import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const USER_TOKEN_KEY = "userToken";
export const USER_DATA_KEY = "userData";

/**
 * Utilitário de Armazenamento Seguro Criptografado
 * Utiliza o SecureStore (Keychain no iOS e Keystore no Android).
 * Possui fallback gracioso para localStorage no ambiente Web.
 */
export const secureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
        return;
      }
      await SecureStore.setItemAsync(key, value);
    } catch (error) {
      console.warn(`[secureStorage] Erro ao salvar chave "${key}" no SecureStore:`, error);
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    }
  },

  async getItem(key: string): Promise<string | null> {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          return window.localStorage.getItem(key);
        }
        return null;
      }
      const val = await SecureStore.getItemAsync(key);
      return val;
    } catch (error) {
      console.warn(`[secureStorage] Erro ao buscar chave "${key}" no SecureStore:`, error);
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
      return null;
    }
  },

  async deleteItem(key: string): Promise<void> {
    try {
      if (Platform.OS === "web") {
        if (typeof window !== "undefined" && window.localStorage) {
          window.localStorage.removeItem(key);
        }
        return;
      }
      await SecureStore.deleteItemAsync(key);
    } catch (error) {
      console.warn(`[secureStorage] Erro ao deletar chave "${key}" no SecureStore:`, error);
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    }
  },
};

export default secureStorage;
