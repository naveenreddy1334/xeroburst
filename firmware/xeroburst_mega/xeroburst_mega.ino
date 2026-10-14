/*
  XeroBurst board firmware for Arduino Mega 2560   (protocol 1.1)

  What it does
    The Mega is the "board": 10 buttons and 10 LEDs/relays. The laptop server talks to it over USB
    serial (115200 baud, one JSON line per message, see docs/protocol.md). The tablet/phone never
    touches the Mega directly: Tablet --Wi-Fi--> laptop server --USB--> this firmware.

  It implements the same rules as the app's built-in Demo Mode (packages/shared/src/sim.ts):
    quick   Quick Reaction   20 targets, one LED at a time
    memory  Memory Sequence  watch, repeat, sequence grows, 3 strikes
    hunt    Target Hunt      screen names a button, find it among lit LEDs, decoys, NO HIT steps
    endure  Endurance        runs for a fixed time, window and gap shrink as time passes

  Wiring (edit the two pin lists below to match YOUR board)
    LED/relay k  -> LED_PIN[k-1]       (button numbers are 1..10 everywhere in the protocol)
    Button k     -> BTN_PIN[k-1] and GND   (internal pull-up, so no resistor is needed)
    Most relay modules switch ON with a LOW signal: keep LED_ACTIVE_LOW 1. If your LEDs are wired
    straight to the pin (HIGH = on) set it to 0.

  Do not print anything else on Serial: the laptop expects JSON lines only.
*/

#define FW_VERSION "1.1"
#define NBTN 10

// ---- EDIT THESE TO MATCH YOUR WIRING ---------------------------------------------------------------
const uint8_t LED_PIN[NBTN] = {22, 23, 24, 25, 26, 27, 28, 29, 30, 31};
const uint8_t BTN_PIN[NBTN] = {32, 33, 34, 35, 36, 37, 38, 39, 40, 41};
#define LED_ACTIVE_LOW 1   // 1 = relay board (LOW switches on), 0 = LED wired directly (HIGH = on)
#define BTN_ACTIVE_LOW 1   // 1 = button between pin and GND (normal)
#define DEBOUNCE_MS 25
#define STARTUP_CHASE 1    // 1 = chase the LEDs once at power-up, so you can check wiring at a glance
// ----------------------------------------------------------------------------------------------------

// ---- Difficulty tables, level 1..10. Same numbers as the app's Demo Mode. ---------------------------
const int Q_WIN[10] = {3000, 2600, 2000, 1700, 1400, 1200, 1000, 900, 800, 650};
const int Q_GAP[10] = {900, 800, 600, 500, 450, 350, 250, 200, 150, 100};
// Memory: the speed is the same on every level. Level N shows N steps (the first N of the run's sequence).
const int M_ON[10]  = {600, 600, 600, 600, 600, 600, 600, 600, 600, 600};
const int M_OFF[10] = {260, 260, 260, 260, 260, 260, 260, 260, 260, 260};
const int M_TMO[10] = {5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000};
#define M_STRIKES 3
#define M_MAXLEN 15
const uint8_t H_PLAY[10] = {4, 5, 6, 7, 8, 9, 9, 8, 8, 7};
const int H_WIN[10]  = {4000, 3500, 3000, 2600, 2200, 1900, 1600, 1400, 1200, 1000};
const int H_GAP[10]  = {700, 600, 500, 450, 400, 350, 300, 250, 200, 150};
const uint8_t H_DEC[10] = {0, 0, 0, 0, 0, 0, 1, 2, 2, 3};
const uint8_t H_NOHIT[10] = {0, 0, 0, 0, 10, 15, 15, 15, 20, 20};   // percent
const uint16_t E_SECONDS[10] = {30, 30, 50, 50, 70, 70, 95, 95, 120, 120};
#define COUNT_QUICK 20
#define COUNT_HUNT 20

enum Game : uint8_t { G_NONE, G_QUICK, G_MEMORY, G_HUNT, G_ENDURE };
enum Phase : uint8_t { P_IDLE, P_WAIT, P_ACTIVE, P_SHOW, P_REPEAT };

Game game = G_NONE;
uint8_t level = 1;
bool running = false;
uint32_t t0 = 0;

