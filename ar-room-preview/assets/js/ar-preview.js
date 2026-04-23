(function ($) {
	'use strict';

	var cfg            = window.ARRP || {};
	var productImgUrl  = cfg.productImageUrl || '';
	var processedUrls  = {};   /* cache: original url → bg-removed url */
	var roomDataUrl    = null;
	var roomNatW       = 0, roomNatH = 0;
	var handle         = { x:0, y:0, w:0, h:0 };
	var drag           = { on:false, mx:0, my:0, sx:0, sy:0 };
	var rsz            = { on:false, dir:'', mx:0, my:0, sx:0, sy:0, sw:0, sh:0 };
	var MIN            = 40;

	var $modal,$overlay,$openBtn,$closeBtn,
	    $stepUpload,$stepPreview,
	    $fileInput,$cameraInput,
	    $canvasWrap,canvas,ctx,
	    $handle,$productImg,$shadow,$dragHint,
	    $swatchesWrap,$swatches,
	    $resetBtn,$downloadBtn;

	$(function(){
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
		$dragHint     = $('#arrp-drag-hint');
		$swatchesWrap = $('#arrp-swatches-wrap');
		$swatches     = $('#arrp-swatches');
		$resetBtn     = $('#arrp-reset-btn');
		$downloadBtn  = $('#arrp-download-btn');

		if (!$modal.length) return;
		bindEvents();
		readSwatches();

		/* Pre-process the default product image in background */
		if (productImgUrl) prepareImage(productImgUrl, function(){});
	});

	/* ================================================================
	   Image preparation: remove.bg API → local fallback → original
	================================================================= */
	function prepareImage(url, cb) {
		if (processedUrls[url]) { cb(processedUrls[url]); return; }

		/* Try remove.bg via server-side AJAX proxy */
		if (cfg.hasRemoveBgKey && cfg.ajaxUrl) {
			$.ajax({
				url    : cfg.ajaxUrl,
				method : 'POST',
				data   : { action:'arrp_removebg', nonce:cfg.nonce, imageUrl:url },
				timeout: 25000,
				success: function(res){
					if (res.success && res.data && res.data.url) {
						processedUrls[url] = res.data.url;
						cb(res.data.url);
					} else {
						localRemoveBg(url, cb);
					}
				},
				error: function(){ localRemoveBg(url, cb); }
			});
		} else {
			localRemoveBg(url, cb);
		}
	}

	/* ================================================================
	   Local fallback: flood-fill background removal via Canvas
	   Starts from all 4 edges and removes only edge-connected bg pixels.
	   Interior product pixels are never touched.
	================================================================= */
	function localRemoveBg(url, cb) {
		var img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = function(){
			var MAX = 800;
			var nw  = img.naturalWidth, nh = img.naturalHeight;
			var sc  = Math.min(1, MAX / Math.max(nw, nh));
			var w   = Math.round(nw*sc), h = Math.round(nh*sc);

			var oc  = document.createElement('canvas');
			oc.width=w; oc.height=h;
			var oct = oc.getContext('2d');

			try {
				oct.drawImage(img, 0, 0, w, h);
				var id = oct.getImageData(0,0,w,h);
				var d  = id.data;

				/* Average corner colours → background colour */
				function col(x,y){ var i=(y*w+x)*4; return [d[i],d[i+1],d[i+2]]; }
				var c = [col(0,0),col(w-1,0),col(0,h-1),col(w-1,h-1)];
				var bR=0,bG=0,bB=0;
				c.forEach(function(p){bR+=p[0];bG+=p[1];bB+=p[2];});
				bR=Math.round(bR/4); bG=Math.round(bG/4); bB=Math.round(bB/4);

				var bright = (bR*299+bG*587+bB*114)/1000;
				if (bright < 90) { processedUrls[url]=url; cb(url); return; } /* dark bg — skip */

				var T = 50;
				function dist(x,y){ var i=(y*w+x)*4,dr=d[i]-bR,dg=d[i+1]-bG,db=d[i+2]-bB; return Math.sqrt(dr*dr+dg*dg+db*db); }

				var vis = new Uint8Array(w*h);
				var q   = [], qi = 0;

				function en(x,y){
					if(x<0||x>=w||y<0||y>=h) return;
					var idx=y*w+x;
					if(vis[idx]) return;
					if(dist(x,y)>T) return;
					vis[idx]=1; q.push(x,y);
				}
				for(var ex=0;ex<w;ex++){ en(ex,0); en(ex,h-1); }
				for(var ey=0;ey<h;ey++){ en(0,ey); en(w-1,ey); }

				while(qi<q.length){
					var bx=q[qi++],by=q[qi++];
					var i4=(by*w+bx)*4, dv=dist(bx,by);
					d[i4+3] = dv < T-10 ? 0 : Math.round((dv-(T-10))/10*d[i4+3]);
					en(bx+1,by); en(bx-1,by); en(bx,by+1); en(bx,by-1);
				}

				oct.putImageData(id,0,0);

				var out = oc;
				if (sc < 1) {
					out = document.createElement('canvas');
					out.width=nw; out.height=nh;
					out.getContext('2d').drawImage(oc,0,0,nw,nh);
				}
				var dataUrl = out.toDataURL('image/png');
				processedUrls[url] = dataUrl;
				cb(dataUrl);
			} catch(e) {
				processedUrls[url] = url;
				cb(url);
			}
		};
		img.onerror = function(){ processedUrls[url]=url; cb(url); };
		img.src = url;
	}

	/* ================================================================
	   WooCommerce variation swatches
	================================================================= */
	function readSwatches(){
		var $form = $('form.variations_form');
		if(!$form.length) return;
		var raw = $form.attr('data-product_variations');
		if(!raw||raw==='false') return;
		var vars; try{vars=JSON.parse(raw);}catch(e){return;}
		if(!vars||!vars.length) return;

		var keys = Object.keys(vars[0].attributes||{});
		var cKey = null;
		for(var i=0;i<keys.length;i++){ if(/colou?r|rang/i.test(keys[i])){cKey=keys[i];break;} }
		if(!cKey) cKey=keys[0];
		if(!cKey) return;

		var seen=[],data=[];
		vars.forEach(function(v){
			var val=v.attributes[cKey];
			if(!val||seen.indexOf(val)!==-1) return;
			seen.push(val);
			var img=(v.image&&(v.image.full_src||v.image.src))||productImgUrl;
			data.push({label:val.replace(/-/g,' ').replace(/\b\w/g,function(c){return c.toUpperCase();}),value:val,imgUrl:img,hex:toHex(val)});
			/* Pre-fetch bg removal for each variation image */
			if(img && img!==productImgUrl) prepareImage(img,function(){});
		});

		if(!data.length) return;
		$swatchesWrap.show(); $swatches.empty();

		data.forEach(function(s,i){
			var $el=$('<div class="arrp-swatch" tabindex="0" role="button">').attr('aria-label',s.label);
			$el.append($('<div class="arrp-swatch-circle">').css('background',s.hex))
			   .append($('<span class="arrp-swatch-name">').text(s.label))
			   .data('swatch',s);
			$el.on('click keydown',function(e){
				if(e.type==='keydown'&&e.key!=='Enter'&&e.key!==' ') return;
				$swatches.find('.arrp-swatch').removeClass('arrp-swatch-active');
				$el.addClass('arrp-swatch-active');
				switchColour(s.imgUrl);
			});
			$swatches.append($el);
			if(i===0) $el.trigger('click');
		});
	}

	/* ================================================================
	   Events
	================================================================= */
	function bindEvents(){
		$openBtn.on('click',openModal);
		$closeBtn.on('click',closeModal);
		$overlay.on('click',closeModal);
		$(document).on('keydown',function(e){if(e.key==='Escape')closeModal();});

		$fileInput.on('change',  function(){if(this.files[0])readFile(this.files[0]);});
		$cameraInput.on('change',function(){if(this.files[0])readFile(this.files[0]);});

		$('#arrp-upload-area')
			.on('dragover dragenter',function(e){e.preventDefault();$(this).css('border-color','#1a1a1a');})
			.on('dragleave',function(){$(this).css('border-color','');})
			.on('drop',function(e){
				e.preventDefault();$(this).css('border-color','');
				var f=e.originalEvent.dataTransfer.files[0]; if(f)readFile(f);
			});

		$resetBtn.on('click',resetUpload);
		$downloadBtn.on('click',savePreview);

		$handle.on('mousedown',function(e){
			if($(e.target).hasClass('arrp-resize-handle'))return;
			startDrag(e.clientX,e.clientY);e.preventDefault();
		});
		$handle.on('touchstart',function(e){
			if($(e.target).hasClass('arrp-resize-handle'))return;
			var t=e.originalEvent.touches[0];startDrag(t.clientX,t.clientY);e.preventDefault();
		},{passive:false});
		$handle.on('mousedown','.arrp-resize-handle',function(e){
			startResize(e.clientX,e.clientY,$(this).data('dir'));e.stopPropagation();e.preventDefault();
		});
		$handle.on('touchstart','.arrp-resize-handle',function(e){
			var t=e.originalEvent.touches[0];startResize(t.clientX,t.clientY,$(this).data('dir'));
			e.stopPropagation();e.preventDefault();
		},{passive:false});
		$(document).on('mousemove',onMove).on('mouseup',onUp)
			.on('touchmove',function(e){
				var t=e.originalEvent.touches[0];onMove({clientX:t.clientX,clientY:t.clientY});
				if(drag.on||rsz.on)e.preventDefault();
			},{passive:false})
			.on('touchend',onUp);
	}

	function openModal(){$modal.css('display','flex');$('body').css('overflow','hidden');}
	function closeModal(){$modal.hide();$('body').css('overflow','');}

	/* ================================================================
	   Room photo
	================================================================= */
	function readFile(file){
		if(!file||!file.type.match('image.*'))return;
		if(file.size>10*1024*1024){alert('Image must be under 10 MB.');return;}
		showSpinner(true);
		var reader=new FileReader();
		reader.onload=function(ev){
			var img=new Image();
			img.onload=function(){
				roomDataUrl=ev.target.result;
				roomNatW=img.naturalWidth; roomNatH=img.naturalHeight;
				if(canvas){canvas.width=roomNatW;canvas.height=roomNatH;}
				showPreview();
			};
			img.src=ev.target.result;
		};
		reader.readAsDataURL(file);
	}

	function showPreview(){
		$stepUpload.hide(); $stepPreview.show();
		$canvasWrap.find('.arrp-room-bg').remove();
		var $bg=$('<img class="arrp-room-bg">').attr({src:roomDataUrl,alt:''});
		$canvasWrap.prepend($bg);
		$bg.on('load',placeProduct);
		if($bg[0].complete) placeProduct();
	}

	function placeProduct(){
		showSpinner(true);
		var ww=$canvasWrap.width();
		var wh=$canvasWrap.height()||$canvasWrap.find('.arrp-room-bg').height()||400;

		/* Use already-prepared (bg-removed) image */
		var currentUrl = processedUrls[productImgUrl] || productImgUrl;

		var tmpImg = new Image();
		tmpImg.onload = function(){
			var nw=tmpImg.naturalWidth, nh=tmpImg.naturalHeight;
			var pw=Math.round(ww*0.25);
			var ph=(nw&&nh)?Math.round(pw*nh/nw):pw;
			handle.w=pw; handle.h=ph;
			handle.x=Math.round((ww-pw)/2);
			handle.y=clamp(Math.round(wh*0.60-ph/2), 0, wh-ph);
			applyHandle(); updateShadow();
			$productImg.attr('src', currentUrl);
			showSpinner(false);
			$dragHint.show();
			setTimeout(function(){$dragHint.fadeOut(600);},3000);
		};
		tmpImg.onerror=function(){ showSpinner(false); };
		tmpImg.src=currentUrl;
	}

	function resetUpload(){
		$stepPreview.hide();$stepUpload.show();
		$fileInput.val('');$cameraInput.val('');
		roomDataUrl=null;
	}

	/* ================================================================
	   Colour switching
	================================================================= */
	function switchColour(url){
		if(!url) return;
		productImgUrl=url;
		if(!roomDataUrl) return;
		showSpinner(true);
		prepareImage(url,function(processed){
			$productImg.attr('src',processed);
			var tmp=new Image();
			tmp.onload=function(){
				var nw=tmp.naturalWidth,nh=tmp.naturalHeight;
				if(nw&&nh){handle.h=Math.round(handle.w*nh/nw);applyHandle();updateShadow();}
				showSpinner(false);
			};
			tmp.onerror=function(){showSpinner(false);};
			tmp.src=processed;
		});
	}

	/* ================================================================
	   Shadow
	================================================================= */
	function updateShadow(){
		$shadow.css({
			left  :(handle.x+handle.w*0.1)+'px',
			top   :(handle.y+handle.h-4)+'px',
			width :(handle.w*0.8)+'px',
			height:Math.round(handle.w*0.08)+'px'
		});
	}

	/* ================================================================
	   Drag / Resize
	================================================================= */
	function startDrag(mx,my){drag.on=true;drag.mx=mx;drag.my=my;drag.sx=handle.x;drag.sy=handle.y;$handle.addClass('arrp-active').css('cursor','grabbing');}
	function onMove(e){
		if(drag.on){
			var ww=$canvasWrap.width(),wh=$canvasWrap.height();
			handle.x=clamp(drag.sx+(e.clientX-drag.mx),0,ww-handle.w);
			handle.y=clamp(drag.sy+(e.clientY-drag.my),0,wh-handle.h);
			applyHandle();updateShadow();
		}
		if(rsz.on) doResize(e.clientX,e.clientY);
	}
	function onUp(){if(drag.on){drag.on=false;$handle.removeClass('arrp-active').css('cursor','grab');}if(rsz.on)rsz.on=false;}
	function startResize(mx,my,dir){rsz.on=true;rsz.dir=dir;rsz.mx=mx;rsz.my=my;rsz.sx=handle.x;rsz.sy=handle.y;rsz.sw=handle.w;rsz.sh=handle.h;}
	function doResize(mx,my){
		var dx=mx-rsz.mx,dy=my-rsz.my,x=rsz.sx,y=rsz.sy,w=rsz.sw,h=rsz.sh;
		switch(rsz.dir){
			case'se':w=Math.max(MIN,w+dx);h=Math.max(MIN,h+dy);break;
			case'sw':w=Math.max(MIN,w-dx);h=Math.max(MIN,h+dy);x=rsz.sx+(rsz.sw-w);break;
			case'ne':w=Math.max(MIN,w+dx);h=Math.max(MIN,h-dy);y=rsz.sy+(rsz.sh-h);break;
			case'nw':w=Math.max(MIN,w-dx);h=Math.max(MIN,h-dy);x=rsz.sx+(rsz.sw-w);y=rsz.sy+(rsz.sh-h);break;
		}
		var ww=$canvasWrap.width(),wh=$canvasWrap.height();
		handle.x=clamp(x,0,ww-MIN);handle.y=clamp(y,0,wh-MIN);
		handle.w=Math.min(w,ww-handle.x);handle.h=Math.min(h,wh-handle.y);
		applyHandle();updateShadow();
	}

	/* ================================================================
	   Save / Download
	================================================================= */
	function savePreview(){
		if(!roomDataUrl||!ctx)return;
		showSpinner(true);
		var scX=canvas.width/$canvasWrap.width();
		var scY=canvas.height/($canvasWrap.height()||canvas.height);
		var room=new Image();
		room.onload=function(){
			ctx.clearRect(0,0,canvas.width,canvas.height);
			ctx.drawImage(room,0,0,canvas.width,canvas.height);
			/* shadow */
			var sx=(handle.x+handle.w*0.1)*scX,sy=(handle.y+handle.h-4)*scY;
			var sw=handle.w*0.8*scX,sh=handle.w*0.08*scX;
			var g=ctx.createRadialGradient(sx+sw/2,sy+sh/2,0,sx+sw/2,sy+sh/2,sw/2);
			g.addColorStop(0,'rgba(0,0,0,0.38)');g.addColorStop(1,'rgba(0,0,0,0)');
			ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(sx+sw/2,sy+sh/2,sw/2,sh/2,0,0,Math.PI*2);ctx.fill();
			/* product */
			var prod=new Image();prod.crossOrigin='anonymous';
			var src=$productImg.attr('src')||productImgUrl;
			prod.onload=function(){ctx.drawImage(prod,handle.x*scX,handle.y*scY,handle.w*scX,handle.h*scY);doSave();};
			prod.onerror=doSave;
			prod.src=src;
		};
		room.src=roomDataUrl;
		function doSave(){
			canvas.style.display='block';
			var a=document.createElement('a');a.download='room-preview.png';a.href=canvas.toDataURL('image/png');a.click();
			canvas.style.display='none';showSpinner(false);
		}
	}

	/* ================================================================
	   Helpers
	================================================================= */
	function applyHandle(){$handle.css({left:handle.x+'px',top:handle.y+'px',width:handle.w+'px',height:handle.h+'px'});}
	function showSpinner(s){$canvasWrap.find('.arrp-loading').remove();if(s)$canvasWrap.append('<div class="arrp-loading"><div class="arrp-spinner"></div></div>');}
	function clamp(v,a,b){return Math.max(a,Math.min(b,v));}

	var HM={red:'#e53935',blue:'#1e88e5',green:'#43a047',yellow:'#fdd835',orange:'#fb8c00',purple:'#8e24aa',pink:'#e91e63',brown:'#6d4c41',black:'#212121',white:'#f5f5f5',grey:'#9e9e9e',gray:'#9e9e9e',beige:'#d7ccc8',navy:'#1a237e',teal:'#00897b',gold:'#ffc107',silver:'#bdbdbd',cream:'#fff8e1',maroon:'#880e4f',olive:'#827717',coral:'#ff7043',cyan:'#00bcd4',indigo:'#3949ab',khaki:'#c8b560','dark blue':'#1565c0','light blue':'#64b5f6',rose:'#e91e63',mustard:'#f9a825',charcoal:'#37474f'};
	function toHex(l){var s=l.toLowerCase().replace(/-/g,' ');for(var k in HM)if(s.indexOf(k)!==-1)return HM[k];var h=0;for(var i=0;i<s.length;i++)h=(h*31+s.charCodeAt(i))&0xffffff;return '#'+('000000'+h.toString(16)).slice(-6);}

}(jQuery));
