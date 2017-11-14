/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */

'use strict';

const oav = require('oav'),
  appInsights = require('applicationinsights'),
  path = require('path'),
  os = require('os'),
  url = require('url'),
  uuidv4 = require('uuid/v4'),
  azure = require("azure-storage");

const resultsTable = "oavResults";

/**
 *
 */
class ValidationWorker {
  constructor(validationId, validatorOptions, durationInSeconds, resourceProvider, apiVersion, cluster) {

    this.operationValidationResults = {};

    this.totalSuccessRequestCount = 0;
    this.totalSuccessResponseCount = 0;
    this.totalSuccessCount = 0;
    this.totalOperationCount = 0;
    this.validator = new oav.LiveValidator(validatorOptions);
    this.cluster = cluster;
    this.resourceProvider = resourceProvider;
    this.apiVersion = apiVersion;

    if (validationId === undefined) {
      this.validationId = "default";
    } else {
      this.validationId = validationId;
    }

    this.durationInSeconds = durationInSeconds;

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

    this.tableService = azure.createTableService();

    this.tableService.createTableIfNotExists(resultsTable, function (error, result, response) {
      if (!error) {
      }
    });
  }

  /**
   *
   */
  start() {
    let self = this;
    self.validator.initialize().then(() => {
      console.log(`Live validator initialized for session ${self.validationId}`);

      const workerShutdownGracePeriodInMs = 3000;

      console.log('setting timeout for worker to be  ' + self.durationInSeconds);

      if (!isNaN(self.durationInSeconds)) {
        console.log('setting timeout for worker to be  ' + self.durationInSeconds);
        setTimeout(() => {
          self.uploadValidationResults();
          console.log("getting ready to disconnect");
          appInsights.defaultClient.flush();
          self.cluster.worker.disconnect();
          setTimeout(() => {
            self.cluster.worker.kill();
          }, workerShutdownGracePeriodInMs);

        }, 1000 * self.durationInSeconds);
      }

      self.cluster.worker.on("message", (msg) => {
        self.validate(msg);
      });
    });
  }

  /**
   *
   * @param {*} requestBody
   */
  validate(requestBody) {

    let parsedUrl = url.parse(requestBody.liveRequest.url, true);
    let path = parsedUrl.pathname;

    // Lower all the keys of query parameters before searching for `api-version`
    console.log(`parsed url is ${JSON.stringify(parsedUrl.query)}`);

    let apiVersion = parsedUrl.query['api-version'];
    let resourceProvider = this.getProvider(path);

    if (resourceProvider !== this.resourceProvider) {
      console.log(`received request  is '${resourceProvider}' is different from worker resource Provider '${this.resourceProvider}' `);
      return;
    }

    if (apiVersion !== this.apiVersion) {
      console.log(`received request api version is '${apiVersion}' is different from worker resource apiVersion '${this.apiVersion}' `);
      return;
    }

    let validationResult = this.validator.validateLiveRequestResponse(requestBody);

    if (this.resourceProvider !== undefined) {
      this.updateStats(validationResult);
    }

    console.log(JSON.stringify(validationResult));
  }

  /**
   *
   * @param {*} validationResult
   */
  updateStats(validationResult) {

    let operationId = validationResult.requestValidationResult.operationInfo[0].operationId;
    let logSeverity = 3;
    ++this.totalOperationCount;

    if (!this.operationValidationResults[operationId]) {
      this.operationValidationResults[operationId] = {
        operationCount: 0,
        successCount: 0,
        successRequestCount: 0,
        successResponseCount: 0
      }
    }

    ++this.operationValidationResults[operationId].operationCount;

    if (validationResult.requestValidationResult.successfulRequest === true) {
      ++this.totalSuccessRequestCount;
      ++this.operationValidationResults[operationId].successRequestCount;
    }

    if (validationResult.responseValidationResult.successfulResponse === true) {
      ++this.totalSuccessResponseCount;
      ++this.operationValidationResults[operationId].successResponseCount;
    }

    const isOperationSuccessful = validationResult.requestValidationResult.successfulRequest && validationResult.responseValidationResult.successfulResponse;

    if (isOperationSuccessful) {
      ++this.totalSuccessCount;
      ++this.operationValidationResults[operationId].successCount;
      logSeverity = 4;
    }

    appInsights.defaultClient.trackTrace({
      message: JSON.stringify(validationResult),
      properties: { "validationId": this.validationId, "operationId": operationId, "isSuccess": isOperationSuccessful },
      severity: logSeverity
    });
  }

  /**
   *
   */
  uploadValidationResults() {
    console.log(JSON.stringify(this.operationValidationResults));

    const entGen = azure.TableUtilities.entityGenerator;

    const resultsEntity = {
      PartitionKey: entGen.String(this.validationId),
      RowKey: entGen.String("total"),
      ResourceProvider: entGen.String(this.resourceProvider),
      ApiVersion: entGen.String(this.apiVersion),
      ModelSourceRepo: entGen.String(this.repoUrl),
      ModelSourceBranch: entGen.String(this.branch),
      Operations: entGen.Int32(this.totalOperationCount),
      SuccessOperations: entGen.Int32(this.totalSuccessCount),
      SuccessRate: entGen.Double((100 * (this.totalSuccessCount / this.totalOperationCount)).toPrecision(3)),
      SuccessRequests: entGen.Int32(this.totalSuccessRequestCount),
      SuccessResponses: entGen.Int32(this.totalSuccessResponseCount)
    };

    this.tableService.insertEntity(resultsTable, resultsEntity, function (error, result, response) {
      if (!error) {
        // result contains the ETag for the new entity
      }
    });

    for (const [operationId, operationResults] of Object.entries(this.operationValidationResults)) {
      const resultsEntity = {
        PartitionKey: entGen.String(this.validationId),
        RowKey: entGen.String(operationId),
        ResourceProvider: entGen.String(this.resourceProvider),
        ApiVersion: entGen.String(this.apiVersion),
        ModelSourceRepo: entGen.String(this.repoUrl),
        ModelSourceBranch: entGen.String(this.branch),
        Operations: entGen.Int32(operationResults.operationCount),
        SuccessOperations: entGen.Int32(operationResults.successCount),
        SuccessRate: entGen.Double((100 * (operationResults.successCount / operationResults.operationCount)).toPrecision(3)),
        SuccessRequests: entGen.Int32(operationResults.successRequestCount),
        SuccessResponses: entGen.Int32(operationResults.successResponseCount)
      };

      this.tableService.insertEntity(resultsTable, resultsEntity, function (error, result, response) {
        if (!error) {
          // result contains the ETag for the new entity
        }
      });
    }
  }

  getProvider(path) {
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
}

module.exports = ValidationWorker;