/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */

'use strict';

const path = require('path'),
  oav = require('oav'),
  express = require('express'),
  bodyParser = require('body-parser'),
  multer = require('multer'),
  appInsights = require('applicationinsights'),
  cluster = require('cluster');

if (cluster.isMaster) {
  masterHandler();
} else {
  console.log("never get here");
}

function masterHandler() {
  let workers = {};

  let numWorkers = 1;
  console.log(`Master cluster setting up ${numWorkers} workers...`);

  // Check that workers are online
  cluster.on('online', (worker) => {
    console.log(`The worker ${worker.id} responded after it was forked`);
  });

  // restart workers if they die
  cluster.on('exit', (worker, code, signal) => {
    console.log(`worker ${worker.id} died ${signal || code}.`);
    delete workers[worker.id];
    console.log(JSON.stringify(Object.keys(workers)));
  });

  cluster.setupMaster({
    exec: 'worker.js',
    silent: false
  });

  // Create workers
  for (var i = 0; i < numWorkers; i++) {
    const worker = cluster.fork();
    workers[worker.id] = worker;
  }

  let start = Date.now();
  var swaggerSpecDevelopment = require('./openapi/oav-express.json');
  var swaggerSpecProduction = require('./openapi/oav-express-production.json');
  const ErrorCodes = oav.Constants.ErrorCodes;
  const port = process.env.PORT || 8080;
  const app = express();
  var server;

  //App Insights instrumentation key is passed via APPINSIGHTS_INSTRUMENTATIONKEY env variable
  appInsights.setup()
    .setAutoDependencyCorrelation(true)
    .setAutoCollectRequests(true)
    .setAutoCollectPerformance(true)
    .setAutoCollectExceptions(true)
    .setAutoCollectDependencies(true)
    .setAutoCollectConsole(true)
    .setUseDiskRetryCaching(true)
    .start();

  //view engine setup
  app.set('views', path.join(__dirname, 'views'));
  app.set('view engine', 'pug');

  app.use(bodyParser.json()); // for parsing application/json
  app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/', (req, res) => {
    res.send('Welcome to oav-express');
  });

  // serve swagger
  app.get('/swagger.json', function (req, res) {
    res.setHeader('Content-Type', 'application/json');
    let host;
    if (server && server.address() && server.address().address) {
      host = server.address().address;
    }
    if (host && (host === '::' || host === 'localhost')) {
      res.send(swaggerSpecDevelopment);
    } else {
      res.send(swaggerSpecProduction);
    }
  });

  // This responds a POST request for live validation
  app.post('/validate', (req, res) => {

    for (const workerId in cluster.workers) {
      cluster.workers[workerId].send(req.body);
    }

    return res.status(200).send();
  });

  app.post('/createValidation', (req, res) => {

    const worker = cluster.fork(req.body);
    workers[worker.id] = worker;
    console.log("Returning status");
    return res.status(200).send();
  });

  app.post('/getValidation', (req, res) => {

    return res.status(200).send();
  });

  console.log('Initializing the validator takes about 30 seconds. Please be patient :-).');

  server = app.listen(port, () => {
    let host = server.address().address;
    let port = server.address().port;

    console.log(`oav - express app listening at http://${host}:${port}`);
    return server;
  });

  let duration = Date.now() - start;
  appInsights.defaultClient.trackMetric({ name: "server startup time", value: duration });
}

