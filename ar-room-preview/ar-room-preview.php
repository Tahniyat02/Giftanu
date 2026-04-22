<?php
/**
 * Plugin Name: AR Room Preview for WooCommerce
 * Plugin URI:  https://github.com/tahniyat02/giftanu
 * Description: Lets customers upload their room photo and preview products inside it with live colour swatches.
 * Version:     1.0.2
 * Author:      Giftanu
 * Text Domain: ar-room-preview
 */

defined( 'ABSPATH' ) || exit;

define( 'ARRP_VER', '1.0.2' );
define( 'ARRP_URL', plugin_dir_url( __FILE__ ) );

/* Load only after WordPress + WooCommerce are fully ready */
add_action( 'wp', 'arrp_setup' );

function arrp_setup() {
	if ( ! function_exists( 'is_product' ) || ! is_product() ) {
		return;
	}
	add_action( 'wp_enqueue_scripts',                'arrp_enqueue' );
	add_action( 'woocommerce_after_add_to_cart_button', 'arrp_button' );
	add_action( 'wp_footer',                         'arrp_modal' );
}

function arrp_enqueue() {
	wp_enqueue_style(  'arrp-css', ARRP_URL . 'assets/css/ar-preview.css', array(), ARRP_VER );
	wp_enqueue_script( 'arrp-js',  ARRP_URL . 'assets/js/ar-preview.js',   array( 'jquery' ), ARRP_VER, true );

	/* Pass only the main product image — everything else JS reads from the page */
	$product_id  = get_the_ID();
	$product     = $product_id ? wc_get_product( $product_id ) : null;
	$image_url   = '';

	if ( $product ) {
		$img_id    = $product->get_image_id();
		$image_url = $img_id ? (string) wp_get_attachment_image_url( $img_id, 'full' ) : '';
	}

	wp_localize_script( 'arrp-js', 'ARRP', array(
		'productImageUrl' => $image_url,
	) );
}

function arrp_button() {
	echo '<button type="button" id="arrp-open-btn" class="arrp-open-btn button alt">&#127968; '
		. esc_html__( 'Try in My Room', 'ar-room-preview' )
		. '</button>';
}

function arrp_modal() {
	?>
	<div id="arrp-modal" class="arrp-modal" role="dialog" aria-modal="true" style="display:none;">
		<div class="arrp-modal-overlay" id="arrp-overlay"></div>
		<div class="arrp-modal-box">
			<button class="arrp-close-btn" id="arrp-close-btn">&#10005;</button>
			<h2 class="arrp-modal-title">Preview Product in Your Room</h2>

			<div id="arrp-step-upload" class="arrp-step">
				<div class="arrp-upload-area" id="arrp-upload-area">
					<input type="file" id="arrp-file-input" accept="image/*" style="display:none;">
					<div class="arrp-upload-icon">&#128247;</div>
					<p>Click or drag &amp; drop your room photo here</p>
					<span class="arrp-upload-hint">JPG, PNG or WEBP &mdash; max 10 MB</span>
				</div>
			</div>

			<div id="arrp-step-preview" class="arrp-step" style="display:none;">
				<div class="arrp-canvas-wrap">
					<canvas id="arrp-canvas" style="display:none;"></canvas>
					<div id="arrp-product-handle" class="arrp-product-handle">
						<img id="arrp-product-img" src="" alt="" draggable="false">
						<div class="arrp-resize-handle arrp-resize-se" data-dir="se"></div>
						<div class="arrp-resize-handle arrp-resize-sw" data-dir="sw"></div>
						<div class="arrp-resize-handle arrp-resize-ne" data-dir="ne"></div>
						<div class="arrp-resize-handle arrp-resize-nw" data-dir="nw"></div>
					</div>
				</div>

				<div id="arrp-swatches-wrap" class="arrp-swatches-wrap" style="display:none;">
					<p class="arrp-swatches-label">Choose Colour:</p>
					<div id="arrp-swatches" class="arrp-swatches"></div>
				</div>

				<div class="arrp-controls">
					<button type="button" id="arrp-reset-btn"    class="arrp-btn arrp-btn-secondary">Change Room Photo</button>
					<button type="button" id="arrp-download-btn" class="arrp-btn arrp-btn-primary">Save Preview</button>
				</div>
			</div>
		</div>
	</div>
	<?php
}
