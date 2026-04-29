# Daphne's Fish Heist

A cozy browser-based 2D side-view arcade stealth game starring Daphne, a fluffy gray-and-white cat with a dangerous interest in betta fish.

Steal fish from the tank, dodge countertop evidence, and hide in the cardboard box before the wall camera catches Daphne.

## Controls

- Move left: `Left Arrow`
- Move right: `Right Arrow`
- Jump: `W`, `Up Arrow`, or `Spacebar`
- Grab fish: `E` near the fish tank
- Restart after game over: `R`

On mobile, use the large on-screen buttons for Left, Right, Jump, and Grab.

## Run Locally

Open `index.html` directly in a browser. No build step, backend, database, or external dependencies are required.

You can also serve the folder with any static file server if preferred.

## Deploy To Vercel

This is a static frontend project and can be deployed directly from GitHub.

1. Create a GitHub repository, for example `daphnes-fish-heist`.
2. Push these files to the repository:
   - `index.html`
   - `styles.css`
   - `script.js`
   - `README.md`
3. Open Vercel and import the GitHub repository.
4. Use the default static site settings. No framework preset or build command is needed.
5. Deploy.

After that, Vercel will automatically redeploy the site whenever you push changes to GitHub.

## Project Structure

```text
/
  index.html
  styles.css
  script.js
  README.md
```

## Notes

- The game uses `requestAnimationFrame`.
- Best score is saved in `localStorage`.
- Audio is generated with the Web Audio API, so there are no audio files to manage.
- All visuals are drawn with CSS and Canvas, so there are no broken asset paths.
