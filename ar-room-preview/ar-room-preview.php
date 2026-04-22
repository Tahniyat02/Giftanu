<?php
/**
 * Plugin Name: AR Room Preview for WooCommerce
 * Plugin URI:  https://github.com/tahniyat02/giftanu
 * Description: Lets customers upload their room photo and preview products inside it with live colour swatches.
 * Version:     1.0.1
 * Author:      Giftanu
 * Text Domain: ar-room-preview
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( 'ARRP_VERSION',    '1.0.1' );
define( 'ARRP_PLUGIN_DIR', plugin_dir_path( __FILE__ ) );
define( 'ARRP_PLUGIN_URL', plugin_dir_url( __FILE__ ) );

add_action( 'plugins_loaded', 'arrp_boot', 20 );

function arrp_boot() {
	// Only run when WooCommerce is active
	if ( ! class_exists( 'WooCommerce' ) ) {
		return;
	}
	require_once ARRP_PLUGIN_DIR . 'includes/class-ar-room-preview.php';
	ARRP_Plugin::get_instance();
}
