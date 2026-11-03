How-to-play screen for all four games (Quick Reaction, Memory Sequence, Target Hunt, Endurance)

Extract this zip INTO your project folder (the folder that contains "apps" and "packages"), and choose Replace.
It adds apps/mobile/src/board/WallBoard.tsx and replaces
apps/mobile/src/app/(app)/nboard/[slug]/howto.tsx.

Then, from that same folder:
  npm run web:build
  npm run server
For the phone/tablet app, build a new APK.