// debounce
bool btnState[NBTN];
bool btnRaw[NBTN];
uint32_t btnAt[NBTN];

// round state
Phase phase = P_IDLE;
uint32_t nextAt = 0;
uint8_t lastN = 0;
uint16_t stepIdx = 0;
uint16_t correct = 0;

// target games
bool stepNoHit = false;
uint8_t tgtN = 0;
uint16_t fieldMask = 0, decoyMask = 0;
uint32_t litAt = 0;
uint16_t stepWindow = 0, stepGap = 0;

// memory
uint8_t seq[M_MAXLEN];
uint8_t seqLen = 0, seqIdx = 0, strikes = 0, longest = 0, showIdx = 0;
uint32_t showStart = 0, promptAt = 0, tmoAt = 0;
bool showLedOn = false;
bool memAfterWait = false;  // when the P_WAIT ends, start showing the sequence

// serial input
char inbuf[96];
uint8_t inlen = 0;

// ---- LED helpers ----------------------------------------------------------------------------------
inline void ledWrite(uint8_t k, bool on) {            // k = 1..10
  digitalWrite(LED_PIN[k - 1], (LED_ACTIVE_LOW ? !on : on) ? HIGH : LOW);
}
void allOff() { for (uint8_t k = 1; k <= NBTN; k++) ledWrite(k, false); }
void lightMask(uint16_t m) { for (uint8_t k = 1; k <= NBTN; k++) ledWrite(k, (m >> (k - 1)) & 1); }

// ---- JSON output (hand written: no library, tiny RAM) ----------------------------------------------
uint32_t elapsed() { return millis() - t0; }
void listMask(uint16_t m) {
  Serial.print('[');
  bool first = true;
  for (uint8_t k = 1; k <= NBTN; k++) if ((m >> (k - 1)) & 1) { if (!first) Serial.print(','); Serial.print(k); first = false; }
  Serial.print(']');
}
void sendHello() { Serial.print(F("{\"t\":\"hello\",\"fw\":\"" FW_VERSION "\",\"btn\":")); Serial.print(NBTN); Serial.println('}'); }
void sendAck(const __FlashStringHelper* of) { Serial.print(F("{\"t\":\"ack\",\"of\":\"")); Serial.print(of); Serial.println(F("\"}")); }
void sendErr(uint8_t code) { Serial.print(F("{\"t\":\"err\",\"code\":")); Serial.print(code); Serial.println('}'); }
void sendTgt(uint8_t n, const __FlashStringHelper* kind, uint16_t w, uint16_t f, uint16_t d) {
  Serial.print(F("{\"t\":\"tgt\",\"n\":")); Serial.print(n);
  Serial.print(F(",\"ms\":")); Serial.print(elapsed());
  Serial.print(F(",\"k\":\"")); Serial.print(kind); Serial.print(F("\",\"w\":")); Serial.print(w);
  if (f) { Serial.print(F(",\"f\":")); listMask(f); }
  if (d) { Serial.print(F(",\"d\":")); listMask(d); }
  Serial.println('}');
}
void sendPhase(const __FlashStringHelper* p) {
  Serial.print(F("{\"t\":\"ph\",\"p\":\"")); Serial.print(p);
  Serial.print(F("\",\"len\":")); Serial.print(seqLen);
  Serial.print(F(",\"ms\":")); Serial.print(elapsed()); Serial.println('}');
}
void sendHit(uint8_t n, bool ok, uint32_t rt, uint8_t tb, bool decoy, int len, int st) {
  Serial.print(F("{\"t\":\"hit\",\"n\":")); Serial.print(n);
  Serial.print(F(",\"ok\":")); Serial.print(ok ? 1 : 0);
  Serial.print(F(",\"rt\":")); Serial.print(rt);
  Serial.print(F(",\"tb\":")); Serial.print(tb);
  Serial.print(F(",\"ms\":")); Serial.print(elapsed());
  if (decoy) Serial.print(F(",\"d\":1"));
  if (len >= 0) { Serial.print(F(",\"len\":")); Serial.print(len); Serial.print(F(",\"st\":")); Serial.print(st); }
  Serial.println('}');
}
void sendMiss(uint8_t n, int len, int st) {
  Serial.print(F("{\"t\":\"miss\",\"n\":")); Serial.print(n);
  Serial.print(F(",\"ms\":")); Serial.print(elapsed());
  if (len >= 0) { Serial.print(F(",\"len\":")); Serial.print(len); Serial.print(F(",\"st\":")); Serial.print(st); }
  Serial.println('}');
}

