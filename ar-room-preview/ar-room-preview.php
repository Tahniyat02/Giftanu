<?php
/**
 * Plugin Name: AR Room Preview for WooCommerce
 * Plugin URI:  https://github.com/tahniyat02/giftanu
 * Description: Lets customers upload their room photo and preview products inside it with live colour swatches.
 * Version:     1.1.0
 * Author:      Giftanu
 * Text Domain: ar-room-preview
 */

defined( 'ABSPATH' ) || exit;

define( 'ARRP_VER', '1.1.0' );
define( 'ARRP_URL', plugin_dir_url( __FILE__ ) );

add_action( 'wp', 'arrp_setup' );

function arrp_setup() {
	if ( ! function_exists( 'is_product' ) || ! is_product() ) {
		return;
	}
	add_action( 'wp_enqueue_scripts',                   'arrp_enqueue' );
	add_action( 'woocommerce_after_add_to_cart_button', 'arrp_button' );
	add_action( 'wp_footer',                            'arrp_modal' );
}

function arrp_enqueue() {
	wp_enqueue_style(  'arrp-css', ARRP_URL . 'assets/css/ar-preview.css', array(), ARRP_VER );
	wp_enqueue_script( 'arrp-js',  ARRP_URL . 'assets/js/ar-preview.js',   array( 'jquery' ), ARRP_VER, true );

	$product_id = get_the_ID();
	$product    = $product_id ? wc_get_product( $product_id ) : null;
	$image_url  = '';

	if ( $product ) {
		$img_id    = $product->get_image_id();
		$image_url = $img_id ? (string) wp_get_attachment_image_url( $img_id, 'full' ) : '';
	}

	wp_localize_script( 'arrp-js', 'ARRP', array(
		'productImageUrl' => $image_url,
	) );
}

function arrp_button() {
	echo '<button type="button" id="arrp-open-btn" class="arrp-open-btn">&#127968; Try in My Room</button>';
}

function arrp_modal() {
	?>
	<div id="arrp-modal" class="arrp-modal" role="dialog" aria-modal="true" style="display:none;">
		<div class="arrp-modal-overlay" id="arrp-overlay"></div>
		<div class="arrp-modal-box">
			<button class="arrp-close-btn" id="arrp-close-btn" aria-label="Close">&#10005;</button>
			<h2 class="arrp-modal-title">&#127968; Preview in Your Room</h2>

			<!-- ── Step 1: Choose photo source ── -->
			<div id="arrp-step-upload" class="arrp-step">
				<div class="arrp-source-row">

					<!-- Upload from gallery -->
					<label class="arrp-source-card" for="arrp-file-input">
						<input type="file" id="arrp-file-input" accept="image/*"
							style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
						<span class="arrp-source-icon">&#128444;</span>
						<span class="arrp-source-label">Upload Photo</span>
						<span class="arrp-source-hint">From your gallery</span>
					</label>

					<!-- Take photo with camera -->
					<label class="arrp-source-card" for="arrp-camera-input">
						<input type="file" id="arrp-camera-input" accept="image/*" capture="environment"
							style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
						<span class="arrp-source-icon">&#128247;</span>
						<span class="arrp-source-label">Take Photo</span>
						<span class="arrp-source-hint">Use your camera</span>
					</label>

				</div>
				<p class="arrp-upload-hint-main">Upload or capture a photo of your room — then see the product inside it!</p>
			</div>

			<!-- ── Step 2: Preview ── -->
			<div id="arrp-step-preview" class="arrp-step" style="display:none;">

				<div class="arrp-canvas-wrap">
					<canvas id="arrp-canvas" style="display:none;"></canvas>
					<!-- oval shadow sits under the product to simulate surface placement -->
					<div id="arrp-product-shadow" class="arrp-product-shadow"></div>
					<div id="arrp-product-handle" class="arrp-product-handle">
						<img id="arrp-product-img" src="" alt="" draggable="false">
						<div class="arrp-resize-handle arrp-resize-se" data-dir="se"></div>
						<div class="arrp-resize-handle arrp-resize-sw" data-dir="sw"></div>
						<div class="arrp-resize-handle arrp-resize-ne" data-dir="ne"></div>
						<div class="arrp-resize-handle arrp-resize-nw" data-dir="nw"></div>
					</div>
					<div class="arrp-drag-hint">Drag to move &nbsp;&middot;&nbsp; Corners to resize</div>
				</div>

				<!-- Colour swatches -->
				<div id="arrp-swatches-wrap" class="arrp-swatches-wrap" style="display:none;">
					<p class="arrp-swatches-label">Choose Colour:</p>
					<div id="arrp-swatches" class="arrp-swatches"></div>
				</div>

				<!-- Controls -->
				<div class="arrp-controls">
					<button type="button" id="arrp-reset-btn"    class="arrp-btn arrp-btn-secondary">&#8592; Change Photo</button>
					<button type="button" id="arrp-download-btn" class="arrp-btn arrp-btn-primary">&#8681; Save Preview</button>
				</div>
			</div>

		</div>
	</div>
	<?php
}
