<?php
/**
 * Plugin Name: AR Room Preview for WooCommerce
 * Plugin URI:  https://github.com/tahniyat02/giftanu
 * Description: Lets customers upload their room photo and preview products inside it with live colour swatches. Integrates with remove.bg for automatic background removal.
 * Version:     1.3.0
 * Author:      Giftanu
 * Text Domain: ar-room-preview
 */

defined( 'ABSPATH' ) || exit;

define( 'ARRP_VER',      '1.3.0' );
define( 'ARRP_URL',      plugin_dir_url( __FILE__ ) );
define( 'ARRP_DIR',      plugin_dir_path( __FILE__ ) );
define( 'ARRP_CACHE_DIR', WP_CONTENT_DIR . '/uploads/arrp-cache/' );
define( 'ARRP_CACHE_URL', WP_CONTENT_URL  . '/uploads/arrp-cache/' );

/* ── Boot ── */
add_action( 'plugins_loaded', 'arrp_boot', 20 );

function arrp_boot() {
	if ( ! class_exists( 'WooCommerce' ) ) return;

	/* Front-end */
	add_action( 'wp', 'arrp_setup_frontend' );

	/* Admin settings */
	add_action( 'admin_menu',    'arrp_admin_menu' );
	add_action( 'admin_init',    'arrp_admin_settings' );

	/* AJAX: background removal proxy */
	add_action( 'wp_ajax_arrp_removebg',        'arrp_ajax_removebg' );
	add_action( 'wp_ajax_nopriv_arrp_removebg', 'arrp_ajax_removebg' );
}

/* ================================================================
   Admin Settings Page
================================================================= */
function arrp_admin_menu() {
	add_options_page(
		'AR Room Preview',
		'AR Room Preview',
		'manage_options',
		'ar-room-preview',
		'arrp_settings_page'
	);
}

function arrp_admin_settings() {
	register_setting( 'arrp_settings', 'arrp_removebg_key', array(
		'sanitize_callback' => 'sanitize_text_field',
	) );
}

function arrp_settings_page() {
	?>
	<div class="wrap">
		<h1>AR Room Preview — Settings</h1>
		<form method="post" action="options.php">
			<?php settings_fields( 'arrp_settings' ); ?>
			<table class="form-table">
				<tr>
					<th scope="row"><label for="arrp_removebg_key">remove.bg API Key</label></th>
					<td>
						<input type="text" id="arrp_removebg_key" name="arrp_removebg_key"
							value="<?php echo esc_attr( get_option( 'arrp_removebg_key', '' ) ); ?>"
							class="regular-text" placeholder="Paste your remove.bg API key here" />
						<p class="description">
							Get a <strong>free API key</strong> at
							<a href="https://www.remove.bg/api" target="_blank">remove.bg/api</a>
							(50 free images/month).<br>
							The key is stored securely on your server — never exposed to visitors.
						</p>
					</td>
				</tr>
			</table>
			<?php submit_button( 'Save Settings' ); ?>
		</form>

		<hr>
		<h2>How it works</h2>
		<ol>
			<li>Enter your remove.bg API key above and save.</li>
			<li>When a customer clicks <em>Try in My Room</em>, the plugin sends the product image to remove.bg and gets back a PNG with transparent background.</li>
			<li>The result is cached on your server so the same image is only processed once.</li>
			<li>The transparent product image is then placed inside the customer's room photo.</li>
		</ol>
		<p><strong>Without an API key:</strong> the plugin still works using a local flood-fill background remover (works well for products on plain white/grey studio backgrounds).</p>
	</div>
	<?php
}

