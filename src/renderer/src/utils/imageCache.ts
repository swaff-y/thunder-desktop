import { createStore, get, set, clear } from "idb-keyval";

// Dedicated IndexedDB store for image blobs, scoped so it doesn't collide
// with anything else in the app or any other web-thunder deploys.
const imageStore = createStore("web-thunder-images", "blobs");

export function getCachedImage(id: string): Promise<Blob | undefined> {
  return get<Blob>(id, imageStore);
}

export function cacheImage(id: string, blob: Blob): Promise<void> {
  return set(id, blob, imageStore);
}

export function clearImageCache(): Promise<void> {
  return clear(imageStore);
}
