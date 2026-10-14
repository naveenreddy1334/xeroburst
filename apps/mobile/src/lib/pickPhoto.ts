// Picks a square-ish profile photo and returns a small data URI (so it survives restarts and works on web).

import { Platform } from 'react-native';

export async function pickPhoto(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        const img = new Image();
        const url = URL.createObjectURL(f);
        img.onload = () => {
          const s = 160;
          const c = document.createElement('canvas');
          c.width = s;
          c.height = s;
          const g = c.getContext('2d')!;
          const m = Math.min(img.width, img.height);
          g.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, s, s);
          URL.revokeObjectURL(url);
          resolve(c.toDataURL('image/jpeg', 0.8));
        };
        img.onerror = () => resolve(null);
        img.src = url;
      };
      input.click();
    });
  }
  const IP = await import('expo-image-picker');
  const perm = await IP.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const r = await IP.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5, base64: true });
  if (r.canceled || !r.assets[0]?.base64) return null;
  return `data:image/jpeg;base64,${r.assets[0].base64}`;
}