// ---- random helpers --------------------------------------------------------------------------------
uint8_t pickBtn(uint8_t exclude) { uint8_t n = exclude; while (n == exclude) n = 1 + random(NBTN); return n; }
// `count` distinct buttons that always include `must`.
uint16_t sampleMask(uint8_t count, uint8_t must) {
  uint16_t m = 1u << (must - 1);
  uint8_t have = 1;
  while (have < count) { uint8_t k = 1 + random(NBTN); if (!((m >> (k - 1)) & 1)) { m |= 1u << (k - 1); have++; } }
  return m;
}

// ---- buttons ---------------------------------------------------------------------------------------
// Returns the button (1..10) that was just pressed, or 0. One press at a time is enough for this board.
uint8_t pollPress() {
  uint8_t pressed = 0;
  uint32_t now = millis();
  for (uint8_t i = 0; i < NBTN; i++) {
    bool raw = (digitalRead(BTN_PIN[i]) == (BTN_ACTIVE_LOW ? LOW : HIGH));
    if (raw != btnRaw[i]) { btnRaw[i] = raw; btnAt[i] = now; }
    if ((now - btnAt[i]) >= DEBOUNCE_MS && raw != btnState[i]) {
      btnState[i] = raw;
      if (raw && !pressed) pressed = i + 1;
    }
  }
  return pressed;
}

// ---- round control ---------------------------------------------------------------------------------
void finishRound(uint16_t score) {
  uint32_t ms = elapsed();
  allOff();
  running = false;
  phase = P_IDLE;
  Serial.print(F("{\"t\":\"end\",\"score\":")); Serial.print(score);
  Serial.print(F(",\"ms\":")); Serial.print(ms); Serial.println('}');
}
void stopRound() { allOff(); running = false; phase = P_IDLE; }

// ---- target games (quick / hunt / endure) ----------------------------------------------------------
void nextTarget() {
  uint32_t el = elapsed();
  uint8_t lv = level - 1;
  uint32_t total = E_SECONDS[lv] * 1000UL;
  stepNoHit = false; fieldMask = 0; decoyMask = 0;
  if (game == G_QUICK) {
    if (stepIdx >= COUNT_QUICK) return finishRound(correct);
    tgtN = lastN = pickBtn(lastN);
    stepWindow = Q_WIN[lv]; stepGap = Q_GAP[lv];
  } else if (game == G_HUNT) {
    if (stepIdx >= COUNT_HUNT) return finishRound(correct);
    stepGap = H_GAP[lv];
    if ((uint8_t)random(100) < H_NOHIT[lv]) { stepNoHit = true; tgtN = 0; stepWindow = 1500; }
    else {
      tgtN = pickBtn(lastN); lastN = tgtN;
      fieldMask = sampleMask(H_PLAY[lv], tgtN);
      for (uint8_t k = 0; k < H_DEC[lv]; k++) {   // decoys: extra lit LEDs outside the field
        uint8_t guard = 0, d;
        do { d = 1 + random(NBTN); } while ((((fieldMask | decoyMask) >> (d - 1)) & 1) && ++guard < 60);
        if (!(((fieldMask | decoyMask) >> (d - 1)) & 1)) decoyMask |= 1u << (d - 1);
      }
      stepWindow = H_WIN[lv];
    }
  } else {  // endure
    if (el >= total) return finishRound(correct);
    float p = (float)el / (float)total;
    int w0 = 2000 - 120 * level, g0 = 600 - 40 * level;
    tgtN = lastN = pickBtn(lastN);
    stepWindow = (uint16_t)(w0 * (1.0f - 0.4f * p));
    stepGap = (uint16_t)(g0 * (1.0f - 0.5f * p));
  }
  stepIdx++;
  litAt = millis();
  if (stepNoHit) { allOff(); sendTgt(0, F("nohit"), stepWindow, 0, 0); }
  else {
    uint16_t lit = fieldMask | decoyMask | (1u << (tgtN - 1));
    lightMask(lit);
    sendTgt(tgtN, F("go"), stepWindow, fieldMask, decoyMask);
  }
  phase = P_ACTIVE;
  nextAt = litAt + stepWindow;   // timeout
}

