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
  cluster = require('cluster'),
  uuidv4 = require('uuid/v4'),
  azure = require('azure-storage');

// Check that workers are online
cluster.on('online', (worker) => {
  console.log(`The worker ${worker.id} responded after it was forked`);
});

// restart workers if they die
cluster.on('exit', (worker, code, signal) => {
  console.log(`worker ${worker.id} finished ${signal || code}.`);
});

cluster.setupMaster({
  exec: 'worker.js',
  silent: false
});

// Create default worker
const defaultWorker = cluster.fork();
var swaggerSpecDevelopment = require('./openapi/oav-express.json');
var swaggerSpecProduction = require('./openapi/oav-express-production.json');
const port = process.env.PORT || 8080;
const maxWorkers = 20;
const app = express();
var server;
const resultsTable = 'oavResults';
const tableService = azure.createTableService();

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
app.get('/swagger.json', (req, res) => {
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

  for (const [workerId, worker] of Object.entries(cluster.workers)) {
    worker.send(req.body);
  }

  return res.status(200).send();
});

// Create new set of models to validate against
app.post('/validations', (req, res) => {

  if (Object.keys(cluster.workers).length >= maxWorkers) {
    return res.status(429).send({ error: 'More live validations are running then the service currently supports. Try again later.' });
  }

  let durationInSeconds = Number.parseInt(req.body.duration);

  if (isNaN(durationInSeconds) || durationInSeconds > 60 * 60) {
    return res.status(400).send({ error: 'Duration is not a number or it is longer than maximum allowed value of 60 minutes.' });
  }

  const validationId = uuidv4();
  const workerEnv = {
    repoUrl: req.body.repoUrl,
    branch: req.body.branch,
    resourceProvider: req.body.resourceProvider,
    apiVersion: req.body.apiVersion,
    duration: req.body.duration,
    validationId: validationId,
  };
  const worker = cluster.fork(workerEnv);

  return res.status(200).send({ validationId: validationId });
});

// Get results for a specific validation model that was created
app.get('/validations/:validationId', (req, res) => {
  let validationId = req.params.validationId;
  console.log(`got val ${validationId}`);

  var query = new azure.TableQuery()
    .where('PartitionKey eq ?', validationId);

  tableService.queryEntities(resultsTable, query, null, (error, result, response) => {
    if (error) {
      return res.status(400).send({ error: error.message });
    }

    if (result.entries.length === 0) {
      return res.status(404).send({ error: 'No validation results exist for the specified validation Id. Please retry later.' });
    }

    let entries = result.entries;

    // Result comes in the form  {Property: {_: value; $: type}}. Transform to {Property: Value}
    let formattedResponse = entries.map(entity => {

      entity.validationId = entity['PartitionKey'];
      entity.operationId = entity['RowKey'];
      entity.validationEndtime = entity['Timestamp'];

      delete entity['.metadata'];
      delete entity['PartitionKey'];
      delete entity['RowKey'];
      delete entity['Timestamp'];

      for (let [key, value] of Object.entries(entity)) {
        if (value.hasOwnProperty('_')) {
          entity[key] = value._;
        }
      }
      return entity;
    });

    return res.status(200).send(formattedResponse);
  });
});

server = app.listen(port, () => {
  let host = server.address().address;
  let port = server.address().port;

  console.log(`oav - express app listening at http://${host}:${port}`);
  return server;
});
