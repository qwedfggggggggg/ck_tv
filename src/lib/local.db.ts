/* eslint-disable @typescript-eslint/no-explicit-any */

import { AdminConfig } from './admin.types';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';

const SEARCH_HISTORY_LIMIT = 20;

const playRecords = new globalThis.Map<string, Map<string, PlayRecord>>();
const favorites = new globalThis.Map<string, Map<string, Favorite>>();
const users = new globalThis.Map<string, string>();
const searchHistory = new globalThis.Map<string, string[]>();
const adminConfig = new globalThis.Map<number, AdminConfig>();
const skipConfigs = new globalThis.Map<string, Map<string, SkipConfig>>();

export class LocalStorage implements IStorage {
  async getPlayRecord(userName: string, key: string): Promise<PlayRecord | null> {
    const userRecords = playRecords.get(userName);
    if (!userRecords) return null;
    return userRecords.get(key) || null;
  }

  async setPlayRecord(userName: string, key: string, record: PlayRecord): Promise<void> {
    if (!playRecords.has(userName)) {
      playRecords.set(userName, new Map());
    }
    playRecords.get(userName)!.set(key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{ [key: string]: PlayRecord }> {
    const userRecords = playRecords.get(userName);
    if (!userRecords) return {};
    const result: { [key: string]: PlayRecord } = {};
    userRecords.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  async deletePlayRecord(userName: string, key: string): Promise<void> {
    const userRecords = playRecords.get(userName);
    if (userRecords) {
      userRecords.delete(key);
    }
  }

  async getFavorite(userName: string, key: string): Promise<Favorite | null> {
    const userFavs = favorites.get(userName);
    if (!userFavs) return null;
    return userFavs.get(key) || null;
  }

  async setFavorite(userName: string, key: string, favorite: Favorite): Promise<void> {
    if (!favorites.has(userName)) {
      favorites.set(userName, new Map());
    }
    favorites.get(userName)!.set(key, favorite);
  }

  async getAllFavorites(userName: string): Promise<{ [key: string]: Favorite }> {
    const userFavs = favorites.get(userName);
    if (!userFavs) return {};
    const result: { [key: string]: Favorite } = {};
    userFavs.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  async deleteFavorite(userName: string, key: string): Promise<void> {
    const userFavs = favorites.get(userName);
    if (userFavs) {
      userFavs.delete(key);
    }
  }

  async registerUser(userName: string, password: string): Promise<void> {
    users.set(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const stored = users.get(userName);
    return stored === password;
  }

  async checkUserExist(userName: string): Promise<boolean> {
    return users.has(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    users.set(userName, newPassword);
  }

  async deleteUser(userName: string): Promise<void> {
    users.delete(userName);
    playRecords.delete(userName);
    favorites.delete(userName);
    searchHistory.delete(userName);
    skipConfigs.delete(userName);
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    return searchHistory.get(userName) || [];
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const history = searchHistory.get(userName) || [];
    const filtered = history.filter((k) => k !== keyword);
    filtered.unshift(keyword);
    if (filtered.length > SEARCH_HISTORY_LIMIT) {
      filtered.length = SEARCH_HISTORY_LIMIT;
    }
    searchHistory.set(userName, filtered);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    if (keyword) {
      const history = searchHistory.get(userName) || [];
      searchHistory.set(userName, history.filter((k) => k !== keyword));
    } else {
      searchHistory.delete(userName);
    }
  }

  async getAllUsers(): Promise<string[]> {
    return Array.from(users.keys());
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    return adminConfig.get(1) || null;
  }

  async setAdminConfig(config: AdminConfig): Promise<void> {
    adminConfig.set(1, config);
  }

  async getSkipConfig(userName: string, source: string, id: string): Promise<SkipConfig | null> {
    const userConfigs = skipConfigs.get(userName);
    if (!userConfigs) return null;
    const key = `${source}+${id}`;
    return userConfigs.get(key) || null;
  }

  async setSkipConfig(userName: string, source: string, id: string, config: SkipConfig): Promise<void> {
    if (!skipConfigs.has(userName)) {
      skipConfigs.set(userName, new Map());
    }
    skipConfigs.get(userName)!.set(`${source}+${id}`, config);
  }

  async deleteSkipConfig(userName: string, source: string, id: string): Promise<void> {
    const userConfigs = skipConfigs.get(userName);
    if (userConfigs) {
      userConfigs.delete(`${source}+${id}`);
    }
  }

  async getAllSkipConfigs(userName: string): Promise<{ [key: string]: SkipConfig }> {
    const userConfigs = skipConfigs.get(userName);
    if (!userConfigs) return {};
    const result: { [key: string]: SkipConfig } = {};
    userConfigs.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }
}
