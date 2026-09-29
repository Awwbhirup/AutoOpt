# What the owner wants (condensed from his messages)

## Direction (2026-09-29)
- Primary goal: a start-to-end, fully polished, highly impressive, high-fidelity, modern site that
  works well and has a lot of features. A full-stack project he can put on his resume for
  placements and full-stack developer jobs, using the tech recruiters look for.
- The graded subjects (Compiler Design Project 5, Probability & Statistics BMAT202L) are squeezed
  into it for marks. Their requirements must still hold, but they are not the focus.
- Scope is open. Big new features, significant improvements, anything that adds real resume value.
- Not cost-cutting: Fly.io for the service, Vercel for web, Neon for Postgres. Willing to pay a
  little for things with genuine value.
- Data display: show more data, but weighted by how much insight it gives. Faculty and recruiters
  will not dig into detail; they open the site and see well-formatted graphs, charts and values
  that show how the thing works. Headline numbers up front, detail one click away.
- Cost Reduction metric: show both the overall average (24.1%, includes the control methods) and
  the per-method figures, with the controls marked as baselines.

## Design feedback history (why the design skill says what it says)
- An early page "copied the inspiration": do your own take, do not clone references.
- Next attempt was "too similar to Vercel, too monotone": avoid zinc-on-black minimalism.
- Chosen direction: dark, quirky + technical. Futuristic fonts. A backdrop that is not flat.
- He loves the live-building graph and the 3D ridgeline chart with glow. Graphs are the main thing.
- Hover text effects must be fluid and fast, never jittery. Nothing pops in abruptly.
- Laggy pages are unacceptable: pause offscreen canvases, avoid per-frame blur/shadow work.
- Glass (refracting, not just frosted) on the header, cards and raised components.
- Cramped sections and boring code blocks were called out; give things room and character.
- Inner scrollers must be easy to scroll (Lenis is on; inner scrollers use data-lenis-prevent).
- He does not want to be asked to verify every small change; build, check it yourself, show him.

## Constraints he has repeated many times
- Nothing that flags the project as AI-built: code, comments, docs, commits (RULES.md section 1).
- No Claude as a contributor on GitHub. Clean commit history.
