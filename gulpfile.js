var gulp = require("gulp");
var babel = require("gulp-babel");
var minify = require("gulp-minify");

gulp.task("default", ["build", "watch"]);

gulp.task("build", function() {
	return 	gulp.src("es6/**/*.js")
		.pipe(babel())
		.on("error", swallowError)
		.pipe(minify({ext:{min:".min.js"}}))
		.pipe(gulp.dest("js"));
});

gulp.task("watch", function() {
	gulp.watch("es6/**/*.js", ["build"]);
});

function swallowError(err) {
	console.warn(err.toString());
	this.emit("end");
}