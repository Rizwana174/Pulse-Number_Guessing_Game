# Pulse

A modern, browser-based number guessing game. A hidden number is "broadcasting" nearby — guess your way closer and watch a colorful pulse beat faster as you close in, set against an animated, colorful gradient backdrop with frosted-glass panels.
## 🎮Live Demo:
https://pulse-number-guessing-game.vercel.app/
## 🎥 Demo Video
<video controls src="assets/Demo.mp4" title="Live Gameplay Demo"></video>
## Features

**Core game**
- **Three difficulty levels** — Easy (1–50, 10 guesses), Medium (1–100, 7 guesses), Hard (1–200, 5 guesses)
- **Animated colorful background** — soft, slowly drifting gradient blobs behind frosted glassmorphic cards
- **Live pulse visualizer** — a glassy core with expanding rings that shift color (mint → indigo → pink → coral) and beat faster as your guess gets closer
- **Six-tier proximity feedback** — Ice Cold (>50% of the range away) → Cold (30–50%) → Warm (15–30%) → Hot (5–15%) → Very Close (≤5%) → Extremely Close (≤2%), reflected in the pulse label, color intensity, and voice line
- **Countdown-ring chances indicator** — doubles as a seconds-countdown ring in Time Attack
- **Scoring system** — points scale with how few guesses (or how much time) you have left

**Voice & sound**
- **Voice System** (Web Speech API) with a 3-way toggle: **Sound + Voice**, **Sound Only**, **Mute** — cycle with the toolbar button or the `M` key
- Speaks chances-remaining countdowns, proximity callouts ("You're getting warmer," "Excellent guess!"), "Last chance!", a random energetic line + "Signal locked!" on a win, and "Game over!" on a loss
- Always cancels in-flight speech before speaking the next line, so announcements never overlap
- Synthesized sound effects (Web Audio API) — chimes, last-chance ping, victory fanfare, descending loss phrase, achievement chime

**Victory celebration**
- Confetti, radial particle burst, a full-screen color flash, a pulsing victory glow on the pulse core, and an animated score pop, paired with a randomly-selected energetic voice line

**Statistics & achievements**
- Stats modal (`S`): games played/won/lost, win rate, average attempts, best/current streak, highest score, fastest win, total guesses
- 10 unlockable achievement badges with a popup the moment they're earned and a gallery showing locked/unlocked state with unlock dates

**Leaderboard**
- Enter a nickname to save a score (name, score, difficulty, attempts, date) to a local Top 10
- Two tabs: **All-Time Top 10** and **Today's Signal** (same-day entries, for comparing Daily Challenge runs)
- Open with the toolbar button or `L`; clear anytime

**Time Attack mode**
- Countdown instead of a guess limit — Easy 60s, Medium 45s, Hard 30s, unlimited guesses
- The chances ring repurposes itself into a seconds ring with the same amber/red urgency states, plus voice + vibration warnings at 10s and 5s

**Daily Challenge**
- Everyone gets the same secret number each day (seeded deterministically from the date, so no two days repeat and no server is needed)
- Fixed 1–100 / 7-guess ruleset so scores are directly comparable
- One attempt per day; the banner then shows your result and a live countdown to the next signal, with a one-tap "Share my result" button
- Daily results also land on the "Today's Signal" leaderboard tab

**Mobile & accessibility**
- Larger touch targets, `touch-action: manipulation` on every button to kill tap-delay/double-tap-zoom, responsive layout down to small phones
- Vibration feedback (`navigator.vibrate`) — short pulse on a wrong guess, double pulse on last chance / Time Attack warnings, a celebration pattern on a win
- Visible keyboard focus states, respects `prefers-reduced-motion`

**Share**
- "Share Score" / "Share my result" use the native Share sheet where available, falling back to clipboard copy with a confirmation toast

**Keyboard shortcuts**
- `Enter` submit guess · `R` restart · `M` cycle sound/voice mode · `L` leaderboard · `S` statistics · `Esc` close any modal

## Files

```
index.html   structure — toolbar, daily banner, mode tabs, modals, end panel
style.css    visual design (glassmorphism theme) + all new component styles
script.js    game logic: voice, sound, vibration, stats, achievements,
             leaderboard, Time Attack, Daily Challenge, scoring, persistence
```

No build step, no dependencies, no backend — still three static files.

## Run it locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Deploy to Vercel

**Option 1 — Vercel CLI**

```bash
npm install -g vercel
cd pulse
vercel
```

Follow the prompts (link or create a project) and accept the defaults — Vercel auto-detects this as a static site.

**Option 2 — Vercel dashboard**

1. Push this folder to a GitHub repo.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repo.
3. Leave the framework preset as "Other" / static — no build command is needed.
4. Click Deploy.

Either way you'll get a live `*.vercel.app` URL in under a minute.

## Notes on the scoring formula

**Classic / Daily** — for a difficulty with `maxScore` and `attempts`:

```
score = round(maxScore * (attempts - attemptsUsed + 1) / attempts)
```

Guessing correctly on the first try earns the full `maxScore`; guessing on the last possible try still earns a small reward rather than zero.

**Time Attack** — score is driven by time remaining instead of guesses used:

```
score = max(50, round(maxScore * (timeRemaining / timeTotal)))
```

## Notes on a few interpretive choices

A couple of items in the feature list were ambiguous enough to need a concrete decision — documented here so they're easy to revisit:

- **Perfect Accuracy** badge: unlocked for winning using at most half of the allowed guesses (not applicable in Time Attack, which has no guess cap).
- **Score Above 2000**: hard mode's max score is exactly 2000 (only reachable on a first-try win), so this is checked as `score >= 2000` rather than strictly "above," or it would be unwinnable.
- **Daily Challenge difficulty**: fixed at one ruleset (1–100, 7 guesses) rather than letting players choose Easy/Medium/Hard, so that "compare scores" is apples-to-apples for everyone.
- **Leaderboard storage**: the All-Time board is capped at the top 10 as specified. The Daily board keeps ~30 days of history (filtered to "today" in the UI) so the comparison feature has something to compare against without growing forever.
- **Best scores**: Classic and Time Attack track separate per-difficulty bests (so a Time Attack run can't silently overwrite a Classic best); your existing Classic bests from before this update carry over unchanged.
