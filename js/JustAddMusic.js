"use strict";

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

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

var JustAddMusic = function () {
	function JustAddMusic(config) {
		_classCallCheck(this, JustAddMusic);

		if (!config || typeof config === "string") {
			config = { src: config };
		}

		// public properties:
		this.gain = config.gain || 1;
		this.onstart = config.onstart;
		this.ontick = config.ontick;
		this.ondecode = config.ondecode;
		this.onended = config.onended;
		this.onprogress = config.onprogress;
		this.label = config.label || "";
		this.loop = !!config.loop;

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
		this._deltaT = config.deltaT || 50;
		this._avgT = config.avgT || 150;
		this._maxT = Math.max(this._deltaT, this._avgT);
		this._allAdj = 0.1;
		this._bandAdj = 0.1;
		this._fftData = null;
		this._fftBins = Math.max(0, Math.min(128, config.spectrumBins || 0));
		this._fftThreshold = 0.65; // ignore off high frequencies beyond this point

		// hit detection:
		this._hitThresholds = { low: 2, mid: 2, high: 2, all: 2 };

		// web audio:
		this._context = null;
		this._gainNode = null;
		this._sourceNode = null;
		this._buffer = null;
		this._muteNode = null;
		this._nullNode = null;
		this._analyserNode = null;

		// method proxies:
		this._bound_handleKeyDown = this._handleKeyDown.bind(this);

		// init:
		this._initAudio();
		this._initUI();
		this._initDropTarget(config.dropTarget);

		// setup:
		this.tickInterval = config.tickInterval;
		this.loadAudio(config.src);
		this.ui = config.ui === undefined ? true : config.ui;
		this.keyControl = config.keyControl === undefined ? true : config.keyControl;
		this.volume = config.volume === undefined ? 1 : config.volume;
	}

	// getter / setters:


	_createClass(JustAddMusic, [{
		key: "loadAudio",


		// public methods:
		// file load:
		value: function loadAudio(src) {
			this.abort();
			if (!src) {
				return;
			}
			this._updateLoadUI(0);

			var request = this._request = new XMLHttpRequest();
			request.open('GET', src, true);
			request.responseType = 'arraybuffer';
			request.addEventListener("load", this._handleURILoad.bind(this));
			request.addEventListener("progress", this._handleURIProgress.bind(this));
			request.send();
		}
	}, {
		key: "abort",
		value: function abort() {
			this._request && this._request.abort();
			this._request = null;
		}

		// playback:

	}, {
		key: "play",
		value: function play() {
			var _this = this;

			var bufferChanged = (this._sourceNode && this._sourceNode.buffer) !== this._buffer;

			var offset = this._pausedT;
			this.pause(); // disconnect the old source node.

			var source = this._sourceNode = this._context.createBufferSource();
			source.buffer = this._buffer;
			source.connect(this._nullNode);
			source.start(0, offset);
			source.addEventListener("ended", function (evt) {
				return _this._handleEnded(evt);
			});

			this._playT = this._context.currentTime - offset;
			this._paused = false;

			bufferChanged && this.onstart && this.onstart();
		}
	}, {
		key: "pause",
		value: function pause() {
			if (!this._sourceNode || this._paused) {
				return;
			}
			this._sourceNode.stop();
			this._sourceNode.disconnect();
			this._sourceNode = null;
			this._pausedT = this._context.currentTime - this._playT;
			this._paused = true;
		}
	}, {
		key: "stop",
		value: function stop() {
			this.abort();
			this.pause();
			this._pausedT = this._playT = 0;
		}
	}, {
		key: "seek",
		value: function seek(time) {
			if (!this._buffer) {
				return;
			}
			this.playT = 0;
			this._pausedT = Math.min(this._buffer.duration - 0.001, Math.max(0, time));
			if (!this._paused) {
				this.play();
			}
		}
	}, {
		key: "skip",
		value: function skip(time) {
			this.seek(this._context.currentTime - this._playT + time);
		}
	}, {
		key: "tick",
		value: function tick() {
			if (!this._sourceNode) {
				return;
			}
			this._updateTimeUI();
			if (!this.ontick && this._tickIntervalID) {
				return;
			}
			!this._allAnalyser && this._initAnalyser();

			var o = this._oldObj || { low: {}, mid: {}, high: {}, all: {} },
			    data = this._audioData;
			this._oldObj = null;
			data.unshift(o);

			var t = o.t = this._context.currentTime * 1000;
			this._getVal(o.all, this._allAnalyser, t, true);
			this._getVal(o.low, this._lowAnalyser, t);
			this._getVal(o.mid, this._midAnalyser, t);
			this._getVal(o.high, this._highAnalyser, t);

			this._calculate();
			this._calculateSpectrum(o);

			this.ontick && this.ontick(o);
			return o;
		}
	}, {
		key: "toString",
		value: function toString() {
			return "[JustAddMusic]";
		}

		// private methods:

	}, {
		key: "_initAudio",
		value: function _initAudio() {
			var ctx = this._context = new (window.AudioContext || window.webkitAudioContext)();
			this._gainNode = ctx.createGain();
			this._gainNode.connect(ctx.destination);

			// analysers all connect to nullNode, so they don't have to be reconnected when the sourceNode changes:
			this._nullNode = ctx.createGain();
			this._nullNode.connect(this._gainNode);
		}
	}, {
		key: "_initAnalyser",
		value: function _initAnalyser() {
			if (this._muteNode) {
				return;
			}
			this._audioData = [];

			// audio nodes need to be tied into a destination to work.
			// this gives us a destination that doesn't affect the output.
			var ctx = this._context,
			    mute = this._muteNode = ctx.createGain();
			mute.gain.value = 0;
			mute.connect(ctx.destination);

			this._lowAnalyser = this._createBandAnalyser(40, 250);
			this._midAnalyser = this._createBandAnalyser(250, 2000);
			this._highAnalyser = this._createBandAnalyser(2000, 6000);
			this._allAnalyser = this._createBandAnalyser();

			// spectrum analyser:
			if (this._fftBins) {
				var analyser = this._analyserNode = ctx.createAnalyser();
				analyser.fftSize = 512;
				analyser.maxDecibels = -15;
				this._fftData = new Uint8Array(analyser.frequencyBinCount);
				this._nullNode.connect(analyser);
			}
		}
	}, {
		key: "_createBandAnalyser",
		value: function _createBandAnalyser(low, high) {
			var bandpass = void 0,
			    ctx = this._context,
			    compressor = ctx.createDynamicsCompressor();
			compressor.threshold.value = -36;
			compressor.knee.value = 35;
			compressor.ratio.value = 10;
			compressor.release.value = 0;
			compressor.connect(this._muteNode);

			// this eliminates the initial burst:
			compressor.attack.value = 1;
			compressor.attack.linearRampToValueAtTime(0, ctx.currentTime + 0.1);

			if (low || high) {
				var freq = Math.sqrt(low * high),
				    q = freq / (high - low);
				bandpass = ctx.createBiquadFilter();
				bandpass.type = "bandpass";
				bandpass.Q.value = q;
				bandpass.frequency.value = freq;
				bandpass.connect(compressor);
			}

			this._nullNode.connect(bandpass || compressor);
			return compressor;
		}
	}, {
		key: "_getVal",
		value: function _getVal(bandObj, analyser, t, all) {
			// Safari (and some older browsers) return `reduction` as an AudioParam.
			var val = analyser.reduction.value,
			    adj = all ? this._allAdj : this._bandAdj;
			val = (val === undefined ? analyser.reduction : val) * -adj;
			if (val > 1) {
				adj /= val;
				val = 1;
				if (all) {
					this._allAdj = adj;
				} else {
					this._bandAdj = adj;
				}
			}
			return bandObj.val = val * this.gain;
		}
	}, {
		key: "_calculate",
		value: function _calculate() {
			var data = this._audioData,
			    o = data[0],
			    t = o.t,
			    thresholds = this._hitThresholds;
			// calculate the delta and average values:
			var prevO = data[1],
			    deltaO = prevO,
			    avgI = 0;
			for (var i = 1, l = data.length; i < l; i++) {
				var o2 = data[i],
				    t2 = o2.t;
				if (t2 >= t - this._avgT) {
					avgI = i;
				}
				if (t2 >= t - this._deltaT) {
					deltaO = o2;
				}
				if (t2 < t - this._maxT) {
					this._oldObj = data.pop();l--;
				}
			}

			var _loop = function _loop(key) {
				var band = o[key],
				    val = band.val;
				if (val === undefined) {
					return "continue";
				}
				band.avg = avgI ? data.reduce(function (acc, val, i) {
					return i > avgI ? acc : acc + val[key].val;
				}, 0) / avgI : 0;
				band.delta = deltaO ? val - deltaO[key].val : 0;
				band.trend = deltaO ? band.avg - data[avgI][key].avg : 0;

				// detect a hit:
				var threshold = thresholds[key],
				    m = prevO ? (t - prevO.t) / 16 : 1;
				band.hit = false;
				if (prevO && !prevO[key].hit && Math.pow(val, 1.3) > threshold * 1.3) {
					band.hit = true;
				}
				thresholds[key] = Math.max(0.1, val, threshold - (threshold - val) * 0.15 * m);
			};

			for (var key in o) {
				var _ret = _loop(key);

				if (_ret === "continue") continue;
			}
		}
	}, {
		key: "_calculateSpectrum",
		value: function _calculateSpectrum(o) {
			if (!this._fftBins) {
				return;
			}
			var l = this._fftBins,
			    arr = [],
			    j = 0,
			    fft = this._fftData,
			    m = this._fftThreshold;
			var analyser = this._analyserNode,
			    c = analyser.frequencyBinCount;

			analyser.getByteFrequencyData(fft);
			for (var i = 0; i < l; i++) {
				var sum = 0,
				    max = (i + 1) / l * c * m,
				    j0 = j;
				while (j < max) {
					sum += fft[j++];
				}
				arr[i] = sum / 255 / (j - j0);
			}
			o.spectrum = arr;
		}
	}, {
		key: "_initDropTarget",
		value: function _initDropTarget(target) {
			if (target === undefined) {
				target = window;
			}
			if (typeof target === "string") {
				target = document.querySelector(target);
			}
			if (!target) {
				return;
			}
			target.addEventListener("drop", this._handleDrop.bind(this));
			target.addEventListener("dragenter", this._handleDragEnter.bind(this));
			target.addEventListener("dragleave", this._handleDragLeave.bind(this));
			target.addEventListener("dragover", this._handleDragOver.bind(this));
			this._updateUI("drop an MP3 to play");
		}
	}, {
		key: "_decode",
		value: function _decode(data) {
			this._context.decodeAudioData(data, this._handleBufferDecode.bind(this));
			this._updateUI("decoding...");
		}

		// UI:

	}, {
		key: "_initUI",
		value: function _initUI() {
			var div = this._uiDiv = document.createElement("div");
			div.className = "jam-ui";
			var sheet = document.createElement("style");
			sheet.innerHTML = ".jam-ui{padding:0.75em;font-size:10pt;font-family:arial,sans-serif;background:#000;color:#FFF;z-index:100;position:absolute;bottom:0;left:0;}";
			document.head.insertBefore(sheet, document.head.firstChild); // dump this at the top of head so it's easy to override.
		}
	}, {
		key: "_updateLoadUI",
		value: function _updateLoadUI(p) {
			this._updateUI(Math.round(p * 100) + "%");
		}
	}, {
		key: "_updateTimeUI",
		value: function _updateTimeUI() {
			if (!this._buffer) {
				return;
			}
			var str = this._formatTime(Math.min(this._buffer.duration, this._context.currentTime - this._playT));
			str += " / " + this._formatTime(this._buffer.duration);
			this._updateUI(str);
		}
	}, {
		key: "_formatTime",
		value: function _formatTime(t) {
			var m = t / 60 | 0,
			    s = t - m * 60 | 0;
			return m + ":" + (s < 10 ? "0" : "") + s;
		}
	}, {
		key: "_updateUI",
		value: function _updateUI(str) {
			var div = this._uiDiv;
			div.style.display = !str ? "none" : "inline-block";
			div.innerHTML = this.label + str;
		}

		// event handlers:

	}, {
		key: "_handleKeyDown",
		value: function _handleKeyDown(evt) {
			var key = evt.key || evt.keyIdentifier; // old browsers do not support .key
			key = key.replace("Arrow", ""); // make matching easier

			if (key === " " || key === "U+0020") {
				this.paused = !this.paused;
			} else if (key === "Enter") {
				this._pausedT = 0;
				this.play();
			} else if (key === "Up" || key === "Down") {
				this.volume += 0.1 * (key === "Up" ? 1 : -1);
			} else if (key === "Left" || key === "Right") {
				var s = (key === "Left" ? -1 : 1) * (evt.shiftKey ? 15 : 5) * (evt.altKey ? 12 : 1);
				this.skip(s);
			}
		}
	}, {
		key: "_handleEnded",
		value: function _handleEnded(evt) {
			if (this.loop) {
				this.seek(0);
			} else if (this.onended) {
				this.onended();
			}
		}
	}, {
		key: "_handleDragEnter",
		value: function _handleDragEnter(evt) {
			this._handleDragLeave(evt);
			var el = evt.currentTarget,
			    target = el === window ? document.body : el;
			target.className += " jam-drop";
		}
	}, {
		key: "_handleDragLeave",
		value: function _handleDragLeave(evt) {
			evt.preventDefault();
			var el = evt.currentTarget,
			    target = el === window ? document.body : el;
			target.className = target.className.replace(/\b\s?jam-drop\b/, "");
		}
	}, {
		key: "_handleDragOver",
		value: function _handleDragOver(evt) {
			this._handleDragEnter(evt);
		}
	}, {
		key: "_handleDrop",
		value: function _handleDrop(evt) {
			this._handleDragLeave(evt);
			this.abort();
			var reader = new FileReader();
			reader.addEventListener('load', this._handleDropLoad.bind(this));
			reader.readAsArrayBuffer(evt.dataTransfer.files[0]);
		}
	}, {
		key: "_handleDropLoad",
		value: function _handleDropLoad(evt) {
			this._decode(evt.target.result);
		}
	}, {
		key: "_handleURILoad",
		value: function _handleURILoad(evt) {
			this._decode(evt.target.response);
			this._request = null;
		}
	}, {
		key: "_handleURIProgress",
		value: function _handleURIProgress(evt) {
			var p = evt.loaded / evt.total;
			this.onprogress && this.onprogress(p);
			this._updateLoadUI(p);
		}
	}, {
		key: "_handleBufferDecode",
		value: function _handleBufferDecode(buffer) {
			this._buffer = buffer;
			this._pausedT = 0;
			this._playT = this._context.currentTime;
			this.ondecode && this.ondecode(buffer);
			this._updateTimeUI();
			if (!this._paused) {
				this.play();
			}
		}
	}, {
		key: "paused",
		get: function get() {
			return this._paused;
		},
		set: function set(val) {
			if (!val === this._paused) {
				!val ? this.play() : this.pause();
			}
		}
	}, {
		key: "keyControl",
		get: function get() {
			return this._keyControl;
		},
		set: function set(val) {
			val = !!val;
			if (this._keyControl === val) {
				return;
			}
			this._keyControl = val;
			if (val) {
				document.addEventListener("keydown", this._bound_handleKeyDown);
			} else {
				document.removeEventListener("keydown", this._bound_handleKeyDown);
			}
		}
	}, {
		key: "tickInterval",
		get: function get() {
			return this._tickInterval;
		},
		set: function set() {
			var val = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : 16;

			clearInterval(this._tickIntervalID);
			this._tickIntervalID = val > 0 ? setInterval(this.tick.bind(this), val) : 0;
		}
	}, {
		key: "volume",
		get: function get() {
			return this._gainNode.gain.value;
		},
		set: function set(val) {
			this._gainNode.gain.value = Math.max(0, Math.min(2, val));
		}
	}, {
		key: "ui",
		get: function get() {
			return this._ui;
		},
		set: function set(val) {
			val = !!val;
			if (this._ui === val) {
				return;
			}
			this._ui = val;
			var div = this._uiDiv;
			if (val) {
				document.body.appendChild(div);
			} else {
				div.parentNode.removeChild(div);
			}
		}
	}, {
		key: "audioData",
		get: function get() {
			return this._audioData && this._audioData[0] || JustAddMusic.DEFAULT_AUDIO_DATA;
		}
	}]);

	return JustAddMusic;
}();

JustAddMusic.DEFAULT_FREQUENCY_RANGE = { val: 0, avg: 0, delta: 0, trend: 0, hit: false };
JustAddMusic.DEFAULT_AUDIO_DATA = {
	t: 0, spectrum: [],
	low: JustAddMusic.DEFAULT_FREQUENCY_RANGE,
	mid: JustAddMusic.DEFAULT_FREQUENCY_RANGE,
	high: JustAddMusic.DEFAULT_FREQUENCY_RANGE,
	all: JustAddMusic.DEFAULT_FREQUENCY_RANGE
};