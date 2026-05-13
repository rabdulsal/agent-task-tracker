# Relay — Video Script

**Target length:** ~2:30  
**Format:** Screen recording with voiceover. No webcam required.  
**Tone:** Direct, confident, slightly dry. Not hype. Like a tool demo from someone who uses the thing every day.

---

## SHOT LIST / SEQUENCE

| Time | Screen | Voiceover |
|------|--------|-----------|
| 0:00–0:03 | Relay menu bar icon (static) | — |
| 0:03–0:18 | Multiple Claude Code terminal windows, tasks flying | Hook |
| 0:18–0:40 | Back to the problem statement | Problem |
| 0:40–1:00 | Open Relay flyout, show task board | Solution |
| 1:00–1:45 | Sign up → get token → install → connect | Mac setup |
| 1:45–2:15 | Terminal: mcp add → new session → relay_summary → task appears in flyout | Agent setup |
| 2:15–2:30 | Relay flyout, tasks updating, menu bar pings pink | Wrap + CTA |

---

## FULL SCRIPT

---

### [0:00 — HOOK]

*[Show: several Claude Code terminal windows open. Agents working. Hard to track.]*

> "You've got multiple AI agents running. Claude Code here, another one over there. They're all doing something — but what, exactly?"

*[Pause 1 second]*

> "This is the problem Relay solves."

---

### [0:18 — PROBLEM]

*[Show: scrolling through a long conversation history in Claude Code. Lots of output.]*

> "Right now, if you want to know what your agents have done — or what they're stuck on — you have to dig through conversation history. Every session. Every agent. Separately."

> "There's no shared view. No central place that just says: here's what's in progress, here's what's blocked, here's what needs you."

---

### [0:40 — SOLUTION]

*[Show: click the Relay antenna icon in the menu bar. Flyout opens showing tasks grouped by status — active, pending, blocked.]*

> "This is Relay."

*[Beat.]*

> "A shared task board that lives in your menu bar. Your agents post to it as they work. You see everything — in real time, from any machine."

> "When something is blocked, the icon turns pink. You click, you see why, you unblock. That's the whole loop."

---

### [1:00 — MAC APP SETUP]

*[Show: browser opening tryrelayapp.com/get-started]*

> "Setup takes about five minutes. Sign up here — you'll get a Relay Token."

*[Show: token revealed on dashboard — rt_xxxxxx]*

> "Copy that token."

*[Show: Mac App Store → search TestFlight → install]*

> "Relay is currently in TestFlight beta. Grab TestFlight from the Mac App Store if you don't have it."

*[Show: TestFlight showing Relay → Install]*

> "Accept the invite in your welcome email, install."

*[Show: Relay icon appears in menu bar → click it → gear icon → Settings dialog → paste token → Connect]*

> "Open Relay, hit the gear, paste your token, connect."

*[Show: flyout loads — connected, empty task board]*

> "You're live. Empty for now — that changes in the next step."

---

### [1:45 — AGENT SETUP]

*[Show: terminal window]*

> "Now wire up your agents. One command."

*[Show: typing the command]*

```
claude mcp add relay \
  -e RELAY_TOKEN=rt_xxxx \
  -- npx -y @relayctl/mcp
```

> "This registers Relay as an MCP server in Claude Code. Replace the token with yours."

*[Show: new Claude Code session opening]*

> "Start a new session. At the top of any conversation where you want your agent oriented, run relay_summary."

*[Show: relay_summary output — counts + any blocked tasks]*

> "Instantly: total tasks, what's in progress, what's blocked. About 300 tokens. Compare that to re-reading an entire conversation history."

*[Show: Claude Code mid-task → relay_create fires → switch to menu bar → new task appears in flyout]*

> "Now watch. As the agent works, it posts tasks here. Status updates in real time. No polling, no prompting."

---

### [2:15 — WRAP + CTA]

*[Show: Relay flyout — tasks updating, menu bar icon briefly turns pink for a blocked task]*

> "This is what it looks like when your agents are actually on task."

*[Show: full flyout — active, pending, done sections]*

> "Everything your stack is doing, in one place, always current."

*[Hold on Relay icon in menu bar]*

> "Relay. Get started free at tryrelayapp.com."

---

## RECORDING TIPS

- **Resolution:** Record at 1440×900 or higher. Retina if possible.
- **Menu bar:** Hide other icons if you can — keeps focus on Relay.
- **Flyout width:** 420px. Enough to read task titles without scrolling.
- **Swipe demo:** Slowly swipe right on a task to show the status strip — that's a highlight moment.
- **Pauses:** Leave 0.5s of silence at each scene cut. Easier to edit.
- **Font size:** Bump terminal font to 16–18px so it reads on smaller screens.
