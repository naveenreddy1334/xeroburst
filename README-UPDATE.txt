XeroBurst / NBoard update

1. Stop the server.
2. Extract this zip INTO  C:\Users\ASUS\Desktop\XeroBurst-App-Hubs  (the folder that CONTAINS "nboard").
   Windows asks about existing files: choose "Replace the files in the destination".
   (Or: open the zip, copy the inner "nboard" folder, paste over your nboard folder, choose Replace.)
3. PowerShell:
     cd C:\Users\ASUS\Desktop\XeroBurst-App-Hubs\nboard\apps\server
     npx tsx src/cli/demo-org.ts --reset
     cd ..\..
     npm run web:build
     npm run server
4. Browser: Ctrl+Shift+R.  Login: super.sunita / Demo-pass-2026
   Hub Admin: hubadmin.cc   Branch Admins: branchadmin.mmcf / branchadmin.mmca / branchadmin.hawk   (all Demo-pass-2026)
   Players: nb-0001 PIN 107919 ... nb-0018 (printed by the reset command)
5. Phone / tablet: build a new APK (git add -A, commit, npx eas-cli build --platform android --profile phone-apk).
