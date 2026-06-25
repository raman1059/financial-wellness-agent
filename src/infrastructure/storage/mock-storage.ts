/**
 * In-memory file store — replaces S3/Supabase Storage for demo.
 * Files survive the process lifetime; they reset on server restart.
 * In production, swap this with calls to supabaseClient.storage.from(bucket).upload().
 */

interface StoredFile {
  buffer:   Buffer;
  mimeType: string;
  fileName: string;
  size:     number;
  uploadedAt: Date;
}

const store = new Map<string, StoredFile>();

export const mockStorage = {
  /** Persist a buffer and return the storage key. */
  put(key: string, buffer: Buffer, mimeType: string, fileName: string): string {
    store.set(key, { buffer, mimeType, fileName, size: buffer.length, uploadedAt: new Date() });
    return key;
  },

  /** Retrieve a stored file, or null if it does not exist. */
  get(key: string): StoredFile | null {
    return store.get(key) ?? null;
  },

  /** Delete a stored file. Returns true if it existed. */
  delete(key: string): boolean {
    return store.delete(key);
  },

  /** Check existence without loading the buffer. */
  exists(key: string): boolean {
    return store.has(key);
  },

  /** Number of files currently in store (useful for tests). */
  size(): number {
    return store.size;
  },
};
