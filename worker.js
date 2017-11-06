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
  url = require('url');

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

console.log(`I am a worker ${cluster.worker.id} with env: ${JSON.stringify(process.env)}`);

const liveValidatorOptions = {
  git: {
    shouldClone: true,
    url: 'https://github.com/vladbarosan/sample-openapi-specs',
  },
  directory: path.resolve(os.homedir(), `repo/${cluster.worker.id}`)
};

if (process.env.repoUrl !== undefined) {

  console.log(`My repo url is: ${process.env.repoUrl}`)
  liveValidatorOptions.git.url = process.env.repoUrl
}

//console.log(process.env['NODE_ENV']);
const validator = new oav.LiveValidator(liveValidatorOptions);
validator.initialize().then(() => {
  console.log('Live validator initialized.');

  let durationInSeconds = Number.parseInt(process.env.duration);
  if (!isNaN(durationInSeconds)) {
    console.log('setting timeout for worker to be  ' + durationInSeconds);

    setTimeout(() => {
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

  // Loop over the paths to find the last matched provider namespace
  while ((pathMatch = providerRegEx.exec(path)) != null) {
    result = pathMatch[1];
  }

  return result;
};

function validateHandler(requestBody) {

  let parsedUrl = url.parse(requestBody.liveRequest.url, true);
  let path = parsedUrl.pathname;

  // Lower all the keys of query parameters before searching for `api-version`
  console.log(`parsed url is ${JSON.stringify(parsedUrl.query)}`);

  let apiVersion = parsedUrl.query['api-version'];
  let resourceProvider = getProvider(path);

  if (process.env.resourceProvider !== undefined && resourceProvider !== process.env.resourceProvider) {
    console.log(`received request  is ${resourceProvider} is different from worker resource Provider ${process.env.resourceProvider} `);
    return;
  }

  if (process.env.apiVersion !== undefined && apiVersion !== process.env.apiVersion) {
    console.log(`received request api version is ${apiVersion} is different from worker resource apiVersion ${process.env.apiVersion} `);
    return;
  }

  let validationResult = validator.validateLiveRequestResponse(requestBody);
  console.log(JSON.stringify(validationResult));
  /*
    // Something went wrong
    if (validationResult && validationResult.errors && Array.isArray(validationResult.errors) && validationResult.errors.length) {
      let errors = validationResult.errors;
      let is400 = errors.some((error) => { return error.code === ErrorCodes.IncorrectInput; });
      if (is400) {
        // Return 400 with validationResult
        return res.send(400, validationResult);
      }
    }

    // Return 200 with validationResult
    return res.send(validationResult);
  */
}

cluster.worker.on("message", validateHandler);
