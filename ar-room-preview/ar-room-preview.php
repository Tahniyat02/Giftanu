<?php
/**
 * Plugin Name: AR Room Preview for WooCommerce
 * Plugin URI:  https://github.com/tahniyat02/giftanu
 * Description: Lets customers upload their room photo and visualize any WooCommerce product inside it — with live colour switching.
 * Version:     1.0.0
 * Author:      Giftanu
 * Text Domain: ar-room-preview
 * Requires Plugins: woocommerce
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ARRP_VERSION', '1.0.0' );
define( 'ARRP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'ARRP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

require_once ARRP_PLUGIN_DIR . 'includes/class-ar-room-preview.php';

function arrp_init() {
	AR_Room_Preview::get_instance();
}
add_action( 'plugins_loaded', 'arrp_init' );
