/*
* MIT License
* 
* Copyright (c) 2017 gskinner.com, inc.
* 
* Permission is hereby granted, free of charge, to any person obtaining a copy
* of this software and associated documentation files (the "Software"), to deal
* in the Software without restriction, including without limitation the rights
* to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
* copies of the Software, and to permit persons to whom the Software is
* furnished to do so, subject to the following conditions:
* 
* The above copyright notice and this permission notice shall be included in all
* copies or substantial portions of the Software.
* 
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
* IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
* FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
* AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
* LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
* OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
* SOFTWARE.
*/

class JustAddMusic {
	constructor(config) {
		if (!config || typeof config === "string") { config = {src:config}; }
		
	// public properties:
		this.gain = config.gain||1;
		this.onstart = config.onstart;
		this.ontick = config.ontick;
		this.onprogress = config.onprogress;
		this.label = config.label||"";
		
	// private properties:
		// getter / setter values:
		this._paused = !!config.paused;
		this._keyControl = false;
		this._tickInterval = 0;
		this._tickIntervalID = 0;
		
		// file load:
		this._request = null;
		
		// state:
		this._playT = 0;
		this._pausedT = 0;
		this._ui = false;
		this._uiDiv = null;
		
		// analyser:
		this._audioData = null;
		this._deltaT = config.deltaT||50;
		this._avgT = config.avgT||150;
		this._maxT = Math.max(this._deltaT, this._avgT);
		this._allAdj = 0.1;
		this._bandAdj = 0.1;
		
		// hit detection:
		this._inHit = false;
		this._hitThreshold = 2;
		
		// web audio:
		this._context = null;
		this._gainNode = null;
		this._sourceNode = null;
		this._buffer = null;
		this._muteNode = null;
		this._nullNode = null;
		
		// method proxies:
		this._bound_handleKeyDown = this._handleKeyDown.bind(this);
		
		// init:
		this._initAudio();
		this._initUI();
		this._initDropTarget(config.dropTarget);
		
		// setup:
		this.tickInterval = config.tickInterval;
		this.loadAudio(config.src);
		this.ui = config.ui===undefined?true:config.ui;
		this.keyControl = config.keyControl===undefined?true:config.keyControl;
		this.volume = config.volume===undefined?1:config.volume;
	}
	
	
// getter / setters:
	get paused() { return this._paused; }
	set paused(val) {
		!val ? this.play() : this.pause();
	}
	
	get keyControl() { return this._keyControl; }
	set keyControl(val) {
		val = !!val;
		if (this._keyControl === val) { return; }
		this._keyControl = val;
		if (val) { document.addEventListener("keydown", this._bound_handleKeyDown); }
		else { document.removeEventListener("keydown", this._bound_handleKeyDown); }
	}
	
	get tickInterval() { return this._tickInterval; }
	set tickInterval(val=16) {
		clearInterval(this._tickIntervalID);
		this._tickIntervalID = (val > 0) ? setInterval(this.tick.bind(this), val) : 0;
	}
	
	get volume() { return this._gainNode.gain.value; }
	set volume(val) {
		this._gainNode.gain.value = Math.max(0, Math.min(2, val));
	}
	
	get ui() { return this._ui; }
	set ui(val) {
		val = !!val;
		if (this._ui === val) { return; }
		this._ui = val;
		let div = this._uiDiv;
		if (val) { document.body.appendChild(div); }
		else { div.parentNode.removeChild(div); }
	}
	
	get audioData() { return this._audioData[0]||{vol:0,avg:0,delta:0,avgDelta:0,t:0}; }
	
	
// public methods:
	// file load:
	loadAudio(src) {
		this.abort();
		if (!src) { return; }
		this._updateLoadUI(0);
		
		let request = this._request = new XMLHttpRequest();
		request.open('GET', src, true);
		request.responseType = 'arraybuffer';
		request.addEventListener("load", this._handleURILoad.bind(this));
		request.addEventListener("progress", this._handleURIProgress.bind(this));
		request.send();
	}
	
	abort() {
		this._request&&this._request.abort();
		this._request = null;
	}
	
	// playback:
	play() {
		let bufferChanged = (this._sourceNode&&this._sourceNode.buffer) !== this._buffer;
		
		let offset = this._pausedT;
		this.pause(); // disconnect the old source node.
		
		let source = this._sourceNode = this._context.createBufferSource();
		source.buffer = this._buffer;
		source.connect(this._nullNode);
		source.start(0, offset);
		
		this._playT = this._context.currentTime - offset;
		this._paused = false;
		
		bufferChanged&&this.onstart&&this.onstart();
	}
	
