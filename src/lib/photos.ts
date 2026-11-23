import * as ImagePicker from 'expo-image-picker';
import { isDemo, supabase } from './supabase';

/** Lets the user pick a photo, square-cropped. Returns its local URI, or null if they cancel. */
export async function pickDogPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/** Uploads a picked photo and returns the URL to save on the dog. */
export async function uploadDogPhoto(userId: string, localUri: string): Promise<string> {
  if (isDemo) return localUri; // Demo mode keeps the photo in memory only.
  const body = await (await fetch(localUri)).arrayBuffer();
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('dog-photos').upload(path, body, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  return supabase.storage.from('dog-photos').getPublicUrl(path).data.publicUrl;
}

/** Lets the owner pick a walk photo (not cropped). */
export async function pickWalkPhoto(): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

/** Uploads a walk photo and returns its URL. */
export async function uploadWalkPhoto(localUri: string): Promise<string> {
  if (isDemo) return localUri;
  const body = await (await fetch(localUri)).arrayBuffer();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  const { error } = await supabase.storage.from('walk-photos').upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  return supabase.storage.from('walk-photos').getPublicUrl(path).data.publicUrl;
}