void targetPress(uint8_t n) {
  if (phase != P_ACTIVE) return;
  uint32_t rt = millis() - litAt;
  if (stepNoHit) { sendHit(n, false, rt, 0, true, -1, -1); return; }
  if (n == tgtN) {
    correct++;
    allOff();
    sendHit(n, true, rt, tgtN, false, -1, -1);
    phase = P_WAIT; nextAt = millis() + stepGap;
  } else if ((decoyMask >> (n - 1)) & 1) sendHit(n, false, rt, tgtN, true, -1, -1);
  else sendHit(n, false, rt, tgtN, false, -1, -1);
}

void targetTick() {
  uint32_t now = millis();
  if (game == G_ENDURE && elapsed() >= E_SECONDS[level - 1] * 1000UL) return finishRound(correct);
  if (phase == P_WAIT && (int32_t)(now - nextAt) >= 0) nextTarget();
  else if (phase == P_ACTIVE && (int32_t)(now - nextAt) >= 0) {   // timed out
    allOff();
    if (!stepNoHit) sendMiss(tgtN, -1, -1);
    phase = P_WAIT; nextAt = now + stepGap;
  }
}

// ---- memory sequence -------------------------------------------------------------------------------
// Same generator as the app (memorySequence in packages/shared/src/sim.ts): one seed gives one order, and a longer
// length only adds steps at the end. The app sends the seed in "cfg", so every level of one run plays the same order.
uint32_t memSeed = 1;
void memBuild(uint8_t len) {
  uint32_t s = memSeed; uint8_t prev = 0;
  for (uint8_t i = 0; i < len && i < M_MAXLEN; i++) {
    uint8_t n = prev;
    while (n == prev) { s = s * 1664525UL + 1013904223UL; n = 1 + (uint8_t)((s >> 16) % NBTN); }
    seq[i] = n; prev = n;
  }
  seqLen = len;
}
void memStartShow() {
  phase = P_SHOW; showIdx = 0; showLedOn = false;
  showStart = millis() + 500;
  sendPhase(F("watch"));
}
void memStrike() {
  strikes++; allOff();
  if (strikes >= M_STRIKES) return finishRound(longest);
  phase = P_WAIT; memAfterWait = true; nextAt = millis() + 1200;
}
void memArmTimeout() { tmoAt = millis() + M_TMO[level - 1]; }

void memTick() {
  uint32_t now = millis();
  uint8_t lv = level - 1;
  uint16_t step = M_ON[lv] + M_OFF[lv];
  if (phase == P_WAIT && (int32_t)(now - nextAt) >= 0) { if (memAfterWait) memStartShow(); }
  else if (phase == P_SHOW) {
    if (showIdx < seqLen) {
      uint32_t at = showStart + (uint32_t)showIdx * step;
      if (!showLedOn && (int32_t)(now - at) >= 0) { ledWrite(seq[showIdx], true); showLedOn = true; sendTgt(seq[showIdx], F("show"), M_ON[lv], 0, 0); }
      else if (showLedOn && (int32_t)(now - (at + M_ON[lv])) >= 0) { ledWrite(seq[showIdx], false); showLedOn = false; showIdx++; }
    } else if ((int32_t)(now - (showStart + (uint32_t)seqLen * step + 200)) >= 0) {
      allOff(); phase = P_REPEAT; seqIdx = 0; promptAt = now; sendPhase(F("repeat")); memArmTimeout();
    }
  } else if (phase == P_REPEAT && (int32_t)(now - tmoAt) >= 0) {
    sendMiss(seq[seqIdx], seqLen, seqIdx);
    memStrike();
  }
}

void memPress(uint8_t n) {
  if (phase != P_REPEAT) return;
  uint8_t expected = seq[seqIdx];
  uint32_t rt = millis() - promptAt;
  bool ok = (n == expected);
  sendHit(n, ok, rt, expected, false, seqLen, seqIdx);
  if (!ok) return memStrike();
  seqIdx++; promptAt = millis();
  if (seqIdx >= seqLen) {
    longest = seqLen;
    return finishRound(longest);   // level done: the app starts the next level, which adds one step
  } else memArmTimeout();
}

