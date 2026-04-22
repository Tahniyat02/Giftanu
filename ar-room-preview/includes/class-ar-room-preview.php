<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class AR_Room_Preview {

	private static $instance = null;

	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_action( 'woocommerce_after_add_to_cart_button', array( $this, 'render_preview_button' ) );
		add_action( 'wp_footer', array( $this, 'render_modal' ) );
		add_action( 'wp_ajax_arrp_get_variation_image', array( $this, 'ajax_get_variation_image' ) );
		add_action( 'wp_ajax_nopriv_arrp_get_variation_image', array( $this, 'ajax_get_variation_image' ) );
	}

	public function enqueue_assets() {
		if ( ! is_product() ) {
			return;
		}
		wp_enqueue_style(
			'ar-room-preview',
			ARRP_PLUGIN_URL . 'assets/css/ar-preview.css',
			array(),
			ARRP_VERSION
		);
		wp_enqueue_script(
			'ar-room-preview',
			ARRP_PLUGIN_URL . 'assets/js/ar-preview.js',
			array( 'jquery' ),
			ARRP_VERSION,
			true
		);

		$product = wc_get_product( get_the_ID() );
		$data = array(
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'productId'       => get_the_ID(),
			'productImageUrl' => $this->get_product_main_image_url( $product ),
			'colorSwatches'   => $this->get_color_swatches( $product ),
			'nonce'           => wp_create_nonce( 'arrp_nonce' ),
		);
		wp_localize_script( 'ar-room-preview', 'ARRP', $data );
	}

	/**
	 * Returns the full-size image URL for a product (or its first variation image as fallback).
	 */
	private function get_product_main_image_url( $product ) {
		if ( ! $product ) {
			return '';
		}
		$image_id = $product->get_image_id();
		if ( $image_id ) {
			return wp_get_attachment_image_url( $image_id, 'full' );
		}
		return wc_placeholder_img_src( 'full' );
	}

	/**
	 * Collects colour swatches from the product's colour attribute.
	 * Returns array of [ label, value, imageUrl, hexColor ] per swatch.
	 */
	private function get_color_swatches( $product ) {
		if ( ! $product || ! $product->is_type( 'variable' ) ) {
			return array();
		}

		$swatches         = array();
		$color_attributes = array( 'pa_color', 'pa_colour', 'color', 'colour' );
		$attributes       = $product->get_variation_attributes();

		$found_attr = null;
		foreach ( $color_attributes as $attr ) {
			if ( isset( $attributes[ $attr ] ) ) {
				$found_attr = $attr;
				break;
			}
		}

		// Fallback: use the first attribute if no colour attribute found
		if ( ! $found_attr && ! empty( $attributes ) ) {
			$found_attr = array_key_first( $attributes );
		}

		if ( ! $found_attr ) {
			return array();
		}

		$variations     = $product->get_available_variations();
		$seen_values    = array();

		foreach ( $variations as $variation ) {
			$attr_key = 'attribute_' . $found_attr;
			if ( ! isset( $variation['attributes'][ $attr_key ] ) ) {
				continue;
			}
			$value = $variation['attributes'][ $attr_key ];
			if ( empty( $value ) || in_array( $value, $seen_values, true ) ) {
				continue;
			}
			$seen_values[] = $value;

			// Try to get label from term
			$label    = $value;
			$hex      = '';
			$term     = get_term_by( 'slug', $value, $found_attr );
			if ( $term ) {
				$label = $term->name;
				// Support popular colour-swatch plugins that store hex in term meta
				$stored_hex = get_term_meta( $term->term_id, 'color', true );
				if ( ! $stored_hex ) {
					$stored_hex = get_term_meta( $term->term_id, 'product_color', true );
				}
				if ( $stored_hex ) {
					$hex = $stored_hex;
				}
			}

			// If still no hex, derive a reasonable fallback from the label/value
			if ( ! $hex ) {
				$hex = $this->label_to_hex( $label );
			}

			// Get variation image URL
			$variation_image_url = '';
			if ( ! empty( $variation['image_id'] ) ) {
				$variation_image_url = wp_get_attachment_image_url( $variation['image_id'], 'full' );
			} elseif ( ! empty( $variation['image']['full_src'] ) ) {
				$variation_image_url = $variation['image']['full_src'];
			}

			$swatches[] = array(
				'label'        => $label,
				'value'        => $value,
				'variationId'  => $variation['variation_id'],
				'imageUrl'     => $variation_image_url ?: $this->get_product_main_image_url( $product ),
				'hex'          => $hex,
			);
		}

		return $swatches;
	}

	/**
	 * Very rough CSS colour name → hex mapping so swatches still show something
	 * even when no meta is stored (common in basic setups).
	 */
	private function label_to_hex( $label ) {
		$map = array(
			'red'     => '#e53935', 'blue'    => '#1e88e5', 'green'   => '#43a047',
			'yellow'  => '#fdd835', 'orange'  => '#fb8c00', 'purple'  => '#8e24aa',
			'pink'    => '#e91e63', 'brown'   => '#6d4c41', 'black'   => '#212121',
			'white'   => '#f5f5f5', 'grey'    => '#9e9e9e',  'gray'    => '#9e9e9e',
			'beige'   => '#d7ccc8', 'navy'    => '#1a237e', 'teal'    => '#00897b',
			'gold'    => '#ffc107', 'silver'  => '#bdbdbd', 'cream'   => '#fff8e1',
			'maroon'  => '#880e4f', 'olive'   => '#827717', 'coral'   => '#ff7043',
			'cyan'    => '#00bcd4', 'indigo'  => '#3949ab', 'lime'    => '#c6e000',
			'khaki'   => '#c8b560', 'magenta' => '#d500f9', 'ivory'   => '#fffff0',
		);
		$lower = strtolower( trim( $label ) );
		foreach ( $map as $keyword => $hex ) {
			if ( strpos( $lower, $keyword ) !== false ) {
				return $hex;
			}
		}
		// Generate deterministic colour from string hash
		$hash = md5( $label );
		return '#' . substr( $hash, 0, 6 );
	}

	/** AJAX: return the image URL for a specific variation ID */
	public function ajax_get_variation_image() {
		check_ajax_referer( 'arrp_nonce', 'nonce' );
		$variation_id = intval( $_POST['variation_id'] ?? 0 );
		if ( ! $variation_id ) {
			wp_send_json_error();
		}
		$variation = wc_get_product( $variation_id );
		if ( ! $variation ) {
			wp_send_json_error();
		}
		$image_id = $variation->get_image_id();
		if ( ! $image_id ) {
			$parent = wc_get_product( $variation->get_parent_id() );
			if ( $parent ) {
				$image_id = $parent->get_image_id();
			}
		}
		$image_url = $image_id ? wp_get_attachment_image_url( $image_id, 'full' ) : '';
		wp_send_json_success( array( 'imageUrl' => $image_url ) );
	}

	public function render_preview_button() {
		if ( ! is_product() ) {
			return;
		}
		echo '<button type="button" id="arrp-open-btn" class="arrp-open-btn button alt">'
			. esc_html__( 'Try in My Room', 'ar-room-preview' )
			. '</button>';
	}

	public function render_modal() {
		if ( ! is_product() ) {
			return;
		}
		?>
		<div id="arrp-modal" class="arrp-modal" role="dialog" aria-modal="true" aria-label="<?php esc_attr_e( 'Room Preview', 'ar-room-preview' ); ?>" style="display:none;">
			<div class="arrp-modal-overlay" id="arrp-overlay"></div>
			<div class="arrp-modal-box">

				<button class="arrp-close-btn" id="arrp-close-btn" aria-label="<?php esc_attr_e( 'Close', 'ar-room-preview' ); ?>">&#10005;</button>

				<h2 class="arrp-modal-title"><?php esc_html_e( 'Preview Product in Your Room', 'ar-room-preview' ); ?></h2>

				<!-- Step 1 – upload -->
				<div id="arrp-step-upload" class="arrp-step">
					<div class="arrp-upload-area" id="arrp-upload-area">
						<input type="file" id="arrp-file-input" accept="image/*" style="display:none;" aria-label="<?php esc_attr_e( 'Upload room photo', 'ar-room-preview' ); ?>">
						<div class="arrp-upload-icon">&#128247;</div>
						<p><?php esc_html_e( 'Click or drag & drop your room photo here', 'ar-room-preview' ); ?></p>
						<span class="arrp-upload-hint"><?php esc_html_e( 'JPG, PNG or WEBP — max 10 MB', 'ar-room-preview' ); ?></span>
					</div>
				</div>

				<!-- Step 2 – canvas preview -->
				<div id="arrp-step-preview" class="arrp-step" style="display:none;">
					<div class="arrp-canvas-wrap">
						<canvas id="arrp-canvas"></canvas>
						<div id="arrp-product-handle" class="arrp-product-handle" title="<?php esc_attr_e( 'Drag to move · Corner to resize', 'ar-room-preview' ); ?>">
							<img id="arrp-product-img" src="" alt="" draggable="false">
							<div class="arrp-resize-handle arrp-resize-se" data-dir="se"></div>
							<div class="arrp-resize-handle arrp-resize-sw" data-dir="sw"></div>
							<div class="arrp-resize-handle arrp-resize-ne" data-dir="ne"></div>
							<div class="arrp-resize-handle arrp-resize-nw" data-dir="nw"></div>
						</div>
					</div>

					<!-- Colour swatches -->
					<div id="arrp-swatches-wrap" class="arrp-swatches-wrap" style="display:none;">
						<p class="arrp-swatches-label"><?php esc_html_e( 'Choose Colour:', 'ar-room-preview' ); ?></p>
						<div id="arrp-swatches" class="arrp-swatches"></div>
					</div>

					<!-- Controls -->
					<div class="arrp-controls">
						<button type="button" id="arrp-reset-btn" class="arrp-btn arrp-btn-secondary"><?php esc_html_e( 'Change Room Photo', 'ar-room-preview' ); ?></button>
						<button type="button" id="arrp-download-btn" class="arrp-btn arrp-btn-primary"><?php esc_html_e( 'Save Preview', 'ar-room-preview' ); ?></button>
					</div>
				</div><!-- /step-preview -->

			</div><!-- /modal-box -->
		</div><!-- /modal -->
		<?php
	}
}
