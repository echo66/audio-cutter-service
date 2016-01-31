var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var router = require('express').Router();
var log4js = require('log4js');

var logger = log4js.getLogger();


function cut_to_pipe(filepath, format, start, duration, output) {
  ffmpeg(filepath)
      .on('error', function(err) {
            console.log('Processing error! ' + err);
      })
      .format(format)
      .audioCodec('copy')
      .seekInput(parseFloat(start)).duration(parseFloat(duration))
      .pipe(output, { end : true });


}

router.get ('/', function(req,res) {
  
  var url = req.query.url;

  if (url == undefined)
    res.status(500);

  logger.info("Requesting file at " + url);

  ffmpeg.ffprobe(url, function(err, metadata) {
    if (err) {
      logger.error("Error while requesting file at " + url);
      console.log(err);
      res.status(500).send();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
    });

    cut_to_pipe(url, metadata.format.format_name, req.query.start, req.query.duration, res);

  });
           
});


module.exports = {
  router : router, 
  cut_to_pipe : cut_to_pipe
};