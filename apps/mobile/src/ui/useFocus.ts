import { useState } from 'react';
import { Platform } from 'react-native';

// A focus ring is for a remote or keyboard. A mouse click or a touch also focuses a control on the web,
// and that must not leave a white outline behind, so the ring only shows when the last input was a key.
let lastKey = Platform.OS !== 'web';
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  document.addEventListener('keydown', () => { lastKey = true; }, true);
  document.addEventListener('pointerdown', () => { lastKey = false; }, true);
}

/** Focus ring state for remote (TV) and keyboard use. */
export function useFocus() {
  const [focused, setFocused] = useState(false);
  return {
    focused,
    handlers: {
      onFocus: () => setFocused(lastKey),
      onBlur: () => setFocused(false),
    },
  };
}
