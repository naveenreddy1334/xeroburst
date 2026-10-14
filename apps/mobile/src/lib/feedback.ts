// Haptics and sounds on hit, miss, level up and personal best. Both can be switched off.

import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import type { AudioPlayer } from 'expo-audio';
import { usePrefs } from '../state/prefs';

export type Cue = 'hit' | 'miss' | 'tick' | 'go' | 'level' | 'pb';

const FILES: Record<Cue, number> = {
  hit: require('../../assets/sounds/hit.wav'),
  miss: require('../../assets/sounds/miss.wav'),
  tick: require('../../assets/sounds/tick.wav'),
  go: require('../../assets/sounds/go.wav'),
  level: require('../../assets/sounds/level.wav'),
  pb: require('../../assets/sounds/pb.wav'),
};

const players: Partial<Record<Cue, AudioPlayer>> = {};
let modeSet = false;

export function playSound(cue: Cue): void {
  if (!usePrefs.getState().sound) return;
  try {
    if (!modeSet) {
      modeSet = true;
      void setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
    }
    let p = players[cue];
    if (!p) {
      p = createAudioPlayer(FILES[cue]);
      players[cue] = p;
    }
    void p.seekTo(0);
    p.play();
  } catch {
    /* sound is a nicety, never a failure */
  }
}

export function haptic(cue: Cue): void {
  if (!usePrefs.getState().haptics || Platform.OS === 'web') return;
  try {
    switch (cue) {
      case 'hit':
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        break;
      case 'miss':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        break;
      case 'pb':
      case 'level':
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        break;
      default:
        void Haptics.selectionAsync();
    }
  } catch {
    /* ignore */
  }
}

export function cue(c: Cue): void {
  playSound(c);
  haptic(c);
}
