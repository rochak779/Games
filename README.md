# Games

Small 90s-style desi games that run in the browser. Keyboard or touch, no
backend, and nothing to install to play.

Each game lives in its own folder with an `index.html` and a `main.ts`. Any
folder with an `index.html` is picked up by the build automatically. Shared
styling and effects (particles, screen shake, synth sounds, best scores) are in
`shared/`. The menu at `/` links to every game.

- **Lattoo** (`/lattoo/`) — a spinning top. Hold to wind the string,
  release while the needle is in the green, then steer (arrows or drag) to keep
  it inside the chalk circle until it wobbles over.
- **Pittu** (`/pittu/`) — seven stones. Knock the stack down (drag back
  and release, or arrows + hold Space), then restack the stones biggest-first
  while the fielders try to hit you. A red target turns solid when a throw is
  locked in — that's your cue to dodge. Each round adds speed, and more
  fielders every other round.

- **Gilli Danda** (`/gilli-danda/`) — tap to flick the gilli up (smaller
  ring = higher pop), tap again to hit it (the middle of the gilli goes
  farthest). Distance is scored in dandas. A catch is out; so are 3 misses.
  Lobs give fielders time to run under them, low drives risk the fielder in the
  way. More fielders join every 3 hits.

- **Guess the Dialogue** (`/guess-the-dialogue/`) — a daily puzzle. One
  Bollywood dialogue (paraphrased, in Hinglish) is revealed word by word; name
  the movie in six tries from an autocomplete list. Each miss or skip uncovers
  more words, the year shows after two misses and the actor after four. Everyone
  gets the same dialogue on the same day, and Share copies an emoji result grid.
  The 60 dialogues live in `guess-the-dialogue/data.ts` and loop after 60
  days; words marked `*` are giveaways held back until last.

- **Galli Snake** (`/galli-snake/`) — snake in a Mumbai lane. Steer the
  dabbawala (arrows, WASD or swipe) to grab vada pav; each one adds a tiffin to
  the chain, and every fifth one speeds things up. Walls and your own tiffins
  end the run. After six vada pav a stray cow starts wandering in: she blocks
  two cells, blinks before she leaves, and never lands close to you. `P`
  pauses.

## Develop

```
npm install
npm run dev
```

## Build

```
npm run build
```

Tests (Galli Snake's game logic):

```
npm test
```

Static output in `dist/`. Deploys to Vercel with zero config.
