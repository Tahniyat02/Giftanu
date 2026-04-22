=== AR Room Preview for WooCommerce ===
Contributors: giftanu
Tags: woocommerce, augmented reality, room preview, product visualization, colour swatches
Requires at least: 6.0
Tested up to: 6.7
Requires PHP: 7.4
Stable tag: 1.0.0
License: GPLv2 or later

== Description ==

Adds a **"Try in My Room"** button to every WooCommerce product page.

**How it works for shoppers:**

1. Click **"Try in My Room"** on any product page.
2. Upload (or drag & drop) a photo of your room.
3. The product image appears **inside your room photo** — draggable and resizable.
4. Pick any available **colour** from the swatches below the preview.
   The product image instantly updates to the matching variation image.
5. Reposition and resize the product until it looks just right.
6. Hit **"Save Preview"** to download a full-resolution PNG of your room with the product in it.

**Key features:**

* Zero external API dependency — runs entirely in the browser.
* Reads WooCommerce variable-product colour attributes automatically (supports `pa_color`, `pa_colour`, and any other attribute named "color/colour").
* Drag & resize the product overlay with mouse **and** touch (mobile-friendly).
* Full-resolution PNG export merges both layers via HTML5 Canvas.
* Works with popular colour-swatch plugins that store hex values in term meta.

== Installation ==

1. Upload the `ar-room-preview` folder to `/wp-content/plugins/`.
2. Activate **AR Room Preview for WooCommerce** from *Plugins → Installed Plugins*.
3. Make sure WooCommerce is installed and active.
4. Done — the "Try in My Room" button will appear on all product pages automatically.

== For variable products with colours ==

The plugin reads any product attribute whose slug contains "color" or "colour".
If you use a different attribute name (e.g. `pa_finish`), open
`includes/class-ar-room-preview.php` and add the slug to the `$color_attributes` array.

Each colour variation **should have its own image** set via
*Product → Variations → [variation] → Image*.
That image is what gets shown in the room preview when the shopper selects that colour.

== Changelog ==

= 1.0.0 =
* Initial release.
