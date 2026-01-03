---
title: "Gastown"
startDate: 2026-01-03T10:52:21.567Z
type: "smidgeon"
topics: ["Artificial Intelligence", "Agents", "Software Development", "Design"]
external:
  url: "https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04"
  title: "Welcome to Gastown"
  author: "Steve Yegge"
draft: true
---

Steve Yegge just published [Gastown](https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04), a fairly unhinged manifesto and onboarding tour of his his Mad Max themed [agent orchestrator of the highest order].

I have not used Gastown, because Yegge emphatically told me not to. Multiple times. I trust the guy's guidance on his own vibecoded slush pile.

[quote]

Regardless of what you think of Yegge's brash, in-your-face, sailor swearing disposition I think he first deserves high praise for execising enough agency to build something untenable with the current state of models. And then running a tour of his very shitty but provocative plane while it's a quarter-built and mid-flight.

When I was taken to the Tate Modern as a child I'd point at pieces like X and Y and say to my mother "I could do that", and she would say "yes, but you didn't."

Many people have talked about what large-scale agent orchestration _could_ look like in a few years, and no one else attempted to sincerely build it.

I don't think Gastown is notable as a serious, working developer tool for anyone other than Yegge. I think it's notable as a piece of speculative design fiction. It's far enough ahead of the curve that it's worth paying attention.

---

A few interesting observations:

**1. Design and planning becomes the bottleneck when you hand all production code over to agentic systems.**

Design is a bottleneck even when the interface is just a TUI. As Yegge puts it: "Gas Town churns through implementation plans so quickly that you have to do a LOT of design and planning to keep the engine fed."

**2. The cost is high, but possibly artificially high**

Could be as much as $2k+ per month
This is wild speculation - I'm open to more accurate guesses. At this early stage the efficiency of the system is literal shit, so the cost ≈ valuable output equation is inaccurate. But companies would pay near this for a high quality, low waste version of this.

**3. If you squint you can see the conceptual basis of future agentic systems**

The current conceptual design here is all over the shop. polecats, deacons, dogs, boot the dog, seancing, beads, epics, molecules, protomolecules, MEOW stack, convoys, patrols, refinery, workflows. I got lost somewhere after the MEOW stack.

But these point at the shape of future agentic primitives: there's a central orchestrator, implementation monkeys, a git merge resolver, an unsticker who troubleshoots issues, a work hustler, maintenance workers, special ops teams. Agents with specific roles working in a cohesive flow with traditional programming supports: git, daemons, issue tracking, tmux.

The gist seems to be breaking tasks down into atomic units of work, tracked in git, executed, checked, and merged through a zoo of loops and pre-defined workflows.

**4. Steve is not looking at any code.**

How much hands-on access to code will developers need in the next generation of tools? How close does it need to be? I'm in the code-must-be-close camp, at least for the next 2 years.

My bias is I do front-end, and language is a poor medium for designing easing curves and aesthetic feelings. I always need to touch the code, and it's often faster to CSS than prompt. Front-end requires constant human-in-the-loop checks so even if you have a dozen agents working, I am the bottleneck. Scale isn't that helpful.