	pause() {
		if (!this._sourceNode || this._paused) { return; }
		this._sourceNode.stop();
		this._sourceNode.disconnect();
		this._sourceNode = null;
		this._pausedT = this._context.currentTime - this._playT;
		this._paused = true;
	}
	
	stop() {
		this.abort();
		this.pause();
		this._pausedT = this._playT = 0;
	}
	
	skip(time) {
		if (!this._buffer) { return; }
		if (this._paused) { this._pausedT += time; }
		else {
			this._pausedT = Math.min(this._buffer.duration, Math.max(0, this._context.currentTime - this._playT + time));
			this.play();
		}
	}
	
	tick() {
		if (!this._sourceNode) { return; }
		this._updateTimeUI();
		if (!this.ontick && this._tickIntervalID) { return; }
		!this._allAnalyser&&this._initAnalyser();
		
		let o = this._oldObj || {low:{}, mid:{}, high:{}, all:{}}, data=this._audioData;
		this._oldObj = null;
		data.unshift(o);
		
		let t = o.t = this._context.currentTime*1000;
		this._getVal(o.all, this._allAnalyser, t, true);
		this._getVal(o.low, this._lowAnalyser, t);
		this._getVal(o.mid, this._midAnalyser, t);
		this._getVal(o.high, this._highAnalyser, t);
		
		this._calculateAvgs();
		this._detectHit(o);
		
		this.ontick&&this.ontick(o);
		return o;
	};
	
	toString() {
		return "[JustAddMusic]";
	}
	
// private methods:
	_initAudio() {
		let ctx = this._context = new (window.AudioContext||window.webkitAudioContext)();
		this._gainNode = ctx.createGain();
		this._gainNode.connect(ctx.destination);
		
		// analysers all connect to nullNode, so they don't have to be reconnected when the sourceNode changes:
		this._nullNode = ctx.createGain();
		this._nullNode.connect(this._gainNode);
	}
	
	_initAnalyser() {
		if (this._muteNode) { return; }
		this._audioData = [];
		
		// audio nodes need to be tied into a destination to work.
		// this gives us a destination that doesn't affect the output.
		let mute = this._muteNode = this._context.createGain();
		mute.gain.value = 0;
		mute.connect(this._context.destination);
		
		this._lowAnalyser = this._createBandAnalyser(40,250);
		this._midAnalyser = this._createBandAnalyser(250,2000);
		this._highAnalyser = this._createBandAnalyser(2000,6000);
		this._allAnalyser = this._createBandAnalyser();
	}
	
	_createBandAnalyser(low, high) {
		let bandpass, ctx = this._context, compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = -36;
		compressor.knee.value = 35;
		compressor.ratio.value = 10;
		compressor.release.value = 0;
		compressor.connect(this._muteNode);
		
		// this eliminates the initial burst:
		compressor.attack.value = 1;
		compressor.attack.linearRampToValueAtTime(0, ctx.currentTime+0.1);
		
		if (low || high) {
			let freq = Math.sqrt(low * high), q = freq / (high - low);
			bandpass = ctx.createBiquadFilter();
			bandpass.type = "bandpass";
			bandpass.Q.value = q;
			bandpass.frequency.value = freq;
			bandpass.connect(compressor);
		}
		
		this._nullNode.connect(bandpass||compressor);
		return compressor;
	}
	
	_getVal(bandObj, analyser, t, all) {
		// Safari (and some older browsers) return `reduction` as an AudioParam.
		// TODO: should we worry about 0 values? Should only ever happen with a wall of noise.
		let val = analyser.reduction.value, adj = all ? this._allAdj : this._bandAdj;
		val = (val === undefined ? analyser.reduction : val)*-adj;
		if (val > 1) {
			adj /= val;
			val = 1;
			if (all) { this._allAdj = adj; }
			else { this._bandAdj = adj; }
		}
		return (bandObj.val = val*this.gain);
	}
	
	_calculateAvgs() {
		let data = this._audioData, o=data[0], t=o.t; 
		// calculate the delta and average values:
		let deltaO = data[1], avgI=0;
		for (let i=1, l=data.length; i<l; i++) {
			let o2 = data[i], t2=o2.t;
			if (t2 >= t-this._avgT) { avgI = i; }
			if (t2 >= t-this._deltaT) { deltaO = o2; }
			if (t2 < t-this._maxT) { this._oldObj = data.pop(); l--; }
		}
		for (let key in o) {
			let band = o[key];
			if (band.val === undefined) { continue; }
			band.avg = avgI ? data.reduce((acc,val,i)=>(i>avgI?acc:acc+val[key].val),0) / avgI : 0;
			band.delta = deltaO ? band.val - deltaO[key].val : 0;
			band.trend = deltaO ? band.avg - data[avgI][key].avg : 0;
		}
	}
	
