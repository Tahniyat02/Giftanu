/**
 * AR Room Preview – Front-end controller
 *
 * Flow:
 *  1. Customer clicks "Try in My Room"
 *  2. Modal opens → customer uploads room photo
 *  3. Room photo rendered as background; product image placed on top as a
 *     draggable / resizable overlay
 *  4. Colour swatches (from WooCommerce variation data) let the customer swap
 *     the product image to the matching variation image
 *  5. "Save Preview" merges both layers onto a hidden <canvas> and downloads
 *     the result as a PNG
 */
(function ($) {
	'use strict';

	/* ------------------------------------------------------------------ */
	/* State                                                                */
	/* ------------------------------------------------------------------ */
	var state = {
		roomDataUrl: null,   // uploaded room photo as Data URL
		roomNaturalW: 0,
		roomNaturalH: 0,

		productImgUrl: (ARRP.productImageUrl || ''),
		swatches: (ARRP.colorSwatches || []),

		// Product handle position/size (relative to canvas-wrap in px)
		handle: { x: 0, y: 0, w: 0, h: 0 },

		// Drag state
		drag: { active: false, startMouseX: 0, startMouseY: 0, startX: 0, startY: 0 },

		// Resize state
		resize: {
			active: false,
			dir: '',
			startMouseX: 0, startMouseY: 0,
			startX: 0, startY: 0, startW: 0, startH: 0
		}
	};

	/* ------------------------------------------------------------------ */
	/* DOM references (populated on DOMContentLoaded)                      */
	/* ------------------------------------------------------------------ */
	var dom = {};

	/* ------------------------------------------------------------------ */
	/* Init                                                                 */
	/* ------------------------------------------------------------------ */
	$(function () {
		dom.modal         = $('#arrp-modal');
		dom.overlay       = $('#arrp-overlay');
		dom.openBtn       = $('#arrp-open-btn');
		dom.closeBtn      = $('#arrp-close-btn');
		dom.stepUpload    = $('#arrp-step-upload');
		dom.stepPreview   = $('#arrp-step-preview');
		dom.uploadArea    = $('#arrp-upload-area');
		dom.fileInput     = $('#arrp-file-input');
		dom.canvasWrap    = $('.arrp-canvas-wrap');
		dom.canvas        = $('#arrp-canvas')[0];
		dom.handle        = $('#arrp-product-handle');
		dom.productImg    = $('#arrp-product-img');
		dom.swatchesWrap  = $('#arrp-swatches-wrap');
		dom.swatchesCont  = $('#arrp-swatches');
		dom.resetBtn      = $('#arrp-reset-btn');
		dom.downloadBtn   = $('#arrp-download-btn');

		bindEvents();
		buildSwatches();
	});

	/* ------------------------------------------------------------------ */
	/* Event binding                                                        */
	/* ------------------------------------------------------------------ */
	function bindEvents() {
		// Open / close
		dom.openBtn.on('click', openModal);
		dom.closeBtn.on('click', closeModal);
		dom.overlay.on('click', closeModal);
		$(document).on('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

		// Upload area
		dom.uploadArea.on('click', function () { dom.fileInput.trigger('click'); });
		dom.fileInput.on('change', function () { handleFileSelect(this.files[0]); });

		// Drag & drop
		dom.uploadArea
			.on('dragover dragenter', function (e) { e.preventDefault(); $(this).addClass('arrp-drag-over'); })
			.on('dragleave drop',    function (e) { e.preventDefault(); $(this).removeClass('arrp-drag-over');
				if (e.type === 'drop') { handleFileSelect(e.originalEvent.dataTransfer.files[0]); }
			});

		// Controls
		dom.resetBtn.on('click', resetToUpload);
		dom.downloadBtn.on('click', downloadPreview);

		// Product handle – drag (mouse)
		dom.handle.on('mousedown', function (e) {
			if ($(e.target).hasClass('arrp-resize-handle')) return;
			startDrag(e.clientX, e.clientY);
			e.preventDefault();
		});
		// Product handle – drag (touch)
		dom.handle.on('touchstart', function (e) {
			if ($(e.target).hasClass('arrp-resize-handle')) return;
			var t = e.originalEvent.touches[0];
			startDrag(t.clientX, t.clientY);
			e.preventDefault();
		}, { passive: false });

		// Resize handles (mouse)
		dom.handle.on('mousedown', '.arrp-resize-handle', function (e) {
			startResize(e.clientX, e.clientY, $(this).data('dir'));
			e.preventDefault();
			e.stopPropagation();
		});
		// Resize handles (touch)
		dom.handle.on('touchstart', '.arrp-resize-handle', function (e) {
			var t = e.originalEvent.touches[0];
			startResize(t.clientX, t.clientY, $(this).data('dir'));
			e.preventDefault();
			e.stopPropagation();
		}, { passive: false });

		// Global move/up (mouse)
		$(document)
			.on('mousemove', onMouseMove)
			.on('mouseup',   onMouseUp)
			.on('touchmove', function (e) {
				var t = e.originalEvent.touches[0];
				onMouseMove({ clientX: t.clientX, clientY: t.clientY });
				if (state.drag.active || state.resize.active) e.preventDefault();
			}, { passive: false })
			.on('touchend', onMouseUp);
	}

	/* ------------------------------------------------------------------ */
	/* Modal open / close                                                   */
	/* ------------------------------------------------------------------ */
	function openModal() {
		dom.modal.css('display', 'flex');
		$('body').css('overflow', 'hidden');
	}
	function closeModal() {
		dom.modal.hide();
		$('body').css('overflow', '');
	}

	/* ------------------------------------------------------------------ */
	/* File handling                                                        */
	/* ------------------------------------------------------------------ */
	function handleFileSelect(file) {
		if (!file || !file.type.match('image.*')) { return; }
		if (file.size > 10 * 1024 * 1024) {
			alert('Image must be under 10 MB.');
			return;
		}
		showLoading(true);
		var reader = new FileReader();
		reader.onload = function (ev) {
			var img = new Image();
			img.onload = function () {
				state.roomDataUrl  = ev.target.result;
				state.roomNaturalW = img.naturalWidth;
				state.roomNaturalH = img.naturalHeight;
				showPreviewStep();
				showLoading(false);
			};
			img.src = ev.target.result;
		};
		reader.readAsDataURL(file);
	}

	/* ------------------------------------------------------------------ */
	/* Preview step                                                         */
	/* ------------------------------------------------------------------ */
	function showPreviewStep() {
		dom.stepUpload.hide();
		dom.stepPreview.show();

		// Set room background on the canvas wrap via an <img> we inject
		dom.canvasWrap.find('.arrp-room-bg').remove();
		var roomImg = $('<img class="arrp-room-bg" alt="">').attr('src', state.roomDataUrl);
		dom.canvasWrap.prepend(roomImg);

		// Sync hidden canvas dimensions to the room image aspect ratio
		// We use the natural dimensions so the export is full-resolution
		dom.canvas.width  = state.roomNaturalW;
		dom.canvas.height = state.roomNaturalH;

		// Place product roughly centre of canvas-wrap, 30% wide
		roomImg.on('load', function () {
			placeProductInitial();
		});
		// In case already cached
		if (roomImg[0].complete) placeProductInitial();
	}

	function placeProductInitial() {
		var wrapW = dom.canvasWrap.width();
		var wrapH = dom.canvasWrap.height();
		if (!wrapH) { wrapH = dom.canvasWrap.find('.arrp-room-bg').height() || 400; }

		var prodW = Math.round(wrapW * 0.28);
		var prodH = prodW; // square default; adjusts once img loads

		state.handle.w = prodW;
		state.handle.h = prodH;
		state.handle.x = Math.round((wrapW - prodW) / 2);
		state.handle.y = Math.round((wrapH - prodH) / 2);

		applyHandlePos();
		dom.productImg.attr('src', state.productImgUrl);
		dom.productImg.on('load', function () {
			var nw = this.naturalWidth, nh = this.naturalHeight;
			if (nw && nh) {
				var ratio = nh / nw;
				state.handle.h = Math.round(state.handle.w * ratio);
				applyHandlePos();
			}
		});
	}

	function resetToUpload() {
		dom.stepPreview.hide();
		dom.stepUpload.show();
		dom.fileInput.val('');
		state.roomDataUrl = null;
	}

	/* ------------------------------------------------------------------ */
	/* Colour swatches                                                      */
	/* ------------------------------------------------------------------ */
	function buildSwatches() {
		if (!state.swatches || !state.swatches.length) { return; }

		dom.swatchesWrap.show();
		dom.swatchesCont.empty();

		$.each(state.swatches, function (i, swatch) {
			var $el = $('<div class="arrp-swatch" tabindex="0" role="button">')
				.attr('aria-label', swatch.label)
				.data('swatch', swatch);

			var $circle = $('<div class="arrp-swatch-circle">').css('background', swatch.hex || '#ccc');
			var $name   = $('<span class="arrp-swatch-name">').text(swatch.label);

			$el.append($circle, $name);
			$el.on('click keydown', function (e) {
				if (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ') { return; }
				selectSwatch($el, swatch);
			});
			dom.swatchesCont.append($el);

			// Activate the first swatch by default
			if (i === 0) { selectSwatch($el, swatch); }
		});
	}

	function selectSwatch($el, swatch) {
		dom.swatchesCont.find('.arrp-swatch').removeClass('arrp-swatch-active');
		$el.addClass('arrp-swatch-active');

		if (swatch.imageUrl) {
			changeProductImage(swatch.imageUrl);
		}
	}

	function changeProductImage(url) {
		showLoading(true);
		var img = new Image();
		img.onload = function () {
			state.productImgUrl = url;
			dom.productImg.attr('src', url);
			// Re-adjust height to keep aspect ratio
			var nw = img.naturalWidth, nh = img.naturalHeight;
			if (nw && nh) {
				state.handle.h = Math.round(state.handle.w * (nh / nw));
				applyHandlePos();
			}
			showLoading(false);
		};
		img.onerror = function () { showLoading(false); };
		img.crossOrigin = 'anonymous';
		img.src = url;
	}

	/* ------------------------------------------------------------------ */
	/* Drag logic                                                           */
	/* ------------------------------------------------------------------ */
	function startDrag(mx, my) {
		state.drag.active    = true;
		state.drag.startMouseX = mx;
		state.drag.startMouseY = my;
		state.drag.startX    = state.handle.x;
		state.drag.startY    = state.handle.y;
		dom.handle.addClass('arrp-active').css('cursor', 'grabbing');
	}

	function onMouseMove(e) {
		var mx = e.clientX, my = e.clientY;
		if (state.drag.active) {
			var dx = mx - state.drag.startMouseX;
			var dy = my - state.drag.startMouseY;
			var wrapW = dom.canvasWrap.width();
			var wrapH = dom.canvasWrap.height();
			state.handle.x = clamp(state.drag.startX + dx, 0, wrapW - state.handle.w);
			state.handle.y = clamp(state.drag.startY + dy, 0, wrapH - state.handle.h);
			applyHandlePos();
		}
		if (state.resize.active) {
			doResize(mx, my);
		}
	}

	function onMouseUp() {
		if (state.drag.active) {
			state.drag.active = false;
			dom.handle.removeClass('arrp-active').css('cursor', 'grab');
		}
		if (state.resize.active) {
			state.resize.active = false;
		}
	}

	/* ------------------------------------------------------------------ */
	/* Resize logic                                                         */
	/* ------------------------------------------------------------------ */
	var MIN_SIZE = 40;

	function startResize(mx, my, dir) {
		state.resize.active     = true;
		state.resize.dir        = dir;
		state.resize.startMouseX = mx;
		state.resize.startMouseY = my;
		state.resize.startX     = state.handle.x;
		state.resize.startY     = state.handle.y;
		state.resize.startW     = state.handle.w;
		state.resize.startH     = state.handle.h;
	}

	function doResize(mx, my) {
		var r  = state.resize;
		var dx = mx - r.startMouseX;
		var dy = my - r.startMouseY;
		var newX = r.startX, newY = r.startY, newW = r.startW, newH = r.startH;

		switch (r.dir) {
			case 'se':
				newW = Math.max(MIN_SIZE, r.startW + dx);
				newH = Math.max(MIN_SIZE, r.startH + dy);
				break;
			case 'sw':
				newW = Math.max(MIN_SIZE, r.startW - dx);
				newH = Math.max(MIN_SIZE, r.startH + dy);
				newX = r.startX + (r.startW - newW);
				break;
			case 'ne':
				newW = Math.max(MIN_SIZE, r.startW + dx);
				newH = Math.max(MIN_SIZE, r.startH - dy);
				newY = r.startY + (r.startH - newH);
				break;
			case 'nw':
				newW = Math.max(MIN_SIZE, r.startW - dx);
				newH = Math.max(MIN_SIZE, r.startH - dy);
				newX = r.startX + (r.startW - newW);
				newY = r.startY + (r.startH - newH);
				break;
		}

		var wrapW = dom.canvasWrap.width();
		var wrapH = dom.canvasWrap.height();
		state.handle.x = clamp(newX, 0, wrapW - MIN_SIZE);
		state.handle.y = clamp(newY, 0, wrapH - MIN_SIZE);
		state.handle.w = Math.min(newW, wrapW - state.handle.x);
		state.handle.h = Math.min(newH, wrapH - state.handle.y);
		applyHandlePos();
	}

	/* ------------------------------------------------------------------ */
	/* Apply handle position/size to DOM                                   */
	/* ------------------------------------------------------------------ */
	function applyHandlePos() {
		dom.handle.css({
			left:   state.handle.x + 'px',
			top:    state.handle.y + 'px',
			width:  state.handle.w + 'px',
			height: state.handle.h + 'px'
		});
	}

	/* ------------------------------------------------------------------ */
	/* Download / Save preview                                             */
	/* ------------------------------------------------------------------ */
	function downloadPreview() {
		if (!state.roomDataUrl) { return; }
		showLoading(true);

		var canvas = dom.canvas;
		var ctx    = canvas.getContext('2d');

		// Scale factor: canvas is full-res, DOM wrap is scaled down
		var displayW = dom.canvasWrap.width();
		var displayH = dom.canvasWrap.height();
		var scaleX   = canvas.width  / displayW;
		var scaleY   = canvas.height / displayH;

		var roomImg = new Image();
		roomImg.onload = function () {
			ctx.clearRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(roomImg, 0, 0, canvas.width, canvas.height);

			var prodImg = new Image();
			prodImg.crossOrigin = 'anonymous';
			prodImg.onload = function () {
				ctx.drawImage(
					prodImg,
					state.handle.x * scaleX,
					state.handle.y * scaleY,
					state.handle.w * scaleX,
					state.handle.h * scaleY
				);
				var link     = document.createElement('a');
				link.download = 'room-preview.png';
				link.href     = canvas.toDataURL('image/png');
				link.click();
				showLoading(false);
			};
			prodImg.onerror = function () {
				// CORS issue – draw without product and still download room
				var link     = document.createElement('a');
				link.download = 'room-preview.png';
				link.href     = canvas.toDataURL('image/png');
				link.click();
				showLoading(false);
			};
			prodImg.src = state.productImgUrl;
		};
		roomImg.src = state.roomDataUrl;
	}

	/* ------------------------------------------------------------------ */
	/* Helpers                                                              */
	/* ------------------------------------------------------------------ */
	function showLoading(show) {
		dom.canvasWrap.find('.arrp-loading').remove();
		if (show) {
			dom.canvasWrap.append('<div class="arrp-loading"><div class="arrp-spinner"></div></div>');
		}
	}

	function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

}(jQuery));
