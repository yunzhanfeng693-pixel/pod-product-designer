import { StateStorage } from 'zustand/middleware'

const DB_NAME = 'product-composite-db'
const STORE_NAME = 'key-value-store'

// 存储大小限制（50MB）
const MAX_STORAGE_SIZE = 50 * 1024 * 1024
const pendingWrites = new Map<string, { value: string, timer: ReturnType<typeof setTimeout> }>()

const getDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

export const indexedDBStorage: StateStorage = {
  getItem: async (name: string): Promise<string | null> => {
    try {
      const db = await getDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const store = tx.objectStore(STORE_NAME)
        const request = store.get(name)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const result = request.result
          if (result) {
            console.log(`从 IndexedDB 读取 ${name}:`, (result.length / 1024).toFixed(2) + ' KB')
          }
          resolve(result ?? null)
        }
      })
    } catch (err) {
      console.error('IndexedDB getItem 错误:', err)
      return null
    }
  },
  setItem: async (name: string, value: string): Promise<void> => {
    const pending = pendingWrites.get(name)
    if (pending) clearTimeout(pending.timer)

    const timer = setTimeout(() => {
      pendingWrites.delete(name)
      void writeItem(name, value).catch((err) => {
        console.error('延迟写入 IndexedDB 失败:', err)
      })
    }, 300)
    pendingWrites.set(name, { value, timer })
  },
  removeItem: async (name: string): Promise<void> => {
    const pending = pendingWrites.get(name)
    if (pending) {
      clearTimeout(pending.timer)
      pendingWrites.delete(name)
    }
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.delete(name)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
}

const writeItem = async (name: string, value: string): Promise<void> => {
  try {
      const sizeInBytes = new Blob([value]).size
      console.log(`准备存储到 IndexedDB: ${name}, 大小: ${(sizeInBytes / 1024).toFixed(2)} KB`)

      if (sizeInBytes > MAX_STORAGE_SIZE) {
        console.warn(`数据大小 ${(sizeInBytes / 1024).toFixed(2)} KB 超过限制 ${MAX_STORAGE_SIZE / 1024 / 1024} MB，可能存储失败`)
      }

      const db = await getDB()
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        const request = store.put(value, name)
        request.onerror = () => {
          console.error('IndexedDB setItem 错误:', request.error)
          reject(request.error)
        }
        request.onsuccess = () => {
          console.log(`成功存储到 IndexedDB: ${name}`)
          resolve()
        }
      })
  } catch (err) {
    console.error('IndexedDB setItem 异常:', err)
    throw err
  }
}

export const saveDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.put(handle, 'design-folder-handle')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export const loadDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const request = store.get('design-folder-handle')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  } catch {
    return null
  }
}

export const clearDirectoryHandle = async (): Promise<void> => {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const request = store.delete('design-folder-handle')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export const saveBackupDirectoryHandle = async (handle: FileSystemDirectoryHandle): Promise<void> => {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const request = tx.objectStore(STORE_NAME).put(handle, 'backup-folder-handle')
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export const loadBackupDirectoryHandle = async (): Promise<FileSystemDirectoryHandle | null> => {
  try {
    const db = await getDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const request = tx.objectStore(STORE_NAME).get('backup-folder-handle')
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result ?? null)
    })
  } catch {
    return null
  }
}