// ---- starting a round ------------------------------------------------------------------------------
void startRound() {
  allOff();
  for (uint8_t i = 0; i < NBTN; i++) { btnState[i] = btnRaw[i] = (digitalRead(BTN_PIN[i]) == (BTN_ACTIVE_LOW ? LOW : HIGH)); }
  running = true; t0 = millis();
  lastN = 0; stepIdx = 0; correct = 0;
  if (game == G_MEMORY) {
    seqIdx = 0; strikes = 0; longest = 0;
    memBuild(level);
    phase = P_WAIT; memAfterWait = true; nextAt = millis() + 600;
  } else {
    phase = P_WAIT; nextAt = millis() + (game == G_ENDURE ? 800 : 600);
  }
}

// ---- command parsing -------------------------------------------------------------------------------
bool jstr(const char* line, const char* key, char* out, uint8_t n) {
  char pat[12]; snprintf(pat, sizeof(pat), "\"%s\":\"", key);
  const char* p = strstr(line, pat); if (!p) return false;
  p += strlen(pat); uint8_t i = 0;
  while (*p && *p != '"' && i < n - 1) out[i++] = *p++;
  out[i] = 0; return true;
}
long jint(const char* line, const char* key, long def) {
  char pat[12]; snprintf(pat, sizeof(pat), "\"%s\":", key);
  const char* p = strstr(line, pat); if (!p) return def;
  return atol(p + strlen(pat));
}

void handleLine(const char* line) {
  char t[10];
  if (!jstr(line, "t", t, sizeof(t))) return;
  if (!strcmp(t, "hello")) { sendHello(); return; }
  if (!strcmp(t, "hb")) return;
  if (!strcmp(t, "cfg")) {
    if (running) return sendErr(4);
    char g[10]; long lv = jint(line, "lv", 0);
    if (!jstr(line, "g", g, sizeof(g))) return sendErr(2);
    Game ng = G_NONE;
    if (!strcmp(g, "quick")) ng = G_QUICK; else if (!strcmp(g, "memory")) ng = G_MEMORY;
    else if (!strcmp(g, "hunt")) ng = G_HUNT; else if (!strcmp(g, "endure")) ng = G_ENDURE;
    if (ng == G_NONE) return sendErr(2);
    if (lv < 1 || lv > 10) return sendErr(3);
    {
      const char* sp = strstr(line, "\"sd\":");
      memSeed = sp ? strtoul(sp + 5, NULL, 10) : (uint32_t)micros();   // no seed from the app: a random order
    }
    game = ng; level = (uint8_t)lv; sendAck(F("cfg")); return;
  }
  if (!strcmp(t, "go")) {
    if (running) return sendErr(4);
    if (game == G_NONE) return sendErr(1);
    sendAck(F("go")); startRound(); return;
  }
  if (!strcmp(t, "stop")) { stopRound(); sendAck(F("stop")); return; }
}

// ---- Arduino entry points --------------------------------------------------------------------------
void setup() {
  for (uint8_t i = 0; i < NBTN; i++) {
    digitalWrite(LED_PIN[i], LED_ACTIVE_LOW ? HIGH : LOW);   // set the level first: no relay click at boot
    pinMode(LED_PIN[i], OUTPUT);
    pinMode(BTN_PIN[i], INPUT_PULLUP);
  }
  randomSeed(analogRead(A0) ^ micros());
  Serial.begin(115200);
#if STARTUP_CHASE
  for (uint8_t k = 1; k <= NBTN; k++) { ledWrite(k, true); delay(70); ledWrite(k, false); }
#endif
  sendHello();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\n' || c == '\r') { if (inlen) { inbuf[inlen] = 0; handleLine(inbuf); inlen = 0; } }
    else if (inlen < sizeof(inbuf) - 1) inbuf[inlen++] = c;
    else inlen = 0;   // overlong line: drop it
  }
  uint8_t p = pollPress();
  if (running) {
    if (p) { if (game == G_MEMORY) memPress(p); else targetPress(p); }
    if (running) { if (game == G_MEMORY) memTick(); else targetTick(); }
  }
}