/* ================================================================
   AJAX: background removal via remove.bg
================================================================= */
function arrp_ajax_removebg() {
	check_ajax_referer( 'arrp_nonce', 'nonce' );

	$image_url = isset( $_POST['imageUrl'] ) ? esc_url_raw( $_POST['imageUrl'] ) : '';
	if ( ! $image_url ) { wp_send_json_error( 'no_url' ); }

	$api_key = get_option( 'arrp_removebg_key', '' );
	if ( ! $api_key ) { wp_send_json_error( 'no_key' ); }

	/* Cache key based on URL */
	$cache_name = md5( $image_url ) . '.png';
	$cache_path = ARRP_CACHE_DIR . $cache_name;
	$cache_href = ARRP_CACHE_URL . $cache_name;

	/* Return cached result if available */
	if ( file_exists( $cache_path ) ) {
		wp_send_json_success( array( 'url' => $cache_href ) );
	}

	/* Ensure cache directory exists */
	if ( ! file_exists( ARRP_CACHE_DIR ) ) {
		wp_mkdir_p( ARRP_CACHE_DIR );
		file_put_contents( ARRP_CACHE_DIR . 'index.php', '<?php // silence' );
	}

	/* Call remove.bg API */
	$response = wp_remote_post( 'https://api.remove.bg/v1.0/removebg', array(
		'timeout' => 30,
		'headers' => array(
			'X-Api-Key' => $api_key,
		),
		'body' => array(
			'image_url' => $image_url,
			'size'      => 'auto',
		),
	) );

	if ( is_wp_error( $response ) ) {
		wp_send_json_error( 'api_error: ' . $response->get_error_message() );
	}

	$code = wp_remote_retrieve_response_code( $response );
	if ( $code !== 200 ) {
		$body = wp_remote_retrieve_body( $response );
		wp_send_json_error( 'api_http_' . $code . ': ' . $body );
	}

	$png_data = wp_remote_retrieve_body( $response );
	if ( ! $png_data ) { wp_send_json_error( 'empty_response' ); }

	/* Save to cache */
	file_put_contents( $cache_path, $png_data );

	wp_send_json_success( array( 'url' => $cache_href ) );
}

/* ================================================================
   Front-end setup
================================================================= */
function arrp_setup_frontend() {
	if ( ! function_exists( 'is_product' ) || ! is_product() ) return;

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

	$api_key = get_option( 'arrp_removebg_key', '' );

	wp_localize_script( 'arrp-js', 'ARRP', array(
		'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
		'nonce'           => wp_create_nonce( 'arrp_nonce' ),
		'productImageUrl' => $image_url,
		'hasRemoveBgKey'  => ! empty( $api_key ) ? '1' : '',
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

			<!-- Step 1: pick room photo -->
			<div id="arrp-step-upload" class="arrp-step">
				<div class="arrp-source-row">
					<label class="arrp-source-card" for="arrp-file-input">
						<input type="file" id="arrp-file-input" accept="image/*"
							style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
						<span class="arrp-source-icon">&#128444;</span>
						<span class="arrp-source-label">Upload Photo</span>
						<span class="arrp-source-hint">From your gallery</span>
					</label>
					<label class="arrp-source-card" for="arrp-camera-input">
						<input type="file" id="arrp-camera-input" accept="image/*" capture="environment"
							style="position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;">
						<span class="arrp-source-icon">&#128247;</span>
						<span class="arrp-source-label">Take Photo</span>
						<span class="arrp-source-hint">Use your camera</span>
					</label>
				</div>
				<p class="arrp-upload-hint-main">Upload a photo of your room to see the product inside it.</p>
			</div>

			<!-- Step 2: preview -->
			<div id="arrp-step-preview" class="arrp-step" style="display:none;">
				<div class="arrp-canvas-wrap">
					<canvas id="arrp-canvas" style="display:none;"></canvas>
					<div id="arrp-product-shadow" class="arrp-product-shadow"></div>
					<div id="arrp-product-handle" class="arrp-product-handle">
						<img id="arrp-product-img" src="" alt="" draggable="false">
						<div class="arrp-resize-handle arrp-resize-se" data-dir="se"></div>
						<div class="arrp-resize-handle arrp-resize-sw" data-dir="sw"></div>
						<div class="arrp-resize-handle arrp-resize-ne" data-dir="ne"></div>
						<div class="arrp-resize-handle arrp-resize-nw" data-dir="nw"></div>
					</div>
					<div class="arrp-drag-hint" id="arrp-drag-hint">Drag to move &nbsp;&middot;&nbsp; Corners to resize</div>
				</div>

				<div id="arrp-swatches-wrap" class="arrp-swatches-wrap" style="display:none;">
					<p class="arrp-swatches-label">Choose Colour:</p>
					<div id="arrp-swatches" class="arrp-swatches"></div>
				</div>

				<div class="arrp-controls">
					<button type="button" id="arrp-reset-btn"    class="arrp-btn arrp-btn-secondary">&#8592; Change Photo</button>
					<button type="button" id="arrp-download-btn" class="arrp-btn arrp-btn-primary">&#8681; Save Preview</button>
				</div>
			</div>
		</div>
	</div>
	<?php
}
