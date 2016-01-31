var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var router = require('express').Router();

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

  console.log(url);

  if (url == undefined)
    res.status(500);

  ffmpeg.ffprobe(url, function(err, metadata) {
    if (err) 
      res.status(500);

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