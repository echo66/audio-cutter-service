module.exports = function(tempDir) {

  var ffmpeg = require('fluent-ffmpeg');
  var fs = require('fs');
  var router = require('express').Router();
  var log4js = require('log4js');
  var uuid = require('node-uuid');
  var http = require('http');
  var absp = require("abs");
  var NodeCache = require("node-cache");
  require('shelljs/global');

  /*
    key: {filepath: String, download_promise: Promise }
   */
  var audioFileCache = new NodeCache( { stdTTL: 100, checkperiod: 10, useClones: false } );
  audioFileCache.on('expired', function(key, value) {
    logger.info("cache element expired");
    value.then((filepath) => rm(filepath))
  });

  var TEMP_FILES_DIR = tempDir || absp('./' + uuid.v1());
  var originDirectory = pwd();
  mkdir(TEMP_FILES_DIR);
  cd(originDirectory);


  var logger = log4js.getLogger();


  function download_file(url, directory) {
    var p = new Promise((resolve, reject) => {
      var filename = uuid.v1();
      var filepath = directory + '/' + filename;
      var file = fs.createWriteStream(filepath);
      logger.info("Downloading file from " + url);
      var request = http.get(url, function(response) {
        response.pipe(file);
        file.on('finish', function() {
          file.close(()=>resolve(filepath));
        });
      }).on('error', function(err) { 
        fs.unlink(filepath); 
        reject(err);
      });
    });
    return p;
  }

  function cut_to_pipe(filepath, format, start, duration, output) {
    ffmpeg(filepath)
        .on('error', function(err) {
              logger.error('Processing error! ' + err);
        })
        .format(format)
        .audioCodec('copy')
        .seekInput(parseFloat(start)).duration(parseFloat(duration))
        .pipe(output, { end : true });
  }

  function main(url, req, res) {
    ffmpeg.ffprobe(url, function(err, metadata) {
      if (err) {
        error(err, res);
      } else {
        res.writeHead(200, {
          'Content-Type': metadata.format.format_name,
        });
        cut_to_pipe(url, metadata.format.format_name, req.query.start, req.query.duration, res);
      }
    });
  }

  function error(err, res) {
    logger.error(err);
    res.status(500).send();
  }

  router.get ('/', function(req,res) {

    if (req.query.url == undefined || req.query.start == undefined || req.query.duration == undefined)
      res.status(500).json({ message: 'Invalid parameters.' });

    var url = req.query.url.replace(/^file:\//, '');
    var start = parseFloat(req.query.start);
    var duration = parseFloat(req.query.duration);

    logger.info('Request for segment [ %d , %d ] for file %s', start, start+duration, url);

    fs.stat(url, function(err, stat) {

      if(err == null) {
        logger.error('File exists in the local disk.');
        main(url, req, res);
      } else {
        audioFileCache.get( url, function( err, value ) {
          if(!err){
            if(value == undefined){
              var value = download_file(url, TEMP_FILES_DIR);
              audioFileCache.set(url, value);
              value.then((filepath) => {
                main(filepath, req, res);
              }).catch((err) => {
                error(err, res);
              });
            }else{
              logger.info("File is cached.");
              audioFileCache.ttl( url, 100, function( err, changed ) {
                if (!err) {
                  value.then((filepath) => {
                    main(filepath, req, res);
                  }).catch((err) => error(err, res));
                } else {
                  error(err, res)
                }
              });
            }
          } else {
            error(err, res)
          }
        });
        
      }
      
    });
             
  });

  return {
    router : router, 
    cut_to_pipe : cut_to_pipe, 
    download_file : download_file
  }
  
};