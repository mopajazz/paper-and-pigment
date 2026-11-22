# Paper & Pigment: handoff

A color-by-number painting web app, built so a skilled non-digital artist can paint like April (oil painting by number) without a subscription. Started as a prototype and handed off for continued development.

**Last verified:** Nov 22, 2026, running locally at http://127.0.0.1:8765/ (static server, no build step).

## 1. Goal and decisions that matter

- Target user: a skilled traditional artist who loves color painting but dislikes complex digital workflows. Not Pigment-style power tools.
- Reverse-engineer the essential structure of **April** (paint by number with a pressure-sensitive brush that stays inside shape edges) and **Happy Color** (fast first fill, easy to keep going). No account, no subscription.
- One canvas that grows with the artist: tap a numbered shape for a base coat, shade with a brush clipped to the shape, then hide guides and paint freehand. Base colors and brush marks stay independently editable, so changing the palette keeps the shading.
- **UI direction: Procreate is the model.** "It should feel like opening Procreate, but with a large selection of artwork to begin with." Clear professional icons, not pill buttons. Hide-interface full-screen mode. Not a website with a header and frames.
- The app must open ready to paint, not into a settings screen.

## 2. Current state (observed in the live app)

- Opens to a **Gallery**: 10 paintings, tabs for All artwork / Illustrations / Stained glass / In progress, a **Blank canvas** button, and a **Select** button (delete or duplicate, Procreate-style).
- Paintings seen: Woodland Watch, Lantern Bay, Woodland Tea, Pears on Linen, Tree of Ferns, The High Pass, Forest Medallion, Water Lily Pool, The Moth Garden, Blue Hour. The detailed illustrations have 240 traced regions each. The stained-glass pieces have 17 to 31.
- Tapping a painting opens a full-window canvas. Modes: Tap fill, Brush (clipped to the shape), Freehand. Palettes include Garden inks, Cut Paper, Twilight Garden, and Orchard Brights. Brush types: matte gouache, colored pencil, fine ink. Imports the embedded tip from a user-supplied Procreate `.brush` file. Apple Pencil-only toggle. Progress saves in the browser. Pages export as PNG. Brush-size circle follows the pointer. Undo/redo, Reset.
- Files: `index.html`, `studio.css`, `studio.js`, `painting.js`, `brush-import.js`, `composition.js`, `line-art.js`, `glass.js`, `artwork.js`, plus `tests/`. Source illustrations (PNG) live outside this repo.
- Previously built and later removed: procedurally generated compositions. The artwork was judged not good enough, so the generator was removed. Existing saved generated boards still open.

## 3. Hard rules

- **No named-artist style references** in the codebase, tests, or docs. Two were removed earlier; a grep confirms none remain.
- No generator button unless the artwork is genuinely good.
- First tap must paint (a past bug: the Tools menu swallowed the first tap).
- Color swatches reachable in a single tap from the canvas.
- "Find a spot" feature was removed on purpose. Do not bring it back.

## 4. Known problems and open work

1. **Numbering reliability on AI-generated line art.** Built: `tools/number-regions.js` (see README). It finds every enclosed shape in the source line art, numbers it, and places the label at the shape's widest point. It also writes the regions into `line-art.js`. The four illustrations went from 240 hand-traced regions each (about a quarter of the drawing tappable, with fills crossing lines) to 992–1,522 shapes covering over 99% of each page. Do not rely on an image generator for digits; generate clean line art and run the script.
2. **Every region needs a color assignment.** Every shape now has a number. Without a color reference, numbers are chosen so neighbors differ and every number has a similar amount of work. That gives a folk-art look, not a naturalistic one (a green fox is possible). For intended colors, pass a colored version of the same line art with `--reference`. The script writes a finished answer key per artwork to `reference/`, with a report that flags suspiciously large shapes (likely gaps in the lines).
3. **Interface polish.** The first live check showed an older cached header-and-frames layout; the current build is gallery-first. A critique and polish pass against the Procreate target is still worthwhile: icon clarity, canvas-first chrome, landscape and portrait, iPad.
4. **Untested on real hardware:** Apple Pencil feel, iPad connection over Wi-Fi, brush-import fidelity vs. Procreate.
5. **Art direction wanted next:** more mandalas, Ghibli-style cute illustrations, fractal structures. Prompt used for the botanical line art is in section 6.
6. Suggested, not started: a "mark swatch when all its shapes are started" indicator, Quick vs. Detailed pages.

## 5. Running it

See README.md: `python3 -m http.server 8765 --bind 127.0.0.1` (use `--bind 0.0.0.0` for iPad testing on a trusted LAN). Tests: `node --test tests/*.test.js`.

## 6. Artwork prompt (line art generation)

Black fine-liner on white, luxury coloring-book density, every region a closed shape, no grey, no fills, hidden creatures and details, patterned petals and leaves, no text. For color-by-number, generate the lines first and number them with code afterward.

## 7. Suggested next moves

1. Read the source and run the server.
2. Build the region-numbering script (flood-fill the enclosed regions, assign numbers, render the legend and a filled answer key) and run it on the 240-region illustrations to find mismatches.
3. Run a design critique against the Procreate-style, canvas-first target.
4. Test on an iPad with Apple Pencil.
