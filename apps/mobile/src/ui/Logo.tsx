import { Image, View } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from 'react-native-svg';
import { F, getThemeMode } from '../theme/tokens';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const MARK = require('../../assets/xeroburst-mark.png');

/** The XEROBURST wordmark in the brand gradient (lime to olive; dark olive on the light theme). One word, nothing else. */
export function Wordmark({ height = 22 }: { height?: number }) {
  const light = getThemeMode() === 'light';
  const w = height * 6.9;
  return (
    <Svg width={w} height={height} viewBox="0 0 190 27" accessibilityLabel="XEROBURST">
      <Defs>
        <LinearGradient id="wm" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={light ? '#3C6200' : '#9BFB00'} />
          <Stop offset="1" stopColor={light ? '#4A7900' : '#4A7900'} />
        </LinearGradient>
      </Defs>
      <SvgText x="0" y="21" fill="url(#wm)" fontSize="24" fontWeight="800" fontFamily={F.display} textLength="188" lengthAdjust="spacing">
        XEROBURST
      </SvgText>
    </Svg>
  );
}

/** The XeroBurst mark (the X). With `word`, the gradient name sits underneath. */
export function Logo({ size = 64, word = false }: { size?: number; animated?: boolean; word?: boolean }) {
  return (
    <View style={{ alignItems: 'center', gap: size * 0.2 }}>
      <Image source={MARK} accessibilityLabel="XeroBurst logo" style={{ width: size * 0.97, height: size }} resizeMode="contain" />
      {word ? <Wordmark height={size * 0.3} /> : null}
    </View>
  );
}