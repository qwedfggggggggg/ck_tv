/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { Favorite, IStorage, PlayRecord, SkipConfig } from './types';
import { LocalStorage } from './local.db';

const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'd1'
    | 'upstash'
    | undefined) || 'localstorage';

let storageInstance: IStorage | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StorageConstructor = new (...args: any[]) => IStorage;

async function loadStorageModule(name: string): Promise<StorageConstructor> {
  switch (name) {
    case 'redis': {
      // @ts-expect-error dynamic import - module exists at runtime
      const mod = await import('./redis.db');
      return mod.RedisStorage;
    }
    case 'upstash': {
      // @ts-expect-error dynamic import - module exists at runtime
      const mod = await import('./upstash.db');
      return mod.UpstashRedisStorage;
    }
    case 'd1': {
      // @ts-expect-error dynamic import - module exists at runtime
      const mod = await import('./d1.db');
      return mod.D1Storage;
    }
    default:
      return LocalStorage;
  }
}

export async function getStorage(): Promise<IStorage> {
  if (!storageInstance) {
    const Ctor = await loadStorageModule(STORAGE_TYPE);
    storageInstance = new Ctor();
  }
  return storageInstance;
}

// 工具函数：生成存储key
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

export class DbManager {
  private storage: IStorage | null = null;
  private storagePromise: Promise<IStorage> | null = null;

  private async ensureStorage(): Promise<IStorage> {
    if (this.storage) return this.storage;
    if (!this.storagePromise) {
      this.storagePromise = getStorage();
    }
    this.storage = await this.storagePromise;
    return this.storage;
  }

  async getPlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<PlayRecord | null> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    return s.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    await s.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    const s = await this.ensureStorage();
    return s.getAllPlayRecords(userName);
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    await s.deletePlayRecord(userName, key);
  }

  async getFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<Favorite | null> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    return s.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    await s.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    const s = await this.ensureStorage();
    return s.getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const key = generateStorageKey(source, id);
    const s = await this.ensureStorage();
    await s.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  async registerUser(userName: string, password: string): Promise<void> {
    const s = await this.ensureStorage();
    await s.registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    const s = await this.ensureStorage();
    return s.verifyUser(userName, password);
  }

  async checkUserExist(userName: string): Promise<boolean> {
    const s = await this.ensureStorage();
    return s.checkUserExist(userName);
  }

  async getSearchHistory(userName: string): Promise<string[]> {
    const s = await this.ensureStorage();
    return s.getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    const s = await this.ensureStorage();
    await s.addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    const s = await this.ensureStorage();
    await s.deleteSearchHistory(userName, keyword);
  }

  async getAllUsers(): Promise<string[]> {
    const s = await this.ensureStorage();
    if (typeof (s as any).getAllUsers === 'function') {
      return (s as any).getAllUsers();
    }
    return [];
  }

  async getAdminConfig(): Promise<AdminConfig | null> {
    const s = await this.ensureStorage();
    if (typeof (s as any).getAdminConfig === 'function') {
      return (s as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    const s = await this.ensureStorage();
    if (typeof (s as any).setAdminConfig === 'function') {
      await (s as any).setAdminConfig(config);
    }
  }

  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const s = await this.ensureStorage();
    if (typeof (s as any).getSkipConfig === 'function') {
      return (s as any).getSkipConfig(userName, source, id);
    }
    return null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    const s = await this.ensureStorage();
    if (typeof (s as any).setSkipConfig === 'function') {
      await (s as any).setSkipConfig(userName, source, id, config);
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const s = await this.ensureStorage();
    if (typeof (s as any).deleteSkipConfig === 'function') {
      await (s as any).deleteSkipConfig(userName, source, id);
    }
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const s = await this.ensureStorage();
    if (typeof (s as any).getAllSkipConfigs === 'function') {
      return (s as any).getAllSkipConfigs(userName);
    }
    return {};
  }
}

// 导出默认实例
export const db = new DbManager();
