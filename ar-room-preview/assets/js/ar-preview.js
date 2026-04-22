(function ($) {
	'use strict';

	/* ---- state ---- */
	var roomDataUrl  = null;
	var productImgUrl = (window.ARRP && ARRP.productImageUrl) ? ARRP.productImageUrl : '';
	var handle = { x: 0, y: 0, w: 0, h: 0 };
	var drag   = { on: false, mx: 0, my: 0, sx: 0, sy: 0 };
	var rsz    = { on: false, dir: '', mx: 0, my: 0, sx: 0, sy: 0, sw: 0, sh: 0 };
	var MIN    = 40;

	/* ---- dom ---- */
	var $modal, $overlay, $openBtn, $closeBtn,
	    $stepUpload, $stepPreview,
	    $uploadArea, $fileInput,
	    $canvasWrap, canvas, ctx,
	    $handle, $productImg,
	    $swatchesWrap, $swatches,
	    $resetBtn, $downloadBtn;

	$(function () {
		$modal       = $('#arrp-modal');
		$overlay     = $('#arrp-overlay');
		$openBtn     = $('#arrp-open-btn');
		$closeBtn    = $('#arrp-close-btn');
		$stepUpload  = $('#arrp-step-upload');
		$stepPreview = $('#arrp-step-preview');
		$uploadArea  = $('#arrp-upload-area');
		$fileInput   = $('#arrp-file-input');
		$canvasWrap  = $('.arrp-canvas-wrap');
		canvas       = document.getElementById('arrp-canvas');
		ctx          = canvas ? canvas.getContext('2d') : null;
		$handle      = $('#arrp-product-handle');
		$productImg  = $('#arrp-product-img');
		$swatchesWrap = $('#arrp-swatches-wrap');
		$swatches    = $('#arrp-swatches');
		$resetBtn    = $('#arrp-reset-btn');
		$downloadBtn = $('#arrp-download-btn');

		if ( ! $modal.length ) return;

		bindEvents();
		readSwatchesFromPage();
	});

	/* ================================================================
	   Read variation data that WooCommerce already outputs on the page
	================================================================= */
	function readSwatchesFromPage() {
		// WooCommerce outputs variation JSON in .variations_form[data-product_variations]
		var $form = $('form.variations_form');
		if ( ! $form.length ) return;

		var raw = $form.attr('data-product_variations');
		if ( ! raw || raw === 'false' ) return;

		var variations;
		try { variations = JSON.parse( raw ); } catch(e) { return; }
		if ( ! variations || ! variations.length ) return;

		// Find the colour attribute key
		var attrKeys = Object.keys( variations[0].attributes || {} );
		var colorKey = attrKeys.find(function(k){
			return /colou?r|rang/i.test(k);
		}) || attrKeys[0];

		if ( ! colorKey ) return;

		var seen = [];
		var swatchData = [];

		variations.forEach(function(v){
			var val = v.attributes[ colorKey ];
			if ( ! val || seen.indexOf(val) !== -1 ) return;
			seen.push(val);

			var imgUrl = (v.image && v.image.full_src) ? v.image.full_src
			           : (v.image && v.image.src)      ? v.image.src
			           : productImgUrl;

			swatchData.push({
				label : val.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}),
				value : val,
				imgUrl: imgUrl,
				hex   : labelToHex(val)
			});
		});

		if ( ! swatchData.length ) return;

		$swatchesWrap.show();
		$swatches.empty();

		swatchData.forEach(function(s, i){
			var $el = $('<div class="arrp-swatch" tabindex="0" role="button">')
				.attr('aria-label', s.label);
			var $circle = $('<div class="arrp-swatch-circle">').css('background', s.hex);
			var $name   = $('<span class="arrp-swatch-name">').text(s.label);
			$el.append($circle, $name).data('swatch', s);

			$el.on('click keydown', function(e){
				if (e.type==='keydown' && e.key!=='Enter' && e.key!==' ') return;
				$swatches.find('.arrp-swatch').removeClass('arrp-swatch-active');
				$el.addClass('arrp-swatch-active');
				changeProductImage(s.imgUrl);
			});

			$swatches.append($el);
			if (i === 0) { $el.trigger('click'); }
		});
	}

	/* ================================================================
	   Events
	================================================================= */
	function bindEvents() {
		$openBtn.on('click', openModal);
		$closeBtn.on('click', closeModal);
		$overlay.on('click', closeModal);
		$(document).on('keydown', function(e){ if(e.key==='Escape') closeModal(); });

		$fileInput.on('change', function(){ if(this.files[0]) readFile(this.files[0]); });

		$uploadArea
			.on('dragover dragenter', function(e){
				e.preventDefault();
				$(this).addClass('arrp-drag-over');
			})
			.on('dragleave', function(){ $(this).removeClass('arrp-drag-over'); })
			.on('drop', function(e){
				e.preventDefault();
				$(this).removeClass('arrp-drag-over');
				var files = e.originalEvent.dataTransfer.files;
				if(files && files[0]) readFile(files[0]);
			});

		$resetBtn.on('click', resetUpload);
		$downloadBtn.on('click', savePreview);

		// Drag — mouse
		$handle.on('mousedown', function(e){
			if ($(e.target).hasClass('arrp-resize-handle')) return;
			startDrag(e.clientX, e.clientY); e.preventDefault();
		});
		// Drag — touch
		$handle.on('touchstart', function(e){
			if ($(e.target).hasClass('arrp-resize-handle')) return;
			var t=e.originalEvent.touches[0]; startDrag(t.clientX, t.clientY); e.preventDefault();
		},{passive:false});

		// Resize — mouse
		$handle.on('mousedown', '.arrp-resize-handle', function(e){
			startResize(e.clientX, e.clientY, $(this).data('dir')); e.stopPropagation(); e.preventDefault();
		});
		// Resize — touch
		$handle.on('touchstart', '.arrp-resize-handle', function(e){
			var t=e.originalEvent.touches[0]; startResize(t.clientX, t.clientY, $(this).data('dir'));
			e.stopPropagation(); e.preventDefault();
		},{passive:false});

		$(document)
			.on('mousemove', onMove)
			.on('mouseup',   onUp)
			.on('touchmove', function(e){
				var t=e.originalEvent.touches[0]; onMove({clientX:t.clientX,clientY:t.clientY});
				if(drag.on||rsz.on) e.preventDefault();
			},{passive:false})
			.on('touchend', onUp);
	}

	/* ================================================================
	   Modal
	================================================================= */
	function openModal()  { $modal.css('display','flex'); $('body').css('overflow','hidden'); }
	function closeModal() { $modal.hide(); $('body').css('overflow',''); }

	/* ================================================================
	   File / room photo
	================================================================= */
	function readFile(file) {
		if (!file || !file.type.match('image.*')) return;
		if (file.size > 10*1024*1024) { alert('Image must be under 10 MB.'); return; }
		showSpinner(true);
		var reader = new FileReader();
		reader.onload = function(ev){
			var img = new Image();
			img.onload = function(){
				roomDataUrl = ev.target.result;
				canvas.width  = img.naturalWidth;
				canvas.height = img.naturalHeight;
				showPreview();
				showSpinner(false);
			};
			img.src = ev.target.result;
		};
		reader.readAsDataURL(file);
	}

	function showPreview() {
		$stepUpload.hide();
		$stepPreview.show();
		$canvasWrap.find('.arrp-room-bg').remove();
		var $bg = $('<img class="arrp-room-bg">').attr('src', roomDataUrl);
		$canvasWrap.prepend($bg);

		$bg.on('load', placeProduct);
		if ($bg[0].complete) placeProduct();
	}

	function placeProduct() {
		var ww = $canvasWrap.width();
		var wh = $canvasWrap.height() || $canvasWrap.find('.arrp-room-bg').height() || 400;
		var pw = Math.round(ww * 0.28);
		handle.w = pw; handle.h = pw;
		handle.x = Math.round((ww - pw) / 2);
		handle.y = Math.round((wh - pw) / 2);
		applyHandle();

		$productImg.attr('src', productImgUrl).on('load', function(){
			var nw=this.naturalWidth, nh=this.naturalHeight;
			if(nw&&nh){ handle.h=Math.round(handle.w*(nh/nw)); applyHandle(); }
		});
	}

	function resetUpload() {
		$stepPreview.hide(); $stepUpload.show();
		$fileInput.val(''); roomDataUrl=null;
	}

	/* ================================================================
	   Colour change
	================================================================= */
	function changeProductImage(url) {
		showSpinner(true);
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = function(){
			productImgUrl = url;
			$productImg.attr('src', url);
			var nw=img.naturalWidth, nh=img.naturalHeight;
			if(nw&&nh){ handle.h=Math.round(handle.w*(nh/nw)); applyHandle(); }
			showSpinner(false);
		};
		img.onerror = function(){ showSpinner(false); };
		img.src = url;
	}

	/* ================================================================
	   Drag
	================================================================= */
	function startDrag(mx,my){
		drag.on=true; drag.mx=mx; drag.my=my; drag.sx=handle.x; drag.sy=handle.y;
		$handle.addClass('arrp-active').css('cursor','grabbing');
	}
	function onMove(e){
		if(drag.on){
			var ww=$canvasWrap.width(), wh=$canvasWrap.height();
			handle.x = clamp(drag.sx+(e.clientX-drag.mx), 0, ww-handle.w);
			handle.y = clamp(drag.sy+(e.clientY-drag.my), 0, wh-handle.h);
			applyHandle();
		}
		if(rsz.on) doResize(e.clientX, e.clientY);
	}
	function onUp(){
		if(drag.on){ drag.on=false; $handle.removeClass('arrp-active').css('cursor','grab'); }
		if(rsz.on)   rsz.on=false;
	}

	/* ================================================================
	   Resize
	================================================================= */
	function startResize(mx,my,dir){
		rsz.on=true; rsz.dir=dir; rsz.mx=mx; rsz.my=my;
		rsz.sx=handle.x; rsz.sy=handle.y; rsz.sw=handle.w; rsz.sh=handle.h;
	}
	function doResize(mx,my){
		var dx=mx-rsz.mx, dy=my-rsz.my;
		var x=rsz.sx, y=rsz.sy, w=rsz.sw, h=rsz.sh;
		switch(rsz.dir){
			case'se': w=Math.max(MIN,w+dx); h=Math.max(MIN,h+dy); break;
			case'sw': w=Math.max(MIN,w-dx); h=Math.max(MIN,h+dy); x=rsz.sx+(rsz.sw-w); break;
			case'ne': w=Math.max(MIN,w+dx); h=Math.max(MIN,h-dy); y=rsz.sy+(rsz.sh-h); break;
			case'nw': w=Math.max(MIN,w-dx); h=Math.max(MIN,h-dy); x=rsz.sx+(rsz.sw-w); y=rsz.sy+(rsz.sh-h); break;
		}
		var ww=$canvasWrap.width(), wh=$canvasWrap.height();
		handle.x=clamp(x,0,ww-MIN); handle.y=clamp(y,0,wh-MIN);
		handle.w=Math.min(w,ww-handle.x); handle.h=Math.min(h,wh-handle.y);
		applyHandle();
	}

	/* ================================================================
	   Save preview
	================================================================= */
	function savePreview(){
		if(!roomDataUrl) return;
		showSpinner(true);
		var scaleX = canvas.width  / $canvasWrap.width();
		var scaleY = canvas.height / ($canvasWrap.height()||canvas.height);
		var room=new Image(), prod=new Image();
		room.onload=function(){
			ctx.clearRect(0,0,canvas.width,canvas.height);
			ctx.drawImage(room,0,0,canvas.width,canvas.height);
			prod.crossOrigin='anonymous';
			prod.onload=function(){
				ctx.drawImage(prod,
					handle.x*scaleX, handle.y*scaleY,
					handle.w*scaleX, handle.h*scaleY);
				doDownload();
			};
			prod.onerror=doDownload;
			prod.src=productImgUrl;
		};
		room.src=roomDataUrl;

		function doDownload(){
			var a=document.createElement('a');
			a.download='room-preview.png';
			a.href=canvas.toDataURL('image/png');
			a.click(); showSpinner(false);
		}
	}

	/* ================================================================
	   Helpers
	================================================================= */
	function applyHandle(){
		$handle.css({left:handle.x+'px',top:handle.y+'px',width:handle.w+'px',height:handle.h+'px'});
	}
	function showSpinner(show){
		$canvasWrap.find('.arrp-loading').remove();
		if(show) $canvasWrap.append('<div class="arrp-loading"><div class="arrp-spinner"></div></div>');
	}
	function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

	var COLOUR_MAP = {
		red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',orange:'#fb8c00',
		purple:'#8e24aa',pink:'#e91e63',brown:'#6d4c41',black:'#212121',white:'#f5f5f5',
		grey:'#9e9e9e',gray:'#9e9e9e',beige:'#d7ccc8',navy:'#1a237e',teal:'#00897b',
		gold:'#ffc107',silver:'#bdbdbd',cream:'#fff8e1',maroon:'#880e4f',olive:'#827717',
		coral:'#ff7043',cyan:'#00bcd4',indigo:'#3949ab',khaki:'#c8b560'
	};
	function labelToHex(label){
		var l=label.toLowerCase();
		for(var k in COLOUR_MAP){ if(l.indexOf(k)!==-1) return COLOUR_MAP[k]; }
		var h=0; for(var i=0;i<l.length;i++) h=(h*31+l.charCodeAt(i))&0xffffff;
		return '#'+('000000'+h.toString(16)).slice(-6);
	}

}(jQuery));
