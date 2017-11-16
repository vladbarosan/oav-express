/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 */
'use strict';

const assert = require('assert');
const should = require('should');
const request = require('request');

var server, client;
const baseUri = 'http://localhost:8080';
describe('oav-express', () => {
  before((done) => {
    server = require('../index.js');
    done();
  });
  after((done) => {
    done();
  });
  describe('basic test', () => {
    it('should respond to /', (done) => {
      request.get(baseUri, (err, response, responseBody) => {
        should.not.exist(err);
        should.exist(response);
        should.exist(responseBody);
        response.statusCode.should.equal(200);
        responseBody.should.equal('Welcome to oav-express');
        done();
      });
    });

    it('should should respond to /validate for successful validation', (done) => {
      let url = `${baseUri}/validate`;
      const requestBody = {
        "liveRequest": {
          "rawResponse": false,
          "queryString": {},
          "url": "https://management.azure.com/subscriptions/subcriptionID/providers/Microsoft.Storage/checkNameAvailability?api-version=2016-01-01",
          "method": "POST",
          "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "accept-language": "en-US",
            "x-ms-client-request-id": "81161439-5d0a-4f6c-a41d-08d20985bee7"
          },
          "body": {
            "name": "storage4db9202c66274d529",
            "type": "Microsoft.Storage/storageAccounts"
          }
        },
        "liveResponse": {
          "statusCode": "200",
          "body": {
            "nameAvailable": true
          },
          "headers": {
            "content-type": "application/json"
          }
        }
      };
      const bodyAsString = JSON.stringify(requestBody);
      let requestOptions = {
        body: bodyAsString, headers: {
          'Content-type': 'application/json'
        }
      };
      request.post(url, requestOptions, (err, response, responseBody) => {
        should.not.exist(err);
        should.exist(response);
        should.exist(responseBody);
        response.statusCode.should.equal(200);
        done();
      });
    });
  });
  describe('validation model test suite', () => {
    it('should respond with a validationId to /validations', (done) => {
      let url = `${baseUri}/validations`;
      let durationInSeconds = 5;

      const requestBody = {
        validationModel: {
          repoUrl: "https://github.com/vladbarosan/sample-openapi-specs",
          branch: "master",
          resourceProvider: "Microsoft.Cache",
          apiVersion: "2017-02-01",
          duration: durationInSeconds
        }
      }

      const bodyAsString = JSON.stringify(requestBody);
      let requestOptions = {
        body: bodyAsString, headers: {
          'Content-type': 'application/json'
        }
      };

      request.post(url, requestOptions, (err, response, responseBody) => {
        should.not.exist(err);
        should.exist(response);
        should.exist(responseBody);
        response.statusCode.should.equal(200);
        let validationId = JSON.parse(responseBody).validationId;
        should.exist(validationId);
        done();
      });
    });

    it('should respond with validation results to existing /validations/{validationId}', (done) => {
      let url = `${baseUri}/validations`;
      let durationInSeconds = 5;

      const requestBody = {
        validationModel: {
          repoUrl: "https://github.com/vladbarosan/sample-openapi-specs",
          branch: "master",
          resourceProvider: "Microsoft.Cache",
          apiVersion: "2017-02-01",
          duration: durationInSeconds
        }
      }

      const bodyAsString = JSON.stringify(requestBody);
      let requestOptions = {
        body: bodyAsString, headers: {
          'Content-type': 'application/json'
        }
      };

      let validationId;
      request.post(url, requestOptions, (err, response, responseBody) => {
        response.statusCode.should.equal(200);
        validationId = JSON.parse(responseBody).validationId;

        setTimeout(() => {
          url = `${baseUri}/validations/${validationId}`;
          request.get(url, (err, response, responseBody) => {
            should.not.exist(err);
            should.exist(response);
            should.exist(responseBody);
            response.statusCode.should.equal(200);
            done();
          });
        }, (durationInSeconds + 5) * 1000);
      });
    });

    it('should respond with error 404 to non-existent /validations/{validationId}', (done) => {
      let url = 'http://localhost:8080/validations/1';

      request.get(url, (err, response, responseBody) => {
        should.exist(response);
        should.exist(responseBody);
        should.exist(JSON.parse(responseBody).error);
        response.statusCode.should.equal(404);
        done();
      });
    });
  });
});
