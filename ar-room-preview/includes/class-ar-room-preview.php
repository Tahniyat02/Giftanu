<?php
if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class ARRP_Plugin {

	private static $instance = null;

	public static function get_instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}
		return self::$instance;
	}

	private function __construct() {
		add_action( 'wp_enqueue_scripts',                array( $this, 'enqueue_assets' ) );
		add_action( 'woocommerce_after_add_to_cart_button', array( $this, 'render_button' ) );
		add_action( 'wp_footer',                         array( $this, 'render_modal' ) );
		add_action( 'wp_ajax_arrp_variation_image',      array( $this, 'ajax_variation_image' ) );
		add_action( 'wp_ajax_nopriv_arrp_variation_image', array( $this, 'ajax_variation_image' ) );
	}

	/* ------------------------------------------------------------------
	   Assets
	------------------------------------------------------------------ */
	public function enqueue_assets() {
		if ( ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}

		$product_id = get_queried_object_id();
		$product    = $product_id ? wc_get_product( $product_id ) : false;

		if ( ! $product ) {
			return;
		}

		wp_enqueue_style(
			'arrp-style',
			ARRP_PLUGIN_URL . 'assets/css/ar-preview.css',
			array(),
			ARRP_VERSION
		);
		wp_enqueue_script(
			'arrp-script',
			ARRP_PLUGIN_URL . 'assets/js/ar-preview.js',
			array( 'jquery' ),
			ARRP_VERSION,
			true
		);
		wp_localize_script( 'arrp-script', 'ARRP', array(
			'ajaxUrl'         => admin_url( 'admin-ajax.php' ),
			'nonce'           => wp_create_nonce( 'arrp_nonce' ),
			'productId'       => $product_id,
			'productImageUrl' => $this->product_image_url( $product ),
			'colorSwatches'   => $this->color_swatches( $product ),
		) );
	}

	/* ------------------------------------------------------------------
	   Helpers
	------------------------------------------------------------------ */
	private function product_image_url( $product ) {
		if ( ! $product ) {
			return '';
		}
		$id = $product->get_image_id();
		if ( $id ) {
			$url = wp_get_attachment_image_url( $id, 'full' );
			return $url ? $url : '';
		}
		return function_exists( 'wc_placeholder_img_src' ) ? wc_placeholder_img_src() : '';
	}

	private function color_swatches( $product ) {
		if ( ! $product || ! $product->is_type( 'variable' ) ) {
			return array();
		}

		$attr_key   = $this->find_color_attribute( $product );
		if ( ! $attr_key ) {
			return array();
		}

		$swatches    = array();
		$seen        = array();
		$variations  = $product->get_available_variations();

		if ( ! is_array( $variations ) ) {
			return array();
		}

		foreach ( $variations as $variation ) {
			if ( empty( $variation['attributes'] ) ) {
				continue;
			}
			$val_key = 'attribute_' . $attr_key;
			if ( ! isset( $variation['attributes'][ $val_key ] ) ) {
				continue;
			}
			$value = $variation['attributes'][ $val_key ];
			if ( '' === $value || in_array( $value, $seen, true ) ) {
				continue;
			}
			$seen[] = $value;

			$label = $value;
			$hex   = '';
			$term  = get_term_by( 'slug', $value, $attr_key );
			if ( $term && ! is_wp_error( $term ) ) {
				$label = $term->name;
				$hex   = (string) get_term_meta( $term->term_id, 'color', true );
				if ( ! $hex ) {
					$hex = (string) get_term_meta( $term->term_id, 'product_color', true );
				}
			}
			if ( ! $hex ) {
				$hex = $this->label_to_hex( $label );
			}

			// Variation image
			$img_url = '';
			if ( ! empty( $variation['image_id'] ) ) {
				$img_url = (string) wp_get_attachment_image_url( $variation['image_id'], 'full' );
			}
			if ( ! $img_url && ! empty( $variation['image']['full_src'] ) ) {
				$img_url = $variation['image']['full_src'];
			}
			if ( ! $img_url ) {
				$img_url = $this->product_image_url( $product );
			}

			$swatches[] = array(
				'label'       => $label,
				'value'       => $value,
				'variationId' => (int) $variation['variation_id'],
				'imageUrl'    => $img_url,
				'hex'         => $hex,
			);
		}

		return $swatches;
	}

	private function find_color_attribute( $product ) {
		$attributes = $product->get_variation_attributes();
		if ( ! is_array( $attributes ) || empty( $attributes ) ) {
			return null;
		}
		$keywords = array( 'color', 'colour', 'rang' );
		foreach ( $attributes as $key => $values ) {
			$lower = strtolower( $key );
			foreach ( $keywords as $kw ) {
				if ( false !== strpos( $lower, $kw ) ) {
					return $key;
				}
			}
		}
		// Fallback: return first attribute key
		reset( $attributes );
		return key( $attributes );
	}

	private function label_to_hex( $label ) {
		$map = array(
			'red'     => '#e53935', 'blue'    => '#1e88e5', 'green'   => '#43a047',
			'yellow'  => '#fdd835', 'orange'  => '#fb8c00', 'purple'  => '#8e24aa',
			'pink'    => '#e91e63', 'brown'   => '#6d4c41', 'black'   => '#212121',
			'white'   => '#f5f5f5', 'grey'    => '#9e9e9e', 'gray'    => '#9e9e9e',
			'beige'   => '#d7ccc8', 'navy'    => '#1a237e', 'teal'    => '#00897b',
			'gold'    => '#ffc107', 'silver'  => '#bdbdbd', 'cream'   => '#fff8e1',
			'maroon'  => '#880e4f', 'olive'   => '#827717', 'coral'   => '#ff7043',
			'cyan'    => '#00bcd4', 'indigo'  => '#3949ab', 'lime'    => '#c6e000',
			'khaki'   => '#c8b560', 'magenta' => '#d500f9',
		);
		$lower = strtolower( trim( $label ) );
		foreach ( $map as $kw => $hex ) {
			if ( false !== strpos( $lower, $kw ) ) {
				return $hex;
			}
		}
		return '#' . substr( md5( $label ), 0, 6 );
	}

	/* ------------------------------------------------------------------
	   AJAX
	------------------------------------------------------------------ */
	public function ajax_variation_image() {
		if ( ! check_ajax_referer( 'arrp_nonce', 'nonce', false ) ) {
			wp_send_json_error( 'invalid_nonce' );
		}
		$variation_id = isset( $_POST['variation_id'] ) ? intval( $_POST['variation_id'] ) : 0;
		if ( ! $variation_id ) {
			wp_send_json_error( 'no_id' );
		}
		$variation = wc_get_product( $variation_id );
		if ( ! $variation ) {
			wp_send_json_error( 'not_found' );
		}
		$image_id = $variation->get_image_id();
		if ( ! $image_id ) {
			$parent_id = $variation->get_parent_id();
			if ( $parent_id ) {
				$parent   = wc_get_product( $parent_id );
				$image_id = $parent ? $parent->get_image_id() : 0;
			}
		}
		$url = $image_id ? (string) wp_get_attachment_image_url( $image_id, 'full' ) : '';
		wp_send_json_success( array( 'imageUrl' => $url ) );
	}

	/* ------------------------------------------------------------------
	   Output
	------------------------------------------------------------------ */
	public function render_button() {
		if ( ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}
		echo '<button type="button" id="arrp-open-btn" class="arrp-open-btn button alt">'
			. esc_html__( 'Try in My Room', 'ar-room-preview' )
			. '</button>';
	}

	public function render_modal() {
		if ( ! function_exists( 'is_product' ) || ! is_product() ) {
			return;
		}
		?>
		<div id="arrp-modal" class="arrp-modal" role="dialog" aria-modal="true" style="display:none;">
			<div class="arrp-modal-overlay" id="arrp-overlay"></div>
			<div class="arrp-modal-box">

				<button class="arrp-close-btn" id="arrp-close-btn" aria-label="Close">&#10005;</button>
				<h2 class="arrp-modal-title"><?php esc_html_e( 'Preview Product in Your Room', 'ar-room-preview' ); ?></h2>

				<!-- Upload step -->
				<div id="arrp-step-upload" class="arrp-step">
					<div class="arrp-upload-area" id="arrp-upload-area">
						<input type="file" id="arrp-file-input" accept="image/*" style="display:none;">
						<div class="arrp-upload-icon">&#128247;</div>
						<p><?php esc_html_e( 'Click or drag & drop your room photo here', 'ar-room-preview' ); ?></p>
						<span class="arrp-upload-hint"><?php esc_html_e( 'JPG, PNG or WEBP — max 10 MB', 'ar-room-preview' ); ?></span>
					</div>
				</div>

				<!-- Preview step -->
				<div id="arrp-step-preview" class="arrp-step" style="display:none;">
					<div class="arrp-canvas-wrap">
						<canvas id="arrp-canvas"></canvas>
						<div id="arrp-product-handle" class="arrp-product-handle">
							<img id="arrp-product-img" src="" alt="" draggable="false">
							<div class="arrp-resize-handle arrp-resize-se" data-dir="se"></div>
							<div class="arrp-resize-handle arrp-resize-sw" data-dir="sw"></div>
							<div class="arrp-resize-handle arrp-resize-ne" data-dir="ne"></div>
							<div class="arrp-resize-handle arrp-resize-nw" data-dir="nw"></div>
						</div>
					</div>

					<div id="arrp-swatches-wrap" class="arrp-swatches-wrap" style="display:none;">
						<p class="arrp-swatches-label"><?php esc_html_e( 'Choose Colour:', 'ar-room-preview' ); ?></p>
						<div id="arrp-swatches" class="arrp-swatches"></div>
					</div>

					<div class="arrp-controls">
						<button type="button" id="arrp-reset-btn" class="arrp-btn arrp-btn-secondary"><?php esc_html_e( 'Change Room Photo', 'ar-room-preview' ); ?></button>
						<button type="button" id="arrp-download-btn" class="arrp-btn arrp-btn-primary"><?php esc_html_e( 'Save Preview', 'ar-room-preview' ); ?></button>
					</div>
				</div>

			</div>
		</div>
		<?php
	}
}
