(function ($) {
	'use strict';

	/* ── state ── */
	var roomDataUrl      = null;
	var roomNatW         = 0, roomNatH = 0;
	var productImgUrl    = (window.ARRP && ARRP.productImageUrl) ? ARRP.productImageUrl : '';
	var processedProdUrl = '';   // bg-removed version
	var handle           = { x:0, y:0, w:0, h:0 };
	var drag             = { on:false, mx:0, my:0, sx:0, sy:0 };
	var rsz              = { on:false, dir:'', mx:0, my:0, sx:0, sy:0, sw:0, sh:0 };
	var MIN              = 40;

	/* ── dom ── */
	var $modal, $overlay, $openBtn, $closeBtn,
	    $stepUpload, $stepPreview,
	    $fileInput, $cameraInput,
	    $canvasWrap, canvas, ctx,
	    $handle, $productImg, $shadow,
	    $swatchesWrap, $swatches,
	    $resetBtn, $downloadBtn;

	$(function () {
		$modal        = $('#arrp-modal');
		$overlay      = $('#arrp-overlay');
		$openBtn      = $('#arrp-open-btn');
		$closeBtn     = $('#arrp-close-btn');
		$stepUpload   = $('#arrp-step-upload');
		$stepPreview  = $('#arrp-step-preview');
		$fileInput    = $('#arrp-file-input');
		$cameraInput  = $('#arrp-camera-input');
		$canvasWrap   = $('.arrp-canvas-wrap');
		canvas        = document.getElementById('arrp-canvas');
		ctx           = canvas ? canvas.getContext('2d') : null;
		$handle       = $('#arrp-product-handle');
		$productImg   = $('#arrp-product-img');
		$shadow       = $('#arrp-product-shadow');
		$swatchesWrap = $('#arrp-swatches-wrap');
		$swatches     = $('#arrp-swatches');
		$resetBtn     = $('#arrp-reset-btn');
		$downloadBtn  = $('#arrp-download-btn');

		if (!$modal.length) return;
		bindEvents();
		readSwatches();
	});

	/* ================================================================
	   Background Removal via Canvas pixel processing
	   Samples corners to find bg colour, removes similar pixels
	================================================================= */
	function removeBg(imgEl, onDone) {
		var oc  = document.createElement('canvas');
		var oct = oc.getContext('2d');
		var w   = imgEl.naturalWidth  || imgEl.width  || 300;
		var h   = imgEl.naturalHeight || imgEl.height || 300;
		oc.width = w; oc.height = h;

		try {
			oct.drawImage(imgEl, 0, 0, w, h);
			var imgData = oct.getImageData(0, 0, w, h);
			var d       = imgData.data;

			/* Sample the four corners (5×5 area each) to detect background colour */
			var samples = [];
			var add = function(px, py) {
				for (var dy=0; dy<5; dy++) for (var dx=0; dx<5; dx++) {
					var ix = Math.min(px+dx, w-1), iy = Math.min(py+dy, h-1);
					var i4 = (iy*w + ix)*4;
					if (d[i4+3] > 200) samples.push([d[i4], d[i4+1], d[i4+2]]);
				}
			};
			add(0,0); add(w-5,0); add(0,h-5); add(w-5,h-5);

			if (!samples.length) { onDone(null); return; }

			/* Average bg colour */
			var bgR=0, bgG=0, bgB=0;
			samples.forEach(function(s){ bgR+=s[0]; bgG+=s[1]; bgB+=s[2]; });
			bgR=Math.round(bgR/samples.length);
			bgG=Math.round(bgG/samples.length);
			bgB=Math.round(bgB/samples.length);

			/* Only apply if bg is clearly light (white/grey/cream product photos) */
			var brightness = (bgR*299 + bgG*587 + bgB*114) / 1000;
			var THRESH = brightness > 180 ? 55 : 35;  // stricter for darker bgs

			for (var i=0; i<d.length; i+=4) {
				var dr=d[i]-bgR, dg=d[i+1]-bgG, db=d[i+2]-bgB;
				var dist = Math.sqrt(dr*dr + dg*dg + db*db);
				if (dist < THRESH) {
					d[i+3] = 0;
				} else if (dist < THRESH + 25) {
					/* Feathered edge for smooth border */
					d[i+3] = Math.round((dist - THRESH) / 25 * d[i+3]);
				}
			}
			oct.putImageData(imgData, 0, 0);
			onDone(oc.toDataURL('image/png'));
		} catch(e) {
			/* CORS or other error — use original */
			onDone(null);
		}
	}

	/* ================================================================
	   Load product image, remove background, store processed URL
	================================================================= */
	function loadProductImage(url, onReady) {
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = function() {
			removeBg(img, function(processedUrl) {
				processedProdUrl = processedUrl || url;
				$productImg.attr('src', processedProdUrl);
				if (onReady) onReady(img.naturalWidth, img.naturalHeight);
			});
		};
		img.onerror = function() {
			processedProdUrl = url;
			$productImg.attr('src', url);
			if (onReady) onReady(0, 0);
		};
		img.src = url;
	}

	/* ================================================================
	   WooCommerce variation swatches — read from page
	================================================================= */
	function readSwatches() {
		var $form = $('form.variations_form');
		if (!$form.length) return;
		var raw = $form.attr('data-product_variations');
		if (!raw || raw === 'false') return;

		var variations;
		try { variations = JSON.parse(raw); } catch(e) { return; }
		if (!variations || !variations.length) return;

		var attrKeys = Object.keys(variations[0].attributes || {});
		var colorKey = null;
		for (var i=0; i<attrKeys.length; i++) {
			if (/colou?r|rang/i.test(attrKeys[i])) { colorKey = attrKeys[i]; break; }
		}
		if (!colorKey) colorKey = attrKeys[0];
		if (!colorKey) return;

		var seen=[], swatchData=[];
		variations.forEach(function(v) {
			var val = v.attributes[colorKey];
			if (!val || seen.indexOf(val)!==-1) return;
			seen.push(val);
			var imgUrl = (v.image && (v.image.full_src||v.image.src)) || productImgUrl;
			swatchData.push({
				label : val.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}),
				value : val,
				imgUrl: imgUrl,
				hex   : labelToHex(val)
			});
		});

		if (!swatchData.length) return;
		$swatchesWrap.show();
		$swatches.empty();

		swatchData.forEach(function(s, i) {
			var $el     = $('<div class="arrp-swatch" tabindex="0" role="button">').attr('aria-label', s.label);
			var $circle = $('<div class="arrp-swatch-circle">').css('background', s.hex);
			var $name   = $('<span class="arrp-swatch-name">').text(s.label);
			$el.append($circle, $name).data('swatch', s);
			$el.on('click keydown', function(e) {
				if (e.type==='keydown' && e.key!=='Enter' && e.key!==' ') return;
				$swatches.find('.arrp-swatch').removeClass('arrp-swatch-active');
				$el.addClass('arrp-swatch-active');
				switchColour(s.imgUrl);
			});
			$swatches.append($el);
			if (i===0) $el.trigger('click');
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

		$fileInput.on('change',   function(){ if(this.files[0]) readFile(this.files[0]); });
		$cameraInput.on('change', function(){ if(this.files[0]) readFile(this.files[0]); });

		$('#arrp-upload-area')
			.on('dragover dragenter', function(e){ e.preventDefault(); $(this).css('border-color','#1a1a1a'); })
			.on('dragleave',          function()  { $(this).css('border-color',''); })
			.on('drop', function(e){
				e.preventDefault(); $(this).css('border-color','');
				var f = e.originalEvent.dataTransfer.files[0];
				if(f) readFile(f);
			});

		$resetBtn.on('click',    resetUpload);
		$downloadBtn.on('click', savePreview);

		$handle.on('mousedown', function(e){
			if($(e.target).hasClass('arrp-resize-handle')) return;
			startDrag(e.clientX, e.clientY); e.preventDefault();
		});
		$handle.on('touchstart', function(e){
			if($(e.target).hasClass('arrp-resize-handle')) return;
			var t=e.originalEvent.touches[0]; startDrag(t.clientX,t.clientY); e.preventDefault();
		},{passive:false});
		$handle.on('mousedown', '.arrp-resize-handle', function(e){
			startResize(e.clientX,e.clientY,$(this).data('dir')); e.stopPropagation(); e.preventDefault();
		});
		$handle.on('touchstart', '.arrp-resize-handle', function(e){
			var t=e.originalEvent.touches[0]; startResize(t.clientX,t.clientY,$(this).data('dir'));
			e.stopPropagation(); e.preventDefault();
		},{passive:false});
		$(document)
			.on('mousemove', onMove).on('mouseup', onUp)
			.on('touchmove', function(e){
				var t=e.originalEvent.touches[0]; onMove({clientX:t.clientX,clientY:t.clientY});
				if(drag.on||rsz.on) e.preventDefault();
			},{passive:false})
			.on('touchend', onUp);
	}

	/* ================================================================
	   Modal open / close
	================================================================= */
	function openModal()  { $modal.css('display','flex'); $('body').css('overflow','hidden'); }
	function closeModal() { $modal.hide(); $('body').css('overflow',''); }

	/* ================================================================
	   Room photo
	================================================================= */
	function readFile(file) {
		if (!file || !file.type.match('image.*')) return;
		if (file.size > 10*1024*1024) { alert('Image must be under 10 MB.'); return; }
		showSpinner(true);
		var reader = new FileReader();
		reader.onload = function(ev) {
			var img = new Image();
			img.onload = function() {
				roomDataUrl = ev.target.result;
				roomNatW    = img.naturalWidth;
				roomNatH    = img.naturalHeight;
				if(canvas){ canvas.width=roomNatW; canvas.height=roomNatH; }
				showPreview();
			};
			img.src = ev.target.result;
		};
		reader.readAsDataURL(file);
	}

	function showPreview() {
		$stepUpload.hide();
		$stepPreview.show();
		$canvasWrap.find('.arrp-room-bg').remove();
		var $bg = $('<img class="arrp-room-bg">').attr({ src:roomDataUrl, alt:'' });
		$canvasWrap.prepend($bg);
		$bg.on('load', function(){ placeProduct(); });
		if ($bg[0].complete) placeProduct();
	}

	function placeProduct() {
		showSpinner(true);
		var ww = $canvasWrap.width();
		var wh = $canvasWrap.height() || $canvasWrap.find('.arrp-room-bg').height() || 400;

		loadProductImage(productImgUrl, function(nw, nh) {
			var pw = Math.round(ww * 0.25);
			var ph = (nw && nh) ? Math.round(pw * nh / nw) : pw;

			handle.w = pw;
			handle.h = ph;
			/* Smart placement: lower-centre of the room — where surfaces (table/floor) are */
			handle.x = Math.round((ww - pw) / 2);
			handle.y = Math.round(wh * 0.60 - ph / 2);
			handle.y = clamp(handle.y, 0, wh - ph);
			applyHandle();
			updateShadow();
			showSpinner(false);
		});
	}

	function resetUpload() {
		$stepPreview.hide(); $stepUpload.show();
		$fileInput.val(''); $cameraInput.val('');
		roomDataUrl = null;
	}

	/* ================================================================
	   Colour switching — processes new image through bg removal
	================================================================= */
	function switchColour(url) {
		if (!url) return;
		productImgUrl = url;
		if (!roomDataUrl) return;   // not in preview yet — just store URL
		showSpinner(true);
		loadProductImage(url, function(nw, nh) {
			if (nw && nh) {
				handle.h = Math.round(handle.w * nh / nw);
				applyHandle();
				updateShadow();
			}
			showSpinner(false);
		});
	}

	/* ================================================================
	   Shadow — oval below product to simulate surface placement
	================================================================= */
	function updateShadow() {
		$shadow.css({
			left:   (handle.x + handle.w * 0.1) + 'px',
			top:    (handle.y + handle.h - 6)    + 'px',
			width:  (handle.w * 0.8)             + 'px',
			height: Math.round(handle.w * 0.08)  + 'px'
		});
	}

	/* ================================================================
	   Drag
	================================================================= */
	function startDrag(mx, my) {
		drag.on=true; drag.mx=mx; drag.my=my; drag.sx=handle.x; drag.sy=handle.y;
		$handle.addClass('arrp-active').css('cursor','grabbing');
	}
	function onMove(e) {
		if (drag.on) {
			var ww=$canvasWrap.width(), wh=$canvasWrap.height();
			handle.x = clamp(drag.sx+(e.clientX-drag.mx), 0, ww-handle.w);
			handle.y = clamp(drag.sy+(e.clientY-drag.my), 0, wh-handle.h);
			applyHandle(); updateShadow();
		}
		if (rsz.on) doResize(e.clientX, e.clientY);
	}
	function onUp() {
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
		var x=rsz.sx,y=rsz.sy,w=rsz.sw,h=rsz.sh;
		switch(rsz.dir){
			case 'se': w=Math.max(MIN,w+dx); h=Math.max(MIN,h+dy); break;
			case 'sw': w=Math.max(MIN,w-dx); h=Math.max(MIN,h+dy); x=rsz.sx+(rsz.sw-w); break;
			case 'ne': w=Math.max(MIN,w+dx); h=Math.max(MIN,h-dy); y=rsz.sy+(rsz.sh-h); break;
			case 'nw': w=Math.max(MIN,w-dx); h=Math.max(MIN,h-dy); x=rsz.sx+(rsz.sw-w); y=rsz.sy+(rsz.sh-h); break;
		}
		var ww=$canvasWrap.width(), wh=$canvasWrap.height();
		handle.x=clamp(x,0,ww-MIN); handle.y=clamp(y,0,wh-MIN);
		handle.w=Math.min(w,ww-handle.x); handle.h=Math.min(h,wh-handle.y);
		applyHandle(); updateShadow();
	}

	/* ================================================================
	   Save / Download
	================================================================= */
	function savePreview(){
		if(!roomDataUrl||!ctx) return;
		showSpinner(true);
		var scaleX = canvas.width  / $canvasWrap.width();
		var scaleY = canvas.height / ($canvasWrap.height()||canvas.height);

		var room=new Image();
		room.onload = function(){
			ctx.clearRect(0,0,canvas.width,canvas.height);
			ctx.drawImage(room,0,0,canvas.width,canvas.height);

			/* Draw shadow on canvas */
			var sx = handle.x*scaleX + handle.w*scaleX*0.1;
			var sy = (handle.y+handle.h)*scaleY - 4*scaleY;
			var sw = handle.w*scaleX*0.8;
			var sh = handle.w*scaleX*0.08;
			var grd = ctx.createRadialGradient(sx+sw/2,sy+sh/2,0, sx+sw/2,sy+sh/2,sw/2);
			grd.addColorStop(0,'rgba(0,0,0,0.4)');
			grd.addColorStop(1,'rgba(0,0,0,0)');
			ctx.fillStyle=grd;
			ctx.beginPath();
			ctx.ellipse(sx+sw/2, sy+sh/2, sw/2, sh/2, 0, 0, Math.PI*2);
			ctx.fill();

			var prod=new Image();
			prod.crossOrigin='anonymous';
			prod.onload=function(){
				ctx.drawImage(prod, handle.x*scaleX, handle.y*scaleY, handle.w*scaleX, handle.h*scaleY);
				doDownload();
			};
			prod.onerror=doDownload;
			prod.src = processedProdUrl || productImgUrl;
		};
		room.src = roomDataUrl;

		function doDownload(){
			canvas.style.display='block';
			var a=document.createElement('a');
			a.download='room-preview.png'; a.href=canvas.toDataURL('image/png'); a.click();
			canvas.style.display='none';
			showSpinner(false);
		}
	}

	/* ================================================================
	   Helpers
	================================================================= */
	function applyHandle(){
		$handle.css({ left:handle.x+'px',top:handle.y+'px',width:handle.w+'px',height:handle.h+'px' });
	}
	function showSpinner(show){
		$canvasWrap.find('.arrp-loading').remove();
		if(show) $canvasWrap.append('<div class="arrp-loading"><div class="arrp-spinner"></div></div>');
	}
	function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

	var HEX_MAP={
		red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',orange:'#fb8c00',
		purple:'#8e24aa',pink:'#e91e63',brown:'#6d4c41',black:'#212121',white:'#f5f5f5',
		grey:'#9e9e9e',gray:'#9e9e9e',beige:'#d7ccc8',navy:'#1a237e',teal:'#00897b',
		gold:'#ffc107',silver:'#bdbdbd',cream:'#fff8e1',maroon:'#880e4f',olive:'#827717',
		coral:'#ff7043',cyan:'#00bcd4',indigo:'#3949ab',khaki:'#c8b560',
		'dark blue':'#1565c0','light blue':'#64b5f6','dark green':'#2e7d32',
		rose:'#e91e63',mustard:'#f9a825',charcoal:'#37474f'
	};
	function labelToHex(label){
		var l=label.toLowerCase().replace(/-/g,' ');
		for(var k in HEX_MAP){ if(l.indexOf(k)!==-1) return HEX_MAP[k]; }
		var h=0; for(var i=0;i<l.length;i++) h=(h*31+l.charCodeAt(i))&0xffffff;
		return '#'+('000000'+h.toString(16)).slice(-6);
	}

}(jQuery));