	_detectHit(o) {
		let val = o.low.val, threshold = this._hitThreshold;
		let o2 = this._audioData[1], m = o2 ? (o.t-o2.t)/16 : 1; // adjust for elapsed time.
		o.hit = false;
		if (Math.pow(val,1.3) > threshold*1.3) {
			if (!this._inHit) { o.hit = this._inHit = true; }
		} else { this._inHit = false; }
		this._hitThreshold = Math.max(0.1,val,threshold-(threshold-val)*0.15*m);
	}
	
	_initDropTarget(target) {
		if (target === undefined) { target = window; }
		if (typeof target === "string") { target = document.querySelector(target); }
		if (!target) { return; }
		target.addEventListener("drop", this._handleDrop.bind(this));
		target.addEventListener("dragenter", this._handleDragEnter.bind(this));
		target.addEventListener("dragleave", this._handleDragLeave.bind(this));
		target.addEventListener("dragover", this._handleDragOver.bind(this));
		this._updateUI("drop an MP3 to play");
	}
	
	_decode(data) {
		this._context.decodeAudioData(data, this._handleBufferDecode.bind(this));
		this._updateUI("decoding...");
	}

	// UI:
	_initUI() {
		let div = this._uiDiv = document.createElement("div");
		div.className = "jam-ui";
		let sheet = document.createElement("style");
		sheet.innerHTML = ".jam-ui{padding:0.75em;font-size:10pt;font-family:arial,sans-serif;background:#000;color:#FFF;z-index:100;position:absolute;bottom:0;left:0;}";
		document.head.insertBefore(sheet, document.head.firstChild); // dump this at the top of head so it's easy to override.
	}
	
	_updateLoadUI(p) {
		this._updateUI(Math.round(p*100)+"%");
	}
	
	_updateTimeUI() {
		if (!this._buffer) { return; }
		let str = this._formatTime(Math.min(this._buffer.duration, this._context.currentTime - this._playT));
		str += " / " + this._formatTime(this._buffer.duration);
		this._updateUI(str);
	}
	
	_formatTime(t) {
		let m = t/60|0, s=Math.round(t-m*60);
		return m+":"+(s<10?"0":"")+s;
	}
	
	_updateUI(str) {
		let div = this._uiDiv;
		div.style.display = !str ? "none" : "inline-block";
		div.innerHTML = this.label+str;
	}
	
	// event handlers:
	_handleKeyDown(evt) {
		let key = evt.key || evt.keyIdentifier; // old browsers do not support .key
		key = key.replace("Arrow", ""); // make matching easier
		
		if (key === " " || key === "U+0020") {
			this.paused = !this.paused;
		} else if (key === "Enter") {
			this._pausedT = 0;
			this.play();
		} else if (key === "Up" || key === "Down") {
			this.volume += 0.1 * (key === "Up" ? 1 : -1);
		} else if (key === "Left" || key === "Right") {
			let s = (key === "Left" ? -1 : 1) * (evt.shiftKey ? 15 : 5) * (evt.altKey ? 12 : 1);
			this.skip(s);
		}
	}
	
	_handleDragEnter(evt) {
		this._handleDragLeave(evt);
		let el = evt.currentTarget, target = el === window ? document.body : el;
		target.className += " jam-drop";
	}
	
	_handleDragLeave(evt) {
		evt.preventDefault();
		let el = evt.currentTarget, target = el === window ? document.body : el;
		target.className = target.className.replace(/\b\s?jam-drop\b/, "");
	}
	
	_handleDragOver(evt) {
		this._handleDragEnter(evt)
	}
	
	_handleDrop(evt) {
		this._handleDragLeave(evt);
		this.abort();
		let reader = new FileReader();
		reader.addEventListener('load', this._handleDropLoad.bind(this));
		reader.readAsArrayBuffer(evt.dataTransfer.files[0]);
	}
	
	_handleDropLoad(evt) {
		this._decode(evt.target.result);
	}
	
	_handleURILoad(evt) {
		this._decode(evt.target.response);
		this._request = null;
	}
	
	_handleURIProgress(evt) {
		let p = evt.loaded / evt.total;
		this.onprogress&&this.onprogress(p);
		this._updateLoadUI(p);
	}
	
	_handleBufferDecode(buffer) {
		this._buffer = buffer;
		this._pausedT = 0;
		this._playT = this._context.currentTime;
		this._updateTimeUI();
		if (!this._paused) { this.play(); }
	}
}