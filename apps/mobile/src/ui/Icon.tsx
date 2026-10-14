// The custom line icon set (section 22), drawn once as SVG. 24 x 24, round caps, 1.8 stroke.

import Svg, { Circle, Path, Rect } from 'react-native-svg';
import type { IconName } from '@nboard/shared';
import { C } from '../theme/tokens';

interface Props {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const p = (d: string) => <Path d={d} />;

function Glyph({ name }: { name: IconName }) {
  switch (name) {
    case 'bolt':
      return p('M13 2 4 14h7l-1 8 9-12h-7z');
    case 'brain':
    case 'memory':
      return (
        <>
          <Circle cx={6} cy={7} r={2.4} />
          <Circle cx={18} cy={7} r={2.4} />
          <Circle cx={12} cy={17} r={2.4} />
          {p('M8.2 8.4l2.6 6.4M15.8 8.4l-2.6 6.4M8.4 7h7.2')}
        </>
      );
    case 'target':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Circle cx={12} cy={12} r={5} />
          <Circle cx={12} cy={12} r={1.4} />
        </>
      );
    case 'flame':
      return p('M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-2.5 1.2-4 2.5-5.2.2 2 1 3 2.2 3.2C10.2 7.8 10.6 5 12 2z');
    case 'modules':
      return (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1.5} />
          <Rect x={14} y={3} width={7} height={7} rx={1.5} />
          <Rect x={3} y={14} width={7} height={7} rx={1.5} />
          <Rect x={14} y={14} width={7} height={7} rx={1.5} />
        </>
      );
    case 'analytics':
      return p('M5 20V10M12 20V4M19 20v-7M3 20h18');
    case 'leaderboard':
      return (
        <>
          <Circle cx={12} cy={9} r={6} />
          {p('M8.5 14l-1.5 7 5-3 5 3-1.5-7')}
        </>
      );
    case 'players':
      return (
        <>
          <Circle cx={9} cy={8} r={4} />
          {p('M2 21c0-4 3-6.5 7-6.5s7 2.5 7 6.5M17 4a4 4 0 0 1 0 8M22 21c0-3-1.7-5-4-6')}
        </>
      );
    case 'programs':
      return p('M4 6h16M4 12h10M4 18h6');
    case 'hubs':
      return (
        <>
          {p('M12 22s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z')}
          <Circle cx={12} cy={10} r={2.6} />
        </>
      );
    case 'coaches':
      return p('M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z');
    case 'admins':
      return (
        <>
          {p('M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z')}
          {p('M9 12l2 2 4-4')}
        </>
      );
    case 'audit':
      return (
        <>
          {p('M6 3h9l4 4v14H6z')}
          {p('M9 12h7M9 16h7M9 8h3')}
        </>
      );
    case 'system':
      return (
        <>
          <Rect x={3} y={4} width={18} height={12} rx={2} />
          {p('M8 20h8M12 16v4')}
        </>
      );
    case 'settings':
      return (
        <>
          {p('M4 7h10M18 7h2M4 17h2M10 17h10')}
          <Circle cx={16} cy={7} r={2} />
          <Circle cx={8} cy={17} r={2} />
        </>
      );
    case 'results':
      return (
        <>
          {p('M3 3v18h18')}
          {p('M7 15l4-5 3 3 5-7')}
        </>
      );
    case 'pulse':
      return p('M3 12h4l2-6 4 12 2-6h6');
    case 'bell':
      return p('M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21h4');
    case 'bars':
      return p('M5 20v-5M10 20V8M15 20v-8M20 20V5');
    case 'cortex':
      return p('M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 0V7a3 3 0 0 0-3-3zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 0');
    case 'ring2':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          <Circle cx={12} cy={12} r={4} />
        </>
      );
    case 'gauge':
      return p('M4 17a8 8 0 1 1 16 0M12 17l4-5');
    case 'hour':
      return p('M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9');
    case 'sigma':
      return p('M18 5H6l6 7-6 7h12');
    case 'pencil':
      return p('M4 20l1-5L16 4l4 4L9 19zM14 6l4 4');
    case 'board':
      return (
        <>
          {[0, 1, 2].map((r) =>
            [0, 1, 2, 3].map((c) => (
              <Circle key={`${r}${c}`} cx={4.5 + c * 5} cy={6.5 + r * 5.5} r={1.5} fill={r === 1 && c === 1 ? 'currentColor' : 'none'} />
            )),
          )}
        </>
      );
    case 'lock':
      return (
        <>
          <Rect x={5} y={11} width={14} height={10} rx={2} />
          {p('M8 11V8a4 4 0 0 1 8 0v3')}
        </>
      );
    case 'check':
      return p('M5 12.5l4.5 4.5L19 7.5');
    case 'play':
      return p('M7 4.5v15l12-7.5z');
    case 'stop':
      return <Rect x={6} y={6} width={12} height={12} rx={2} />;
    case 'home':
      return p('M4 11 12 4l8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z');
    case 'users':
      return (
        <>
          <Circle cx={9} cy={8} r={3.2} />
          {p('M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6')}
          <Circle cx={17} cy={9} r={2.4} />
          {p('M17 14.2c2.4.3 4 2.4 4 4.8')}
        </>
      );
    case 'list':
      return p('M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01');
    case 'chart':
      return p('M4 20V11M10 20V4M16 20v-7M22 20H2');
    case 'shield':
      return (
        <>
          {p('M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z')}
          {p('M9 12l2.2 2.2L15 10')}
        </>
      );
    case 'gear':
      return (
        <>
          <Circle cx={12} cy={12} r={3} />
          {p('M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1')}
        </>
      );
    case 'server':
      return (
        <>
          <Rect x={3} y={4} width={18} height={6} rx={2} />
          <Rect x={3} y={14} width={18} height={6} rx={2} />
          {p('M7 7h.01M7 17h.01')}
        </>
      );
    case 'doc':
      return p('M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6');
    case 'plus':
      return p('M12 5v14M5 12h14');
    case 'search':
      return (
        <>
          <Circle cx={11} cy={11} r={6.5} />
          {p('M16 16l5 5')}
        </>
      );
    case 'back':
      return p('M15 5l-7 7 7 7');
    case 'chevron':
      return p('M9 5l7 7-7 7');
    case 'chevronDown':
      return p('M5 9l7 7 7-7');
    case 'close':
      return p('M6 6l12 12M18 6 6 18');
    case 'clock':
      return (
        <>
          <Circle cx={12} cy={12} r={9} />
          {p('M12 7v5l3 2')}
        </>
      );
    case 'trophy':
      return p('M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4');
    case 'wifi':
      return (
        <>
          {p('M2 9a15 15 0 0 1 20 0M5 12.5a10.5 10.5 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0')}
          <Circle cx={12} cy={19.2} r={1} fill="currentColor" />
        </>
      );
    case 'bluetooth':
      return p('M7 7l10 10-5 4V3l5 4L7 17');
    case 'qr':
      return (
        <>
          <Rect x={3} y={3} width={7} height={7} rx={1} />
          <Rect x={14} y={3} width={7} height={7} rx={1} />
          <Rect x={3} y={14} width={7} height={7} rx={1} />
          {p('M14 14h3v3h-3zM19 14h2M14 19h2M18 19h3v2')}
        </>
      );
    case 'user':
      return (
        <>
          <Circle cx={12} cy={8} r={4} />
          {p('M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8')}
        </>
      );
    case 'logout':
      return p('M10 4H5v16h5M15 8l4 4-4 4M19 12H9');
    case 'refresh':
      return p('M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7');
    case 'eye':
      return (
        <>
          {p('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z')}
          <Circle cx={12} cy={12} r={3} />
        </>
      );
    case 'eyeOff':
      return (
        <>
          {p('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z')}
          <Circle cx={12} cy={12} r={3} />
          {p('M4 4l16 16')}
        </>
      );
    case 'trendUp':
      return p('M3 17l6-6 4 4 8-8M15 7h6v6');
    case 'trendDown':
      return p('M3 7l6 6 4-4 8 8M15 17h6v-6');
    case 'more':
      return p('M5 12h.01M12 12h.01M19 12h.01');
    case 'dots':
      return p('M12 5h.01M12 12h.01M12 19h.01');
    case 'copy':
      return (
        <>
          <Rect x={9} y={9} width={11} height={11} rx={2} />
          {p('M5 15V6a1 1 0 0 1 1-1h9')}
        </>
      );
    case 'print':
      return p('M7 9V3h10v6M7 17H5a1 1 0 0 1-1-1v-5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5a1 1 0 0 1-1 1h-2M7 14h10v7H7z');
    case 'alert':
      return p('M12 3 2 20h20zM12 10v4.5M12 17.5v.01');
    case 'trash':
      return p('M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6');
    case 'edit':
      return p('M4 20h4L19 9l-4-4L4 16zM13 7l4 4');
    case 'key':
      return (
        <>
          <Circle cx={8} cy={15} r={4} />
          {p('M11 12l9-9M16 7l3 3M14 9l2 2')}
        </>
      );
  }
}

export function Icon({ name, size = 22, color = C.text, strokeWidth = 1.8 }: Props) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" color={color} style={{ position: "relative" }}>
      <Glyph name={name} />
    </Svg>
  );
}
