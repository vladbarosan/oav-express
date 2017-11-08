/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */

'use strict';

const cluster = require('cluster'),
  oav = require('oav'),
  appInsights = require('applicationinsights'),
  path = require('path'),
  os = require('os'),
  url = require('url'),
  uuidv4 = require('uuid/v4'),
  glob = require('glob'),
  azure = require("azure-storage");

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


const tableService = azure.createTableService();
const resultsTable = "oavResults";
tableService.createTableIfNotExists(resultsTable, function (error, result, response) {
  if (!error) {
  }
});

const operationValidationResults = {}

let totalSuccessRequestCount = 0;
let totalSuccessResponseCount = 0;
let totalSuccessCount = 0;
let totalOperationCount = 0;
let validationModelId = process.env.validationModelId;

console.log(`validationModelId is ${validationModelId}`)

const liveValidatorOptions = {
  git: {
    shouldClone: true,
    url: 'https://github.com/vladbarosan/sample-openapi-specs',
  },
  directory: path.resolve(os.homedir(), `repo/${cluster.worker.id}`)
};

if (process.env.validationModelId === undefined) {
  validationModelId = uuidv4();
}

if (process.env.repoUrl !== undefined) {
  console.log(`My repo url is: ${process.env.repoUrl}`)
  liveValidatorOptions.git.url = process.env.repoUrl;
}

if (process.env.branch !== undefined) {
  liveValidatorOptions.git.branch = process.env.branch;
}

if (process.env.resourceProvider !== undefined && process.env.apiVersion) {
  let validationJsonsPattern = `/specification/**/${process.env.resourceProvider}/${process.env.apiVersion}/**/*.json`;

  console.log(`paths are ${JSON.stringify(validationJsonsPattern)}`);

  liveValidatorOptions.swaggerPathsPattern = validationJsonsPattern;
}

const validator = new oav.LiveValidator(liveValidatorOptions);

validator.initialize().then(() => {
  console.log(`Live validator initialized for session ${validationModelId}`);


  let durationInSeconds = Number.parseInt(process.env.duration);

  console.log('setting timeout for worker to be  ' + process.env.duration + 'parsed is ' + durationInSeconds);

  if (!isNaN(durationInSeconds)) {
    console.log('setting timeout for worker to be  ' + durationInSeconds);
    setTimeout(() => {
      console.log("Exiting")
      uploadValidationResults();
      cluster.worker.disconnect();
    }, 1000 * durationInSeconds);
  }
});

function getProvider(path) {
  if (path === null || path === undefined || typeof path.valueOf() !== 'string' || !path.trim().length) {
    throw new Error('path is a required parameter of type string and it cannot be an empty string.');
  }

  let providerRegEx = new RegExp('/providers/(\:?[^{/]+)', 'gi');
  let result;
  let pathMatch;

  while ((pathMatch = providerRegEx.exec(path)) != null) {
    result = pathMatch[1];
  }

  return result;
}

function validateHandler(requestBody) {

  let parsedUrl = url.parse(requestBody.liveRequest.url, true);
  let path = parsedUrl.pathname;

  // Lower all the keys of query parameters before searching for `api-version`
  console.log(`parsed url is ${JSON.stringify(parsedUrl.query)}`);

  let apiVersion = parsedUrl.query['api-version'];
  let resourceProvider = getProvider(path);

  if (resourceProvider !== process.env.resourceProvider) {
    console.log(`received request  is ${resourceProvider} is different from worker resource Provider ${process.env.resourceProvider} `);
    return;
  }

  if (apiVersion !== process.env.apiVersion) {
    console.log(`received request api version is ${apiVersion} is different from worker resource apiVersion ${process.env.apiVersion} `);
    return;
  }

  let validationResult = validator.validateLiveRequestResponse(requestBody);

  if (process.env.resourceProvider !== undefined) {
    updateStats(validationResult);
  }
  console.log(JSON.stringify(validationResult));
}

function uploadValidationResults() {
  console.log(JSON.stringify(operationValidationResults));

  const entGen = azure.TableUtilities.entityGenerator;

  const resultsEntity = {
    PartitionKey: entGen.String(validationModelId),
    RowKey: entGen.String("total"),
    ResourceProvider: entGen.String(process.env.resourceProvider),
    ApiVersion: entGen.String(process.env.apiVersion),
    ModelSourceRepo: entGen.String(process.env.repoUrl),
    ModelSourceBranch: entGen.String(process.env.branch),
    Operations: entGen.Int32(totalOperationCount),
    SuccessOperations: entGen.Int32(totalSuccessCount),
    SuccessRate: entGen.Double((100 * (totalSuccessCount / totalOperationCount)).toPrecision(3)),
    SuccessRequests: entGen.Int32(totalSuccessRequestCount),
    SuccessResponses: entGen.Int32(totalSuccessResponseCount)
  };

  tableService.insertEntity(resultsTable, resultsEntity, function (error, result, response) {
    if (!error) {
      // result contains the ETag for the new entity
    }
  });

  for (const [operationId, operationResults] of Object.entries(operationValidationResults)) {
    const resultsEntity = {
      PartitionKey: entGen.String(validationModelId),
      RowKey: entGen.String(operationId),
      ResourceProvider: entGen.String(process.env.resourceProvider),
      ApiVersion: entGen.String(process.env.apiVersion),
      ModelSourceRepo: entGen.String(process.env.repoUrl),
      ModelSourceBranch: entGen.String(process.env.branch),
      Operations: entGen.Int32(operationResults.operationCount),
      SuccessOperations: entGen.Int32(operationResults.successCount),
      SuccessRate: entGen.Double((100 * (operationResults.successCount / operationResults.operationCount)).toPrecision(3)),
      SuccessRequests: entGen.Int32(operationResults.successRequestCount),
      SuccessResponses: entGen.Int32(operationResults.successResponseCount)
    };

    tableService.insertEntity(resultsTable, resultsEntity, function (error, result, response) {
      if (!error) {
        // result contains the ETag for the new entity
      }
    });
  }
}

function updateStats(validationResult) {

  let operationId = validationResult.requestValidationResult.operationInfo[0].operationId;
  ++totalOperationCount;

  if (!operationValidationResults[operationId]) {
    operationValidationResults[operationId] = {
      operationCount: 0,
      successCount: 0,
      successRequestCount: 0,
      successResponseCount: 0
    }
  }

  ++operationValidationResults[operationId].operationCount;

  if (validationResult.requestValidationResult.successfulRequest === true) {
    ++totalSuccessRequestCount;
    ++operationValidationResults[operationId].successRequestCount;
  }

  if (validationResult.responseValidationResult.successfulResponse === true) {
    ++totalSuccessResponseCount;
    ++operationValidationResults[operationId].successResponseCount;
  }

  const isOperationSuccessful = validationResult.requestValidationResult.successfulRequest && validationResult.responseValidationResult.successfulResponse;

  if (isOperationSuccessful) {
    ++totalSuccessCount;
    ++operationValidationResults[operationId].successCount;
  }
}

cluster.worker.on("message", validateHandler);
