# JustAddMusic

JustAddMusic (aka JAM) makes it simple to add music and music visualization to your web experiences.

* load audio files, or drag and drop from local file system
* keyboard control for volume, seeking, play/pause
* simple UI to display load status and playback time
* robust audio analysis for music visualization
* enable with a single line of code
* api for custom UI / controls
* only ~3kb over the wire

Tested in recent versions of Chrome, Edge, Safari, and FireFox.


## Simple Example

This example will load the specified audio file and play it, display load / playback status, enable keyboard control
and allow the user to drag their own audio files onto the window to play them.

```javascript
var jam = new JustAddMusic("myMusic.mp3");
```

## Music Visualization Example

This example will play the music, and react to its averaged volume by changing the background color of the document.

```javascript
new JustAddMusic({
	src: "myMusic.mp3",
	ontick: function(o) {
		var l = Math.round(o.all.avg * 100);
		document.body.style.background = "hsl(90,100%,"+l+"%)";
	}
});
```

You can view a live example of this on [CodePen](https://codepen.io/gskinner/pen/EmgQyO).


## Constructor

```javascript
new JustAddMusic(config);
```

The optional config parameter can be either a string URI pointing to an audio file, or an object with any of the following
initialization properties:

* `src`: uri of audio file to load initially
* `dropTarget=window`: query selector or HTMLElement to use as a drag & drop target
* `mode=0`: one of JustAddMusic.PEAK / RMS / AVERAGE
* `deltaT=50`: time in ms used to calculate the delta value
* `avgT=150`: time in ms used to calculate the avg value

The config object can also include any of the properties listed below.


## Properties

These properties can be set using the config param, or directly on a JAM instance.

* `gain=1`: boosts volume for the analyser only (not playback volume)
* `onstart`: called when audio starts playing
* `ontick`: called each time the analyser ticks with the latest audio data
* `onprogress`: called with a single param indicating file load progress as 0-1
* `label`: text or html to inject before other content in the UI
* `paused=false`: play / pause audio
* `keyControl=true`: enable key control (see below)
* `tickInterval=16`: interval in ms to tick analyser on or 0 to tick manually via `tick()`
* `volume=1`: playback volume, does affect analyser
* `ui=true`: show / hide simple ui (true)
* `audioData`: Read-only. Object with latest audio data (see Audio Data below)


## Methods

* `loadAudio(src)`: loads specified audio file and plays it if `paused` is false
* `abort()`: aborts an active load
* `play()`: resumes playback
* `pause()`: pauses playback
* `stop()`: pauses playback, resets playback to start, and aborts active load
* `skip(time)`: skips forward or back by the specified time in seconds
* `tick()`: runs the analyser and returns the latest audio data (see below). Called automatically if tickInterval > 0.


## Audio Data
Audio data objects have the following properties:

* `t`: a timestamp
* `hit`: true if a hit (significant jump in bass) was detected
* `low`, `mid`, `high`, `all`: object containing values for a frequency range

Each of the frequency range objects have the following properties:

* `val`: the instantaneous value of the range
* `avg`: the average value over `avgT` milliseconds
* `delta`: the change in value over `deltaT` milliseconds
* `trend`: the change in the `avg` value over `avgT` milliseconds

Note that Chrome seems to calculate these differently than other browsers, which results in lower values. You could use
`gain` to adjust for this.


## Keyboard Control

If `keyControl` is enabled, the following keys can be used to control playback:

* space - play / pause
* enter - play from start
* up / down arrow - volume
* left / right arrow - skip 5s (15s if shift is held, 60s if alt, 180s if both)


## Styles

The UI div is styled via the `.jam-ui` class. Its default styles are injected in a style block at the top of the head.

When the user drags a file over the `dropTarget`, the `.jam-drop` class is added to it to allow easy styling.

## License

JustAddMusic.js is copyright [gskinner.com](http://gskinner.com). Licensed under the MIT license.

Music by [bensound.com](http://www.bensound.com).