(() => {
  "use strict";

  /* =====================================================================
     PULSE — Game Engine
     -----------------------------------------------------------------
     Sections:
       1.  Config & constants
       2.  Storage helpers
       3.  DOM references
       4.  Global state
       5.  Voice system (Web Speech API)
       6.  Sound effects (Web Audio API)
       7.  Vibration feedback (mobile)
       8.  Celebration: confetti, particles, screen flash, glow
       9.  Color / proximity tiers / pulse visualizer
      10.  Chances / timer ring indicator + toasts
      11.  Statistics
      12.  Achievements
      13.  Leaderboard (all-time + daily)
      14.  Daily Challenge
      15.  Scoring
      16.  Core game flow
      17.  Modals
      18.  Share
      19.  Keyboard shortcuts
      20.  Wiring + init
     ===================================================================== */

  /* ---------------------------------------------------------------------
     1. Config & constants
     --------------------------------------------------------------------- */
  const LEVELS = {
    easy:   { min: 1, max: 50,  attempts: 10, maxScore: 500  },
    medium: { min: 1, max: 100, attempts: 7,  maxScore: 1000 },
    hard:   { min: 1, max: 200, attempts: 5,  maxScore: 2000 },
  };

  // Time Attack reuses the same number ranges, but guesses are unlimited —
  // the countdown clock is the only limit.
  const TIME_ATTACK_SECONDS = { easy: 60, medium: 45, hard: 30 };
  const TIME_ATTACK_MAX_ATTEMPTS = 999;

  // Daily Challenge: one fixed ruleset so every player's run is directly
  // comparable, regardless of which difficulty they'd normally pick.
  const DAILY_CONFIG = { min: 1, max: 100, attempts: 7, maxScore: 1000 };

  const STORAGE_PREFIX = "pulseGame_";

  const ACHIEVEMENTS = [
    { id: "firstVictory", icon: "🏆", name: "First Victory",   check: (s) => s.gamesWon >= 1 },
    { id: "firstTry",     icon: "⚡", name: "First Try Win",    check: (s, c) => c.won && c.attemptsUsed === 1 },
    { id: "streak5",      icon: "🔥", name: "5 Win Streak",     check: (s) => s.currentStreak >= 5 },
    { id: "streak10",     icon: "👑", name: "10 Win Streak",    check: (s) => s.currentStreak >= 10 },
    { id: "perfectAcc",   icon: "🎯", name: "Perfect Accuracy", check: (s, c) => c.won && c.attemptsCap && c.attemptsUsed <= Math.ceil(c.attemptsCap / 2) },
    { id: "score1000",    icon: "💯", name: "Score Above 1000", check: (s, c) => c.won && c.score >= 1000 },
    { id: "score2000",    icon: "🚀", name: "Score Above 2000", check: (s, c) => c.won && c.score >= 2000 },
    { id: "hardWinner",   icon: "🧠", name: "Hard Mode Winner", check: (s, c) => c.won && c.level === "hard" },
    { id: "games25",      icon: "⭐", name: "25 Games Played",  check: (s) => s.gamesPlayed >= 25 },
    { id: "games50",      icon: "💎", name: "50 Games Played",  check: (s) => s.gamesPlayed >= 50 },
  ];

  const WIN_VOICE_LINES = [
    "Outstanding!", "Mission accomplished!", "Perfect!",
    "You found it!", "Amazing work!", "Incredible!",
  ];

  const CONFETTI_COLORS = ["#6366f1", "#ec4899", "#fb923c", "#2dd4bf", "#fbbf24", "#8b5cf6"];
  const RING_CIRCUMFERENCE = 213.628; // 2 * PI * 34, matches the SVG ring radius

  /* ---------------------------------------------------------------------
     2. Storage helpers
     --------------------------------------------------------------------- */
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  }

  // Best-score keys are namespaced by mode so Classic and Time Attack don't
  // overwrite each other. Existing Classic bests (saved before this update)
  // keep working because the Classic key format is unchanged.
  function bestKey(mode, level) {
    return mode === "classic" ? `${STORAGE_PREFIX}best_${level}` : `${STORAGE_PREFIX}best_${mode}_${level}`;
  }
  function getBest(mode, level) { return Number(localStorage.getItem(bestKey(mode, level)) || 0); }
  function setBest(mode, level, val) { localStorage.setItem(bestKey(mode, level), String(val)); }

  /* ---------------------------------------------------------------------
     3. DOM references
     --------------------------------------------------------------------- */
  const $ = (id) => document.getElementById(id);

  const levelBtns       = Array.from(document.querySelectorAll(".level-btn"));
  const gameCard         = $("gameCard");
  const modeFlag         = $("modeFlag");
  const scoreValueEl     = $("scoreValue");
  const bestValueEl      = $("bestValue");
  const rangeLineEl      = $("rangeLine");
  const chancesBadge     = $("chancesBadge");
  const ringFg           = $("ringFg");
  const chancesNumberEl  = $("chancesNumber");
  const chancesLabelText = $("chancesLabelText");
  const lastChanceToast  = $("lastChanceToast");
  const lastChanceText   = $("lastChanceText");
  const confettiLayer    = $("confettiLayer");
  const screenFlash      = $("screenFlash");
  const guessForm        = $("guessForm");
  const guessInput       = $("guessInput");
  const tryBtn           = $("tryBtn");
  const feedbackLine     = $("feedbackLine");
  const historyEl        = $("history");
  const dialReadout      = $("dialReadout");
  const pulseWrap        = document.querySelector(".pulse-wrap");
  const pulseCore        = $("pulseCore");
  const pulseValueEl     = $("pulseValue");
  const endPanel         = $("endPanel");
  const endTitle         = $("endTitle");
  const endSubtitle      = $("endSubtitle");
  const endScore         = $("endScore");
  const playAgainBtn     = $("playAgainBtn");
  const shareScoreBtn    = $("shareScoreBtn");
  const saveScoreRow     = $("saveScoreRow");
  const nicknameInput    = $("nicknameInput");
  const saveScoreBtn     = $("saveScoreBtn");
  const saveScoreConfirm = $("saveScoreConfirm");
  const saveScoreRank    = $("saveScoreRank");
  const resetScoresBtn   = $("resetScoresBtn");

  const audioModeBtn  = $("audioModeBtn");
  const soundOnIcon   = $("soundOnIcon");
  const soundOffIcon  = $("soundOffIcon");
  const statsBtn        = $("statsBtn");
  const achievementsBtn = $("achievementsBtn");
  const leaderboardBtn  = $("leaderboardBtn");

  const achievementToast     = $("achievementToast");
  const achievementToastIcon = $("achievementToastIcon");
  const achievementToastText = $("achievementToastText");
  const infoToast     = $("infoToast");
  const infoToastIcon = $("infoToastIcon");
  const infoToastText = $("infoToastText");

  const classicTabBtn    = $("classicTabBtn");
  const timeAttackTabBtn = $("timeAttackTabBtn");

  const dailyDateText   = $("dailyDateText");
  const dailyAction     = $("dailyAction");
  const dailyPlayBtn    = $("dailyPlayBtn");
  const dailyResult     = $("dailyResult");
  const dailyResultLine = $("dailyResultLine");
  const dailyCountdown  = $("dailyCountdown");
  const dailyShareBtn   = $("dailyShareBtn");

  const statsGrid          = $("statsGrid");
  const resetStatsBtn       = $("resetStatsBtn");
  const achievementsProgress = $("achievementsProgress");
  const achievementsGrid     = $("achievementsGrid");
  const leaderboardList    = $("leaderboardList");
  const leaderboardEmpty   = $("leaderboardEmpty");
  const clearLeaderboardBtn = $("clearLeaderboardBtn");

  /* ---------------------------------------------------------------------
     4. Global state
     --------------------------------------------------------------------- */
  let uiMode = "classic"; // which tab is selected before a round starts: 'classic' | 'timeAttack'
  let currentLbTab = "alltime";
  let shareContext = null; // populated after every round so Share Score always has fresh data

  let state = {
    mode: null,          // 'classic' | 'timeAttack' | 'daily'
    level: null,         // 'easy' | 'medium' | 'hard' | null (daily)
    cfg: null,           // resolved { min, max, attempts, maxScore }
    secret: null,
    attemptsUsed: 0,
    active: false,
    dailyDateKey: null,
    timeTotal: 0,
    timeRemaining: 0,
    timerId: null,
    warned10: false,
    warned5: false,
  };

  let audioMode = localStorage.getItem(STORAGE_PREFIX + "audioMode") || "voice"; // 'voice' | 'sound' | 'mute'
  if (!["voice", "sound", "mute"].includes(audioMode)) audioMode = "voice";

  function soundEnabled() { return audioMode !== "mute"; }

  /* ---------------------------------------------------------------------
     5. Voice system (Web Speech API)
     --------------------------------------------------------------------- */
  function pickVoice() {
    if (!("speechSynthesis" in window)) return null;
    const voices = speechSynthesis.getVoices();
    if (!voices || !voices.length) return null;
    return voices.find((v) => /en-US/i.test(v.lang)) || voices.find((v) => /^en/i.test(v.lang)) || voices[0];
  }

  function speak(text) {
    if (audioMode !== "voice") return;
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel(); // never let announcements overlap
    const utter = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) utter.voice = voice;
    utter.rate = 1.03;
    utter.pitch = 1.0;
    speechSynthesis.speak(utter);
  }

  // Maps a proximity tier to the spoken phrase for that tier (distinct from
  // the on-screen tier label, which has finer granularity).
  function voiceLineForTier(tierKey) {
    switch (tierKey) {
      case "icecold":
      case "cold":          return "You're getting colder.";
      case "warm":
      case "hot":            return "You're getting warmer.";
      case "veryclose":      return "Very close!";
      case "extremelyclose": return "Excellent guess!";
      default:               return "";
    }
  }

  function cycleAudioMode() {
    const order = ["voice", "sound", "mute"];
    audioMode = order[(order.indexOf(audioMode) + 1) % order.length];
    localStorage.setItem(STORAGE_PREFIX + "audioMode", audioMode);
    applyAudioModeUI();
  }

  function applyAudioModeUI() {
    soundOnIcon.hidden = audioMode === "mute";
    soundOffIcon.hidden = audioMode !== "mute";
    audioModeBtn.classList.toggle("mode-voice", audioMode === "voice");
    audioModeBtn.classList.toggle("mode-mute", audioMode === "mute");
    audioModeBtn.setAttribute("aria-pressed", String(audioMode === "mute"));
    audioModeBtn.title = audioMode === "voice" ? "Sound + Voice" : audioMode === "sound" ? "Sound only" : "Muted";
  }

  /* ---------------------------------------------------------------------
     6. Sound effects (Web Audio API, no audio files needed)
     --------------------------------------------------------------------- */
  let audioCtx = null;
  function getCtx() {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
    }
    return audioCtx;
  }

  function tone(freq, duration, { type = "sine", gain = 0.18, delay = 0, slideTo = null } = {}) {
    if (!soundEnabled()) return;
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + delay + duration);
    amp.gain.setValueAtTime(0.0001, ctx.currentTime + delay);
    amp.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + delay + 0.015);
    amp.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  }

  const sfx = {
    click: () => tone(380, 0.07, { type: "sine", gain: 0.1 }),
    select: () => tone(520, 0.09, { type: "triangle", gain: 0.12 }),
    low: () => { tone(330, 0.13, { type: "triangle", gain: 0.16 }); tone(392, 0.13, { type: "sine", gain: 0.08, delay: 0.05 }); },
    high: () => { tone(620, 0.13, { type: "triangle", gain: 0.15 }); tone(740, 0.13, { type: "sine", gain: 0.08, delay: 0.05 }); },
    invalid: () => tone(160, 0.14, { type: "square", gain: 0.1 }),
    lastChance: () => { tone(880, 0.09, { type: "sine", gain: 0.14 }); tone(880, 0.09, { type: "sine", gain: 0.14, delay: 0.16 }); },
    win: () => {
      [261.63, 329.63, 392.0].forEach((f) => tone(f, 0.55, { type: "triangle", gain: 0.09 }));
      [392, 523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, 0.2, { type: "triangle", gain: 0.19, delay: 0.1 + i * 0.11 }));
      [1046.5, 1318.51].forEach((f) => tone(f, 0.65, { type: "triangle", gain: 0.13, delay: 0.78 }));
      [1567.98, 1760, 2093, 2349.32].forEach((f, i) => tone(f, 0.13, { type: "sine", gain: 0.1, delay: 0.88 + i * 0.07 }));
    },
    lose: () => {
      [392, 349.23, 311.13, 261.63].forEach((f, i) => tone(f, 0.34, { type: "triangle", gain: 0.15, delay: i * 0.27 }));
      tone(196, 0.55, { type: "sine", gain: 0.13, delay: 1.18 });
    },
    achievement: () => {
      [880, 1108.73, 1318.51].forEach((f, i) => tone(f, 0.13, { type: "sine", gain: 0.14, delay: i * 0.09 }));
    },
  };

  /* ---------------------------------------------------------------------
     7. Vibration feedback (mobile)
     --------------------------------------------------------------------- */
  function vibrate(pattern) {
    if (navigator.vibrate) { try { navigator.vibrate(pattern); } catch { /* ignore */ } }
  }

  /* ---------------------------------------------------------------------
     8. Celebration: confetti, particles, screen flash, glow
     --------------------------------------------------------------------- */
  function celebrate() {
    confettiLayer.innerHTML = "";

    for (let i = 0; i < 90; i++) {
      const piece = document.createElement("span");
      piece.className = "confetti-piece";
      const size = 6 + Math.random() * 6;
      piece.style.width = `${size}px`;
      piece.style.height = `${size * 0.4}px`;
      piece.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      piece.style.left = `${Math.random() * 100}%`;
      const duration = 2.2 + Math.random() * 1.6;
      piece.style.animationDuration = `${duration}s`;
      piece.style.animationDelay = `${Math.random() * 0.4}s`;
      piece.style.setProperty("--drift", `${Math.random() * 240 - 120}px`);
      piece.style.setProperty("--spin", `${Math.random() * 720 - 360}deg`);
      confettiLayer.appendChild(piece);
      setTimeout(() => piece.remove(), (duration + 1) * 1000);
    }

    const poppers = ["🎉", "🎊", "✨"];
    for (let i = 0; i < 10; i++) {
      const span = document.createElement("span");
      span.className = "popper-emoji";
      span.textContent = poppers[Math.floor(Math.random() * poppers.length)];
      const fromLeft = i % 2 === 0;
      span.style.left = fromLeft ? `${5 + Math.random() * 10}%` : `${85 + Math.random() * 10}%`;
      span.style.top = `${58 + Math.random() * 20}%`;
      const bx = (fromLeft ? 1 : -1) * (80 + Math.random() * 120);
      const by = -(120 + Math.random() * 160);
      span.style.setProperty("--bx", `${bx}px`);
      span.style.setProperty("--by", `${by}px`);
      span.style.setProperty("--brot", `${Math.random() * 60 - 30}deg`);
      confettiLayer.appendChild(span);
      setTimeout(() => span.remove(), 1300);
    }

    spawnParticleBurst();
    flashScreen();
    glowPulseCore();
  }

  function spawnParticleBurst() {
    const count = 28;
    for (let i = 0; i < count; i++) {
      const p = document.createElement("span");
      p.className = "particle-burst";
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.25;
      const dist = 60 + Math.random() * 100;
      p.style.setProperty("--px", `${Math.cos(angle) * dist}px`);
      p.style.setProperty("--py", `${Math.sin(angle) * dist}px`);
      p.style.background = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
      p.style.left = "50%";
      p.style.top = "44%";
      confettiLayer.appendChild(p);
      setTimeout(() => p.remove(), 900);
    }
  }

  function flashScreen() {
    screenFlash.classList.remove("flash-active");
    void screenFlash.offsetWidth; // restart animation
    screenFlash.classList.add("flash-active");
  }

  function glowPulseCore() {
    pulseCore.classList.remove("victory-glow");
    void pulseCore.offsetWidth;
    pulseCore.classList.add("victory-glow");
  }

  function animateScoreTo(el, value) {
    el.textContent = value;
    el.classList.remove("score-pop");
    void el.offsetWidth;
    el.classList.add("score-pop");
  }

  /* ---------------------------------------------------------------------
     9. Color / proximity tiers / pulse visualizer
     --------------------------------------------------------------------- */
  const COLOR_STOPS = ["#04d9b2", "#4f46e5", "#ff4fa3", "#ff5c39"]; // mint -> indigo -> pink -> coral
  const RGB_STOPS = COLOR_STOPS.map(hexToRgb);

  function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
  }
  function mix(a, b, t) {
    return { r: Math.round(a.r + (b.r - a.r) * t), g: Math.round(a.g + (b.g - a.g) * t), b: Math.round(a.b + (b.b - a.b) * t) };
  }
  function colorAt(p) {
    const segments = RGB_STOPS.length - 1;
    const scaled = Math.min(0.999, Math.max(0, p)) * segments;
    const idx = Math.floor(scaled);
    const t = scaled - idx;
    return mix(RGB_STOPS[idx], RGB_STOPS[idx + 1], t);
  }
  function rgbStr({ r, g, b }, a = 1) { return a === 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${a})`; }

  function setPulse(proximity) {
    const p = Math.max(0, Math.min(1, proximity));
    const rgb = colorAt(p);
    const duration = (2.4 - p * 1.9).toFixed(2);
    pulseWrap.style.setProperty("--pulse-color", rgbStr(rgb));
    pulseWrap.style.setProperty("--pulse-glow", rgbStr(rgb, 0.45));
    pulseWrap.style.setProperty("--pulse-duration", `${duration}s`);
  }
  function resetPulse() {
    pulseWrap.style.removeProperty("--pulse-color");
    pulseWrap.style.removeProperty("--pulse-glow");
    pulseWrap.style.removeProperty("--pulse-duration");
  }

  // Six-tier proximity system based on distance as a percentage of the
  // difficulty's total range (per the upgraded spec):
  //   >50% Ice Cold · 30-50% Cold · 15-30% Warm · 5-15% Hot · <=5% Very Close · <=2% Extremely Close
  function proximityTier(distance, span) {
    const pct = span === 0 ? 0 : distance / span;
    if (pct <= 0.02) return { key: "extremelyclose", label: "EXTREMELY CLOSE" };
    if (pct <= 0.05) return { key: "veryclose", label: "VERY CLOSE" };
    if (pct <= 0.15) return { key: "hot", label: "HOT" };
    if (pct <= 0.30) return { key: "warm", label: "WARM" };
    if (pct <= 0.50) return { key: "cold", label: "COLD" };
    return { key: "icecold", label: "ICE COLD" };
  }

  /* ---------------------------------------------------------------------
     10. Chances / timer ring indicator + toasts
     --------------------------------------------------------------------- */
  let warningToastTimer = null;
  let infoToastTimer = null;

  // Generic ring updater shared by the guess-countdown ring (Classic/Daily)
  // and the seconds-countdown ring (Time Attack) — only the danger/warn
  // thresholds differ between the two.
  function updateChancesRing(remaining, max, opts = {}) {
    const danger = opts.danger ?? 1;
    const warn = opts.warn ?? 2;
    const fraction = Math.max(0, remaining / max);
    const offset = RING_CIRCUMFERENCE * (1 - fraction);
    ringFg.style.strokeDashoffset = offset.toFixed(2);
    chancesNumberEl.textContent = Math.max(0, remaining);

    let stateName = "normal";
    if (remaining <= danger) stateName = "danger";
    else if (remaining <= warn) stateName = "warn";

    chancesBadge.classList.remove("state-warn", "state-danger");
    if (stateName !== "normal") chancesBadge.classList.add(`state-${stateName}`);
    return stateName === "danger";
  }

  function showWarningToast(text) {
    lastChanceText.textContent = text;
    lastChanceToast.classList.add("show");
    clearTimeout(warningToastTimer);
    warningToastTimer = setTimeout(() => lastChanceToast.classList.remove("show"), 2400);
  }

  function showInfoToast(text, icon = "✓") {
    infoToastIcon.textContent = icon;
    infoToastText.textContent = text;
    infoToast.classList.add("show");
    clearTimeout(infoToastTimer);
    infoToastTimer = setTimeout(() => infoToast.classList.remove("show"), 2400);
  }

  // Achievement toasts are queued so multiple unlocks in one game don't overlap.
  let achievementQueue = [];
  let achievementShowing = false;
  function enqueueAchievementToast(def) { achievementQueue.push(def); processAchievementQueue(); }
  function processAchievementQueue() {
    if (achievementShowing || achievementQueue.length === 0) return;
    achievementShowing = true;
    const def = achievementQueue.shift();
    achievementToastIcon.textContent = def.icon;
    achievementToastText.textContent = def.name;
    achievementToast.classList.add("show");
    sfx.achievement();
    setTimeout(() => {
      achievementToast.classList.remove("show");
      setTimeout(() => { achievementShowing = false; processAchievementQueue(); }, 350);
    }, 2700);
  }

  /* ---------------------------------------------------------------------
     11. Statistics
     --------------------------------------------------------------------- */
  function defaultStats() {
    return {
      gamesPlayed: 0, gamesWon: 0, gamesLost: 0, totalGuesses: 0,
      bestStreak: 0, currentStreak: 0, highestScore: 0, fastestWinAttempts: null,
    };
  }
  function loadStats() { return readJSON(STORAGE_PREFIX + "stats", defaultStats()); }
  function saveStats(s) { writeJSON(STORAGE_PREFIX + "stats", s); }

  function recordGameResult(ctx) {
    const stats = loadStats();
    stats.gamesPlayed += 1;
    stats.totalGuesses += ctx.attemptsUsed;
    if (ctx.won) {
      stats.gamesWon += 1;
      stats.currentStreak += 1;
      stats.bestStreak = Math.max(stats.bestStreak, stats.currentStreak);
      if (ctx.score > stats.highestScore) stats.highestScore = ctx.score;
      if (stats.fastestWinAttempts === null || ctx.attemptsUsed < stats.fastestWinAttempts) stats.fastestWinAttempts = ctx.attemptsUsed;
    } else {
      stats.gamesLost += 1;
      stats.currentStreak = 0;
    }
    saveStats(stats);
    return stats;
  }

  function renderStatsModal() {
    const s = loadStats();
    const winRate = s.gamesPlayed ? Math.round((s.gamesWon / s.gamesPlayed) * 100) : 0;
    const avgAttempts = s.gamesPlayed ? (s.totalGuesses / s.gamesPlayed).toFixed(1) : "0.0";
    const fastest = s.fastestWinAttempts === null ? "—" : `${s.fastestWinAttempts} guesses`;
    const cards = [
      ["Games Played", s.gamesPlayed],
      ["Games Won", s.gamesWon],
      ["Games Lost", s.gamesLost],
      ["Win Rate", `${winRate}%`],
      ["Average Attempts", avgAttempts],
      ["Best Streak", s.bestStreak],
      ["Current Streak", s.currentStreak],
      ["Highest Score", s.highestScore],
      ["Fastest Win", fastest],
      ["Total Guesses", s.totalGuesses],
    ];
    statsGrid.innerHTML = cards
      .map(([label, value]) => `<div class="stat-card"><span class="sc-label">${label}</span><span class="sc-value">${value}</span></div>`)
      .join("");
  }

  /* ---------------------------------------------------------------------
     12. Achievements
     --------------------------------------------------------------------- */
  function loadAchievements() { return readJSON(STORAGE_PREFIX + "achievements", {}); }
  function saveAchievements(a) { writeJSON(STORAGE_PREFIX + "achievements", a); }

  function checkAchievements(stats, ctx) {
    const unlocked = loadAchievements();
    const newly = [];
    ACHIEVEMENTS.forEach((def) => {
      if (!unlocked[def.id] && def.check(stats, ctx)) {
        unlocked[def.id] = new Date().toISOString();
        newly.push(def);
      }
    });
    if (newly.length) saveAchievements(unlocked);
    return newly;
  }

  function renderAchievementsModal() {
    const unlocked = loadAchievements();
    const count = Object.keys(unlocked).length;
    achievementsProgress.textContent = `${count} / ${ACHIEVEMENTS.length} unlocked`;
    achievementsGrid.innerHTML = ACHIEVEMENTS.map((def) => {
      const date = unlocked[def.id];
      const isUnlocked = Boolean(date);
      const dateStr = isUnlocked ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "";
      return `<div class="badge-card ${isUnlocked ? "unlocked" : ""}">
        <span class="badge-icon">${def.icon}</span>
        <span class="badge-name">${def.name}</span>
        ${isUnlocked ? `<span class="badge-date">${dateStr}</span>` : ""}
      </div>`;
    }).join("");
  }

  /* ---------------------------------------------------------------------
     13. Leaderboard (all-time + daily)
     --------------------------------------------------------------------- */
  function escapeHTML(str) {
    return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ""; }

  function loadAllTimeBoard() { return readJSON(STORAGE_PREFIX + "leaderboard", []); }
  function saveAllTimeBoard(list) { writeJSON(STORAGE_PREFIX + "leaderboard", list); }

  function addToAllTimeBoard(entry) {
    const list = loadAllTimeBoard();
    list.push(entry);
    list.sort((a, b) => b.score - a.score);
    const trimmed = list.slice(0, 10);
    saveAllTimeBoard(trimmed);
    const idx = trimmed.findIndex((e) => e.ts === entry.ts);
    return idx === -1 ? null : idx + 1;
  }

  function loadDailyBoard() { return readJSON(STORAGE_PREFIX + "dailyBoard", []); }
  function saveDailyBoardList(list) { writeJSON(STORAGE_PREFIX + "dailyBoard", list); }

  function addToDailyBoard(entry) {
    const list = loadDailyBoard();
    list.push(entry);
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // keep ~30 days of history
    const pruned = list.filter((e) => e.ts >= cutoff);
    saveDailyBoardList(pruned);
    const todays = pruned.filter((e) => e.date === entry.date).sort((a, b) => b.score - a.score);
    const idx = todays.findIndex((e) => e.ts === entry.ts);
    return idx === -1 ? null : idx + 1;
  }

  function renderLeaderboard(tab) {
    let list;
    if (tab === "today") {
      const today = getDateKey();
      list = loadDailyBoard().filter((e) => e.date === today).sort((a, b) => b.score - a.score).slice(0, 10);
    } else {
      list = loadAllTimeBoard();
    }
    leaderboardList.innerHTML = "";
    leaderboardEmpty.hidden = list.length > 0;
    list.forEach((e, i) => {
      const li = document.createElement("li");
      li.className = "lb-row";
      const modeLabel = e.mode === "daily" ? "Daily" : e.mode === "timeAttack" ? "Time Attack" : "Classic";
      li.innerHTML = `<span class="lb-rank">#${i + 1}</span>
        <span class="lb-info">
          <span class="lb-name">${escapeHTML(e.name)}</span>
          <span class="lb-meta">${modeLabel} · ${capitalize(e.difficulty)} · ${e.attempts} guesses · ${e.date}</span>
        </span>
        <span class="lb-score">${e.score}</span>`;
      leaderboardList.appendChild(li);
    });
  }

  function getStoredPlayerName() { return localStorage.getItem(STORAGE_PREFIX + "playerName") || ""; }

  /* ---------------------------------------------------------------------
     14. Daily Challenge
     --------------------------------------------------------------------- */
  function getDateKey(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function getDateDisplay(d = new Date()) { return d.toLocaleDateString(undefined, { month: "long", day: "numeric" }); }

  // Deterministic seed so every player gets the same secret on the same day.
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function getDailySecret(dateKey) {
    const rand = mulberry32(hashStr(`pulse-daily-${dateKey}`));
    const { min, max } = DAILY_CONFIG;
    return min + Math.floor(rand() * (max - min + 1));
  }

  function dailyRecordKey(dateKey) { return `${STORAGE_PREFIX}daily_${dateKey}`; }
  function loadDailyRecord(dateKey) { return readJSON(dailyRecordKey(dateKey), null); }
  function saveDailyRecord(dateKey, record) { writeJSON(dailyRecordKey(dateKey), record); }

  let dailyCountdownTimer = null;
  function pad(n) { return String(n).padStart(2, "0"); }
  function tickDailyCountdown() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    let ms = next - now;
    if (ms <= 0) { renderDailyBanner(); return; }
    const h = Math.floor(ms / 3600000); ms -= h * 3600000;
    const m = Math.floor(ms / 60000); ms -= m * 60000;
    const s = Math.floor(ms / 1000);
    dailyCountdown.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
  }
  function startDailyCountdown() { stopDailyCountdown(); tickDailyCountdown(); dailyCountdownTimer = setInterval(tickDailyCountdown, 1000); }
  function stopDailyCountdown() { if (dailyCountdownTimer) { clearInterval(dailyCountdownTimer); dailyCountdownTimer = null; } }

  function renderDailyBanner() {
    const dateKey = getDateKey();
    dailyDateText.textContent = getDateDisplay();
    const rec = loadDailyRecord(dateKey);
    if (rec && rec.played) {
      dailyAction.hidden = true;
      dailyResult.hidden = false;
      dailyResultLine.innerHTML = rec.won
        ? `You scored <strong>${rec.score}</strong> in <strong>${rec.attemptsUsed}</strong> guesses`
        : `No signal today — better luck tomorrow`;
      startDailyCountdown();
    } else {
      dailyAction.hidden = false;
      dailyResult.hidden = true;
      stopDailyCountdown();
    }
  }

  function startDaily() {
    const dateKey = getDateKey();
    const existing = loadDailyRecord(dateKey);
    if (existing && existing.played) { renderDailyBanner(); return; }
    sfx.select();
    levelBtns.forEach((b) => b.classList.remove("active"));
    state.dailyDateKey = dateKey;
    state.mode = "daily";
    state.level = null;
    state.cfg = DAILY_CONFIG;
    state.secretOverride = getDailySecret(dateKey);
    beginRound();
  }

  function shareDailyResult() {
    const rec = loadDailyRecord(getDateKey());
    if (!rec) return;
    doShare(buildShareText({ mode: "daily", won: rec.won, attemptsUsed: rec.attemptsUsed, score: rec.score }));
  }

  /* ---------------------------------------------------------------------
     15. Scoring
     --------------------------------------------------------------------- */
  function livePotentialScore() {
    const cfg = state.cfg;
    const remaining = cfg.attempts - state.attemptsUsed;
    return Math.max(0, Math.round((cfg.maxScore * remaining) / cfg.attempts));
  }
  function potentialTimeAttackScore() {
    return Math.max(50, Math.round(state.cfg.maxScore * (state.timeRemaining / state.timeTotal)));
  }
  function computeScore() {
    const cfg = state.cfg;
    if (state.mode === "timeAttack") return potentialTimeAttackScore();
    const factor = (cfg.attempts - state.attemptsUsed + 1) / cfg.attempts;
    return Math.max(1, Math.round(cfg.maxScore * factor));
  }

  /* ---------------------------------------------------------------------
     16. Core game flow
     --------------------------------------------------------------------- */
  function setUIMode(mode) {
    uiMode = mode;
    classicTabBtn.classList.toggle("active", mode === "classic");
    timeAttackTabBtn.classList.toggle("active", mode === "timeAttack");
    classicTabBtn.setAttribute("aria-selected", String(mode === "classic"));
    timeAttackTabBtn.setAttribute("aria-selected", String(mode === "timeAttack"));
    levelBtns.forEach((btn) => {
      const meta = btn.querySelector(".level-meta");
      meta.textContent = mode === "timeAttack" ? meta.dataset.timeattack : meta.dataset.classic;
    });
  }

  function startRoundForLevel(level, mode) {
    sfx.select();
    state.mode = mode;
    state.level = level;
    levelBtns.forEach((b) => b.classList.toggle("active", b.dataset.level === level));
    const base = LEVELS[level];
    if (mode === "timeAttack") {
      state.cfg = { min: base.min, max: base.max, attempts: TIME_ATTACK_MAX_ATTEMPTS, maxScore: base.maxScore };
      state.timeTotal = TIME_ATTACK_SECONDS[level];
    } else {
      state.cfg = base;
    }
    beginRound();
  }

  function beginRound() {
    const cfg = state.cfg;
    state.secret = state.mode === "daily" ? state.secretOverride : Math.floor(Math.random() * (cfg.max - cfg.min + 1)) + cfg.min;
    state.attemptsUsed = 0;
    state.active = true;
    state.warned10 = false;
    state.warned5 = false;

    gameCard.classList.add("active");
    endPanel.hidden = true;
    endPanel.classList.remove("win", "lose");
    saveScoreRow.hidden = true;
    saveScoreConfirm.hidden = true;
    rangeLineEl.textContent = `${cfg.min}–${cfg.max}`;
    feedbackLine.className = "feedback";
    dialReadout.className = "pulse-readout";
    dialReadout.textContent = "AWAITING INPUT";
    pulseValueEl.textContent = "?";
    resetPulse();
    historyEl.innerHTML = "";
    guessInput.value = "";
    guessInput.disabled = false;
    tryBtn.disabled = false;
    guessInput.min = cfg.min;
    guessInput.max = cfg.max;
    guessInput.focus({ preventScroll: true });
    lastChanceToast.classList.remove("show");
    confettiLayer.innerHTML = "";
    screenFlash.classList.remove("flash-active");
    pulseCore.classList.remove("victory-glow");
    stopTimeAttackTimer();

    if (state.mode === "timeAttack") {
      modeFlag.hidden = false;
      modeFlag.textContent = "⚡ TIME ATTACK";
      modeFlag.className = "mode-flag flag-time";
      chancesBadge.classList.add("mode-timer");
      chancesLabelText.textContent = "seconds left";
      state.timeRemaining = state.timeTotal;
      updateChancesRing(state.timeRemaining, state.timeTotal, { danger: 10, warn: 20 });
      feedbackLine.textContent = `${state.timeTotal} seconds on the clock. Guess as many times as you like.`;
      bestValueEl.textContent = getBest("timeAttack", state.level);
      startTimeAttackTimer();
    } else if (state.mode === "daily") {
      modeFlag.hidden = false;
      modeFlag.textContent = "📅 DAILY CHALLENGE";
      modeFlag.className = "mode-flag flag-daily";
      chancesBadge.classList.remove("mode-timer");
      chancesLabelText.textContent = "guesses left";
      updateChancesRing(cfg.attempts, cfg.attempts);
      feedbackLine.textContent = `${cfg.attempts} guesses. Today's signal is waiting.`;
      bestValueEl.textContent = "—";
    } else {
      modeFlag.hidden = true;
      chancesBadge.classList.remove("mode-timer");
      chancesLabelText.textContent = "guesses left";
      updateChancesRing(cfg.attempts, cfg.attempts);
      feedbackLine.textContent = `${cfg.attempts} guesses. Find the number.`;
      bestValueEl.textContent = getBest("classic", state.level);
    }

    scoreValueEl.textContent = state.mode === "timeAttack" ? potentialTimeAttackScore() : livePotentialScore();
  }

  function startTimeAttackTimer() {
    state.timerId = setInterval(() => {
      state.timeRemaining -= 1;
      updateChancesRing(state.timeRemaining, state.timeTotal, { danger: 10, warn: 20 });
      scoreValueEl.textContent = potentialTimeAttackScore();

      if (state.timeRemaining === 10 && !state.warned10) {
        state.warned10 = true;
        speak("10 seconds remaining");
        vibrate(50);
        showWarningToast("10 seconds remaining!");
      }
      if (state.timeRemaining === 5 && !state.warned5) {
        state.warned5 = true;
        speak("5 seconds remaining");
        vibrate([50, 50, 50]);
        showWarningToast("5 seconds remaining!");
      }
      if (state.timeRemaining <= 0) {
        stopTimeAttackTimer();
        feedbackLine.className = "feedback lose";
        feedbackLine.textContent = "Time's up!";
        endRound(false);
      }
    }, 1000);
  }
  function stopTimeAttackTimer() { if (state.timerId) { clearInterval(state.timerId); state.timerId = null; } }

  function submitGuess(e) {
    e.preventDefault();
    if (!state.active) return;

    const cfg = state.cfg;
    const raw = guessInput.value.trim();
    const guess = Number(raw);

    if (raw === "" || !Number.isInteger(guess) || guess < cfg.min || guess > cfg.max) {
      sfx.invalid();
      feedbackLine.className = "feedback";
      feedbackLine.textContent = `Enter a whole number between ${cfg.min} and ${cfg.max}.`;
      guessInput.classList.add("shake");
      setTimeout(() => guessInput.classList.remove("shake"), 300);
      return;
    }

    state.attemptsUsed += 1;
    pulseValueEl.textContent = guess;

    const distance = Math.abs(guess - state.secret);
    const span = cfg.max - cfg.min;
    const proximity = span === 0 ? 1 : 1 - distance / span;
    setPulse(proximity);
    const tier = proximityTier(distance, span);
    dialReadout.className = `pulse-readout tier-${tier.key}`;
    dialReadout.textContent = tier.label;

    const won = guess === state.secret;
    const timed = state.mode === "timeAttack";
    let remaining = null;
    let isLastChance = false;
    if (!timed) {
      remaining = Math.max(0, cfg.attempts - state.attemptsUsed);
      isLastChance = updateChancesRing(remaining, cfg.attempts);
    }

    if (won) {
      addChip(guess, "win");
      feedbackLine.className = "feedback win";
      feedbackLine.textContent = "Got it! Signal locked.";
      endRound(true);
    } else if (guess < state.secret) {
      addChip(guess, "low");
      sfx.low();
      vibrate(40);
      feedbackLine.className = "feedback low";
      feedbackLine.textContent = "Too low — go higher.";
    } else {
      addChip(guess, "high");
      sfx.high();
      vibrate(40);
      feedbackLine.className = "feedback high";
      feedbackLine.textContent = "Too high — go lower.";
    }

    if (!won && !timed && remaining <= 0) {
      feedbackLine.className = "feedback lose";
      feedbackLine.textContent = "Out of guesses.";
      endRound(false);
    } else if (!won) {
      scoreValueEl.textContent = timed ? potentialTimeAttackScore() : livePotentialScore();

      // Voice priority: last chance > low-chances countdown > proximity tier.
      if (!timed && remaining === 1) {
        sfx.lastChance();
        vibrate([60, 60, 60]);
        showWarningToast("Last chance — make it count!");
        speak("Last chance!");
      } else if (!timed && remaining > 1 && remaining <= 3) {
        speak(`${remaining} chances remaining`);
      } else {
        speak(voiceLineForTier(tier.key));
      }
    }

    guessInput.value = "";
    guessInput.focus({ preventScroll: true });
  }

  function addChip(value, kind) {
    const chip = document.createElement("span");
    chip.className = `chip ${kind}`;
    const arrow = kind === "low" ? "↑" : kind === "high" ? "↓" : "✓";
    chip.textContent = `${value} ${arrow}`;
    historyEl.appendChild(chip);
  }

  function endRound(didWin) {
    state.active = false;
    guessInput.disabled = true;
    tryBtn.disabled = true;
    stopTimeAttackTimer();

    const cfg = state.cfg;
    endPanel.hidden = false;
    endPanel.classList.remove("win", "lose");
    endPanel.classList.add(didWin ? "win" : "lose");
    saveScoreRow.hidden = true;
    saveScoreConfirm.hidden = true;

    let score = 0;
    if (didWin) {
      score = computeScore();
      animateScoreTo(scoreValueEl, score);
      endSubtitle.innerHTML = `Found it in <strong>${state.attemptsUsed}</strong> guesses. The number was <strong>${state.secret}</strong>.`;
      endTitle.textContent = "SIGNAL LOCKED";

      if (state.mode !== "daily") {
        const best = getBest(state.mode, state.level);
        const isNewBest = score > best;
        if (isNewBest) setBest(state.mode, state.level, score);
        bestValueEl.textContent = getBest(state.mode, state.level);
        endScore.textContent = score + (isNewBest ? "  ✦ NEW BEST" : "");
      } else {
        endScore.textContent = String(score);
      }

      sfx.win();
      vibrate([80, 40, 80, 40, 160]);
      celebrate();
      const line = WIN_VOICE_LINES[Math.floor(Math.random() * WIN_VOICE_LINES.length)];
      speak(`Signal locked! ${line}`);

      if (score > 0) {
        saveScoreRow.hidden = false;
        nicknameInput.value = getStoredPlayerName();
      }
    } else {
      scoreValueEl.textContent = 0;
      endTitle.textContent = "FLATLINE";
      endSubtitle.innerHTML = `Out of ${state.mode === "timeAttack" ? "time" : "guesses"}. The number was <strong>${state.secret}</strong>.`;
      endScore.textContent = "0";
      sfx.lose();
      speak("Game over!");
    }

    const ctx = {
      won: didWin,
      attemptsUsed: state.attemptsUsed,
      score,
      level: state.level,
      mode: state.mode,
      attemptsCap: state.mode === "timeAttack" ? null : cfg.attempts,
    };
    const stats = recordGameResult(ctx);
    checkAchievements(stats, ctx).forEach(enqueueAchievementToast);

    if (state.mode === "daily") {
      saveDailyRecord(state.dailyDateKey, { played: true, won: didWin, attemptsUsed: state.attemptsUsed, score });
      renderDailyBanner();
    }

    shareContext = { score, attemptsUsed: state.attemptsUsed, mode: state.mode, won: didWin, level: state.level };
  }

  function handleRestart() {
    if (state.mode === "daily") { showInfoToast("Today's challenge is locked until tomorrow"); return; }
    if (!state.level) return;
    sfx.click();
    startRoundForLevel(state.level, state.mode);
  }

  /* ---------------------------------------------------------------------
     17. Modals
     --------------------------------------------------------------------- */
  function openModal(id) { $(id).classList.add("open"); $(id).setAttribute("aria-hidden", "false"); }
  function closeModal(id) { $(id).classList.remove("open"); $(id).setAttribute("aria-hidden", "true"); }
  function closeAllModals() { ["statsModal", "achievementsModal", "leaderboardModal"].forEach(closeModal); }

  /* ---------------------------------------------------------------------
     18. Share
     --------------------------------------------------------------------- */
  function buildShareText(ctx) {
    if (!ctx) return "Playing PULSE — can you find the hidden number?";
    if (ctx.mode === "daily") {
      return ctx.won
        ? `I solved today's PULSE Daily Challenge in ${ctx.attemptsUsed} guesses and scored ${ctx.score} points! Can you beat me?`
        : `Today's PULSE Daily Challenge got the better of me. Think you can crack it?`;
    }
    return ctx.won
      ? `I scored ${ctx.score} points in PULSE and found the signal in only ${ctx.attemptsUsed} guesses! Can you beat my score?`
      : `PULSE got the better of me this round. Can you find the signal?`;
  }

  function copyToClipboard(text) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); showInfoToast("Copied to clipboard"); }
      catch { showInfoToast("Could not copy — try again", "⚠️"); }
      document.body.removeChild(ta);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => showInfoToast("Copied to clipboard")).catch(fallback);
    } else fallback();
  }

  function doShare(text) {
    if (navigator.share) {
      navigator.share({ text, title: "PULSE" }).catch(() => { /* user cancelled or unsupported context */ });
    } else {
      copyToClipboard(text);
    }
  }

  /* ---------------------------------------------------------------------
     19. Keyboard shortcuts
     --------------------------------------------------------------------- */
  function handleGlobalKeydown(e) {
    const key = e.key.toLowerCase();
    if (key === "escape") { closeAllModals(); return; }

    const tag = (e.target.tagName || "").toLowerCase();
    if (tag === "input" || tag === "textarea") return; // don't hijack typing

    if (key === "r") { e.preventDefault(); handleRestart(); }
    else if (key === "m") { e.preventDefault(); cycleAudioMode(); sfx.click(); }
    else if (key === "l") { e.preventDefault(); currentLbTab = "alltime"; renderLeaderboard(currentLbTab); openModal("leaderboardModal"); }
    else if (key === "s") { e.preventDefault(); renderStatsModal(); openModal("statsModal"); }
  }

  /* ---------------------------------------------------------------------
     20. Wiring + init
     --------------------------------------------------------------------- */
  function init() {
    applyAudioModeUI();
    setUIMode("classic");
    renderDailyBanner();

    levelBtns.forEach((btn) => btn.addEventListener("click", () => startRoundForLevel(btn.dataset.level, uiMode)));
    classicTabBtn.addEventListener("click", () => setUIMode("classic"));
    timeAttackTabBtn.addEventListener("click", () => setUIMode("timeAttack"));

    guessForm.addEventListener("submit", submitGuess);

    playAgainBtn.addEventListener("click", () => {
      if (state.mode === "daily") {
        endPanel.hidden = true;
        gameCard.classList.remove("active");
        modeFlag.hidden = true;
        dialReadout.className = "pulse-readout";
        dialReadout.textContent = "PICK A DIFFICULTY";
        feedbackLine.className = "feedback";
        feedbackLine.textContent = "Daily challenge complete — come back tomorrow, or try Classic or Time Attack below.";
        renderDailyBanner();
      } else {
        handleRestart();
      }
    });

    dailyPlayBtn.addEventListener("click", startDaily);
    dailyShareBtn.addEventListener("click", shareDailyResult);

    shareScoreBtn.addEventListener("click", () => doShare(buildShareText(shareContext)));

    saveScoreBtn.addEventListener("click", () => {
      const name = (nicknameInput.value || "").trim().slice(0, 16) || "Player";
      localStorage.setItem(STORAGE_PREFIX + "playerName", name);
      const entry = {
        name,
        score: shareContext.score,
        difficulty: shareContext.level || "daily",
        attempts: shareContext.attemptsUsed,
        mode: shareContext.mode,
        date: getDateKey(),
        ts: Date.now(),
      };
      const rank = shareContext.mode === "daily" ? addToDailyBoard(entry) : addToAllTimeBoard(entry);
      saveScoreRow.hidden = true;
      saveScoreConfirm.hidden = false;
      saveScoreRank.textContent = rank ? `#${rank}` : "saved";
      sfx.click();
    });
    nicknameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveScoreBtn.click(); } });

    audioModeBtn.addEventListener("click", () => { cycleAudioMode(); sfx.click(); });

    statsBtn.addEventListener("click", () => { renderStatsModal(); openModal("statsModal"); });
    achievementsBtn.addEventListener("click", () => { renderAchievementsModal(); openModal("achievementsModal"); });
    leaderboardBtn.addEventListener("click", () => { renderLeaderboard(currentLbTab); openModal("leaderboardModal"); });

    document.querySelectorAll(".modal-close").forEach((btn) => btn.addEventListener("click", () => closeModal(btn.dataset.closeModal)));
    document.querySelectorAll(".modal-overlay").forEach((overlay) => overlay.addEventListener("click", (e) => { if (e.target === overlay) closeModal(overlay.id); }));

    document.querySelectorAll(".lb-tab").forEach((tab) => tab.addEventListener("click", () => {
      document.querySelectorAll(".lb-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      currentLbTab = tab.dataset.lbTab;
      renderLeaderboard(currentLbTab);
    }));

    resetStatsBtn.addEventListener("click", () => { saveStats(defaultStats()); renderStatsModal(); showInfoToast("Statistics reset"); });
    clearLeaderboardBtn.addEventListener("click", () => {
      saveAllTimeBoard([]);
      saveDailyBoardList([]);
      renderLeaderboard(currentLbTab);
      showInfoToast("Leaderboard cleared");
    });

    resetScoresBtn.addEventListener("click", () => {
      Object.keys(LEVELS).forEach((lvl) => {
        localStorage.removeItem(bestKey("classic", lvl));
        localStorage.removeItem(bestKey("timeAttack", lvl));
      });
      if (state.level && state.mode !== "daily") bestValueEl.textContent = getBest(state.mode, state.level);
      sfx.click();
      showInfoToast("Best scores cleared");
    });

    document.addEventListener("keydown", handleGlobalKeydown);

    // Some browsers populate the voice list asynchronously.
    if ("speechSynthesis" in window) {
      speechSynthesis.addEventListener("voiceschanged", () => {});
    }
  }

  init();
})();
