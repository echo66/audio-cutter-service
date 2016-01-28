var ffmpeg = require('fluent-ffmpeg');
var fs = require('fs');
var router = require('express').Router();

router.get ('/', function(req,res) {
  
  var path = req.query.path;
  console.log(path);
  if (path == undefined)
    res.status(500);

  ffmpeg.ffprobe(path, function(err, metadata) {
    if (err) 
      res.status(500);

    res.writeHead(200, {
      'Content-Type': 'audio/mpeg',
    });
    
    ffmpeg(path)
      .on('error', function(err) {
            console.log('Processing error! ' + err);
      })
      .format(metadata.format.format_name)
      .audioCodec('copy')
      .seekInput(parseFloat(req.query.start)).duration(parseFloat(req.query.duration))
      .pipe(res, {end:true});
  });
           
});


module.export = router;