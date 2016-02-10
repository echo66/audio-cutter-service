module.exports = function(tempDir, fileSizeLimit) {

  var ffmpeg = require('fluent-ffmpeg');
  var fs = require('fs');
  var router = require('express').Router();
  var log4js = require('log4js');
  var uuid = require('node-uuid');
  var http = require('http');
  var absp = require("abs");
  var wget = require("./my-wget.js");
  var remoteFileSize = require('remote-file-size');
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
  var audioInfo = new Map();

  var TEMP_FILES_DIR = tempDir || absp('./' + uuid.v1());
  var FILESIZE_LIMIT = fileSizeLimit || 30;
  var originDirectory = pwd();
  mkdir(TEMP_FILES_DIR);
  cd(originDirectory);


  var logger = log4js.getLogger();


  function download_file(url, directory) {
    var p = new Promise((resolve, reject) => {
      var filename = uuid.v1();
      var filepath = directory + '/' + filename;
      var download = wget.download(url, filepath, {fileSizeLimit: FILESIZE_LIMIT});
      download.on('error', function(err) {
        reject(err);
      });
      download.on('start', function(fileSize) {
        logger.info("Downloading file " + url);
      });
      download.on('end', function(output) {
        logger.info("Downloaded file " + url);
        logger.info("Obtaining file metdata for url " + url);
        ffmpeg.ffprobe(filepath, function(err, metadata) {
          if (err) {
            reject(err);
          } else {
            logger.info("Obtained file metdata for url " + url);
            audioInfo.set(url, metadata);
            resolve(filepath);
          }
        });
      });
      download.on('progress', function(progress) {});
      
    });
    return p;
  }

  function cut_to_pipe(filepath, format, start, duration, output) {
    logger.info('Cutting segment');
    ffmpeg(filepath)
        .on('error', function(err) {
              logger.error('Processing error! ' + err);
              output.writeHead(500);
        })
        .format(format)
        .audioCodec('copy')
        .seekInput(parseFloat(start)).duration(parseFloat(duration))
        .pipe(output, { end : true });
  }

  function main(filepath, url, req, res) {
    console.log([filepath, url]);
    metadata = audioInfo.get(url);
    res.writeHead(200, {
      'Content-Type': metadata.format.format_name,
    });
    cut_to_pipe(filepath, metadata.format.format_name, req.query.start, req.query.duration, res);
  }

  function error(err, res) {
    logger.error(err);
    res.status(500).send();
  }


  function aux(p, url, req, res) {
    p.then((filepath) => {
      main(filepath, url, req, res);
    }).catch((err) => error(err, res));
  }


  router.get('/url_info', (req, res) => {
    /*
     {
      numberOfChannels: Number, 
      duration: Number,
      sampleRate: Number, 
      numberOfSamples: Number, 
      format: String
     }
     */
      var url = req.query.url;
      audioFileCache.get( url, ( err, promise ) => {
      if(!err){
        if(promise == undefined){
          promise = download_file(url, TEMP_FILES_DIR);
          audioFileCache.set(url, promise);
        }else{
          logger.info("File is cached.");
        }
        promise.then((filepath) => {
          var metadata = audioInfo.get(url);
          var obj = {};
          for (var s=0; s<metadata.streams.length; s++) {
            var stream = metadata.streams[s];
            if (stream.codec_type=='audio') {
              obj.numberOfChannels = stream.channels;
              obj.duration = stream.duration;
              obj.sampleRate = stream.sample_rate;
              obj.numberOfSamples = Math.round(obj.sampleRate * obj.duration);
              obj.format = metadata.format.format_name;
              break;
            }
          }
          res.json(obj);
        }).catch((err) => error(err, res));
      } else {
        error(err, res);
      }
     });
  })

  router.get('/cache_info', (req, res) => {
    // TODO
  });

  router.post('/defs', (req, res) => {
    // TODO: allows the change for FILESIZE_LIMIT, SAMPLERATES_ACCEPTED, ...
  });


  router.get('/', (req, res) => {

    if (req.query.url == undefined || req.query.start == undefined || req.query.duration == undefined)
      res.status(500).json({ message: 'Invalid parameters.' });

    var url = req.query.url.replace(/^file:\//, '');
    var start = parseFloat(req.query.start);
    var duration = parseFloat(req.query.duration);

    logger.info('Request for segment [ %d , %d ] for file %s', start, start+duration, url);

    fs.stat(url, function(err, stat) {

      if(err == null) {
        logger.error('File exists in the local disk.');
        main(url, url, req, res);
      } else {
        audioFileCache.get( url, function( err, promise ) {
          if(!err){
            if(promise == undefined){
              promise = download_file(url, TEMP_FILES_DIR);
              audioFileCache.set(url, promise);
            }else{
              logger.info("File is cached.");
            }
            audioFileCache.ttl( url, 100, function( err, changed ) {
              if (!err) {
                aux(promise, url, req, res);
              } else {
                error(err, res)
              }
            });
          } else {
            error(err, res);
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