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
  azure = require("azure-storage"),
  ValidationWorker = require("./lib/validationWorker");

console.log(`ValidationId is ${process.env.validationId}`)

const liveValidatorOptions = {
  git: {
    shouldClone: true,
    url: 'https://github.com/vladbarosan/sample-openapi-specs'
  },
  directory: path.resolve(os.homedir(), `repo${cluster.worker.id}`)
};

if (process.env.repoUrl !== undefined) {
  console.log(`Repo url is: ${process.env.repoUrl}`);
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

let durationInSeconds = Number.parseInt(process.env.duration);
const validationWorker = new ValidationWorker(process.env.validationId, liveValidatorOptions,
  durationInSeconds, process.env.resourceProvider, process.env.apiVersion, cluster);

validationWorker.start();
