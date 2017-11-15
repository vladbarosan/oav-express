/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */

'use strict';

const oav = require('oav'),
  appInsights = require('applicationinsights'),
  url = require('url'),
  uuidv4 = require('uuid/v4'),
  azure = require("azure-storage");

const resultsTable = "oavResults";

/**
 * @class
 * Worker for validating live operations against a swagger model.
 */
class ValidationWorker {
  /**
   *
   * @param {string} validationId The id to be used for this validation done by this worker.
   * @param {object} validatorOptions Configuration options for the OAV Live Validator
   * @param {integer} durationInSeconds How long should the validation run.
   * @param {string} resourceProvider The resource provider for whose operations to validate.
   * @param {string} apiVersion The API Version for the the resource provider's operations that are to be validated.
   * @param {object} cluster The cluster object that the worker belongs to.
   */
  constructor(validationId, validatorOptions, durationInSeconds, resourceProvider, apiVersion, cluster) {

    this.operationValidationResults = {};
    this.totalSuccessRequestCount = 0;
    this.totalSuccessResponseCount = 0;
    this.totalSuccessCount = 0;
    this.totalOperationCount = 0;
    this.cluster = cluster;
    this.resourceProvider = resourceProvider;
    this.apiVersion = apiVersion;
    this.validator = new oav.LiveValidator(validatorOptions);

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
   * Initializes and starts the worker to perform validations.
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
   * Validates a specifc Request-Response Pair (Operation).
   * @param {string} requestResponsePair An object representing an api call request and its response.
   */
  validate(requestResponsePair) {

    let parsedUrl = url.parse(requestResponsePair.liveRequest.url, true);
    let path = parsedUrl.pathname;

    console.debug(`Parsed url: ${JSON.stringify(parsedUrl.query)}`);
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

    let validationResult = this.validator.validateLiveRequestResponse(requestResponsePair);

    if (this.resourceProvider !== undefined) {
      this.updateStats(validationResult);
    }

    console.debug(JSON.stringify(validationResult));
  }

  /**
   * Update validation stats for current worker.
   * @param {object} validationResult the result of a specific operation validation that the worker performed.
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
   * Upload worker's validation stats.
   */
  uploadValidationResults() {
    console.debug(JSON.stringify(this.operationValidationResults));

    const entGen = azure.TableUtilities.entityGenerator;

    const resultsEntity = {
      PartitionKey: entGen.String(this.validationId),
      RowKey: entGen.String("Total"),
      resourceProvider: entGen.String(this.resourceProvider),
      apiVersion: entGen.String(this.apiVersion),
      modelSourceRepo: entGen.String(this.repoUrl),
      modelSourceBranch: entGen.String(this.branch),
      operations: entGen.Int32(this.totalOperationCount),
      successOperations: entGen.Int32(this.totalSuccessCount),
      successRate: entGen.Double((100 * (this.totalSuccessCount / this.totalOperationCount)).toPrecision(3)),
      successRequests: entGen.Int32(this.totalSuccessRequestCount),
      successResponses: entGen.Int32(this.totalSuccessResponseCount)
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
        resourceProvider: entGen.String(this.resourceProvider),
        apiVersion: entGen.String(this.apiVersion),
        modelSourceRepo: entGen.String(this.repoUrl),
        modelSourceBranch: entGen.String(this.branch),
        operations: entGen.Int32(operationResults.operationCount),
        successOperations: entGen.Int32(operationResults.successCount),
        successRate: entGen.Double((100 * (operationResults.successCount / operationResults.operationCount)).toPrecision(3)),
        successRequests: entGen.Int32(operationResults.successRequestCount),
        successResponses: entGen.Int32(operationResults.successResponseCount)
      };

      this.tableService.insertEntity(resultsTable, resultsEntity, function (error, result, response) {
        if (!error) {
          // result contains the ETag for the new entity
        }
      });
    }
  }

  /**
   * Helper method for extracting a resource provider.
   * @param {string} path
   */
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