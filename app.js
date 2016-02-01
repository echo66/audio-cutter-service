var express = require('express');
var cors = require('cors');
var log4js = require('log4js');
var cutter = require('./audio-cutter-service.js')('./temp');

var logger = log4js.getLogger();
var app = express();
app.use(cors());
app.use('/', cutter.router);

var server = app.listen(3000, function () {
	var host = server.address().address;
	var port = server.address().port;

	logger.info('Audio cutter server listening at http://%s:%s', host, port);
});