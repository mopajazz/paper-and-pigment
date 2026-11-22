# Paper & Pigment

A buildless iPad-first painting web app. It uses the browser’s Canvas and Pointer Events APIs. Paintings, brush tips, and progress are stored in the current browser. The app requires no account, subscription, or third-party service.

## Open the studio

On a desktop, open `index.html` in a modern browser. For a stable storage origin, serve the folder and open `http://127.0.0.1:8765`.

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

To try it in Safari on an iPad, run `python3 -m http.server 8765 --bind 0.0.0.0` from this folder on a trusted Wi-Fi network. Open `http://<Mac-local-IP>:8765` on the iPad while the Mac server is running. Keep the iPad on that same network. Each device and browser origin has its own saved work.

## Pick a painting

The app opens in **Gallery**. Tap a preview to paint, or choose **Blank canvas** to draw freely. The collection includes four detailed woodland illustrations, four hand-composed stained-glass paintings, The Moth Garden, and Blue Hour. Previously saved procedural paintings also appear here.

Use **In progress** to see pieces with paint on them. Their thumbnails show your saved marks. The **Gallery** control on the canvas returns to the same shelf and filter. Each detailed woodland illustration has 240 traced regions. Zoom in to see the smallest numbers.

## Paint

Tap any shape for its suggested color. Choose a swatch on the canvas rail to apply that shade, or open Custom to make your own. **Blank canvas** opens a separate freehand painting with saved progress. Switch to **Brush** for textured strokes clipped to the starting shape, or **Freehand** for strokes across the page. Palette changes recolor numbered base fills and retain painted marks. Use **Pan**, the zoom controls, or a two-finger pinch to move around at high zoom. **Reset** clears paint from the active page and keeps its palette. Use **Undo** to restore paint while that page is still open. **Save image** exports the full page as a PNG without the number guides.

In Brush or Freehand, open **Use a Procreate brush tip** and choose a custom `.brush` that contains an embedded `Shape.png`. The app uses that tip with its own spacing and pressure response. The importer covers the shape only. Procreate grain, native settings, library references, and `.brushset` files are outside this prototype's import coverage. The browser reads the file locally.

## Full screen

Each painting opens in a viewport-filling studio. Brush size, opacity, and colors share the rail. **Tools** holds the painting modes, brush selection, palette, number guides, zoom and pan, reset, and PNG export. **Full screen** also hides supported browser chrome. On browsers without that capability it simplifies the studio toolbar.

## Verify

```sh
node --test tests/*.test.js
```
