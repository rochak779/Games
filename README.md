# Games

**Five small 90s-style desi games that run in the browser: street games from an Indian childhood, plus a daily Bollywood puzzle.**

Not deployed yet; runs locally (see below).

<!-- TODO(Rochak): add a screenshot of the game menu or one game at docs/readme/screenshot.png, then uncomment the line below. -->
<!-- ![Games menu](docs/readme/screenshot.png) -->

## The problem

Lattoo, pittu and gilli danda were what a whole generation played in the lanes, and they're rarely seen in games today. These are quick, nostalgic versions you can play in a browser tab, on a keyboard or a phone, with nothing to install.

## What it does

- **Lattoo:** wind and release a spinning top at the right moment, then steer it to keep it inside the chalk circle.
- **Pittu (seven stones):** knock the stack down, then restack it biggest-first while dodging the fielders' throws.
- **Gilli Danda:** flick the gilli up and hit it as far as you can, without getting caught.
- **Guess the Dialogue:** a daily puzzle. A Bollywood dialogue is revealed word by word, and you have six tries to name the film. Everyone gets the same one each day, with a shareable emoji result.
- **Galli Snake:** snake in a Mumbai lane. Guide the dabbawala to grab vada pav, and watch out for the stray cow.

<details>
<summary><strong>Tech stack & running locally</strong></summary>

**Stack:** TypeScript and Vite, no framework and no backend. Each game is a folder with its own `index.html` and `main.ts`, and any folder with an `index.html` is picked up by the build automatically. Shared effects (particles, screen shake, synth sounds, best scores) live in `shared/`.

```
npm install
npm run dev      # the menu at / links to every game
npm run build    # static output in dist/, deploys to Vercel with zero config
npm test         # Galli Snake's game logic
```

Guess the Dialogue's 60 dialogues live in `guess-the-dialogue/data.ts` and loop after 60 days.

</details>
