/*
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for
 * license information.
 *
 * Code generated by Microsoft (R) AutoRest Code Generator.
 * Changes may cause incorrect behavior and will be lost if the code is
 * regenerated.
*/

import { ServiceClientOptions, RequestOptions, ServiceCallback, HttpOperationResponse } from 'ms-rest';
import * as models from '../models';


/**
 * @class
 * Oav
 * __NOTE__: An instance of this class is automatically created for an
 * instance of the LiveRequestValidationClient.
 */
export interface Oav {


    /**
     * Validates the request and response against the operatswagger specification
     *
     * @param {object} requestResponse The request and corresponding response to
     * validate.
     *
     * @param {object} requestResponse.liveRequest Schema for the live request to
     * be validated
     *
     * @param {object} requestResponse.liveRequest.headers Headers of the request.
     *
     * @param {string} requestResponse.liveRequest.method Http verb of the request.
     * Possible values include: 'GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'HEAD',
     * 'OPTIONS', 'TRACE'
     *
     * @param {string} requestResponse.liveRequest.url Url of the request.
     *
     * @param {object} [requestResponse.liveRequest.body] Parsed body of the
     * request as a JSON.
     *
     * @param {object} requestResponse.liveResponse Schema for the live response to
     * be validated
     *
     * @param {string} requestResponse.liveResponse.statusCode The Response status
     * code.
     *
     * @param {object} requestResponse.liveResponse.headers Headers of the
     * response.
     *
     * @param {object} [requestResponse.liveResponse.body] Body of the response.
     *
     * @param {string} [requestResponse.liveResponse.encoding] The encoding of the
     * response body when the body is a buffer.
     *
     * @param {object} [options] Optional Parameters.
     *
     * @param {object} [options.customHeaders] Headers that will be added to the
     * request
     *
     * @returns {Promise} A promise is returned
     *
     * @resolve {HttpOperationResponse<ValidationResult>} - The deserialized result object.
     *
     * @reject {Error|ServiceError} - The error object.
     */
    validateRequestResponseWithHttpOperationResponse(requestResponse: models.RequestResponse, options?: { customHeaders? : { [headerName: string]: string; } }): Promise<HttpOperationResponse<models.ValidationResult>>;

    /**
     * Validates the request and response against the operatswagger specification
     *
     * @param {object} requestResponse The request and corresponding response to
     * validate.
     *
     * @param {object} requestResponse.liveRequest Schema for the live request to
     * be validated
     *
     * @param {object} requestResponse.liveRequest.headers Headers of the request.
     *
     * @param {string} requestResponse.liveRequest.method Http verb of the request.
     * Possible values include: 'GET', 'PUT', 'PATCH', 'POST', 'DELETE', 'HEAD',
     * 'OPTIONS', 'TRACE'
     *
     * @param {string} requestResponse.liveRequest.url Url of the request.
     *
     * @param {object} [requestResponse.liveRequest.body] Parsed body of the
     * request as a JSON.
     *
     * @param {object} requestResponse.liveResponse Schema for the live response to
     * be validated
     *
     * @param {string} requestResponse.liveResponse.statusCode The Response status
     * code.
     *
     * @param {object} requestResponse.liveResponse.headers Headers of the
     * response.
     *
     * @param {object} [requestResponse.liveResponse.body] Body of the response.
     *
     * @param {string} [requestResponse.liveResponse.encoding] The encoding of the
     * response body when the body is a buffer.
     *
     * @param {object} [options] Optional Parameters.
     *
     * @param {object} [options.customHeaders] Headers that will be added to the
     * request
     *
     * @param {ServiceCallback} [optionalCallback] - The optional callback.
     *
     * @returns {ServiceCallback|Promise} If a callback was passed as the last
     * parameter then it returns the callback else returns a Promise.
     *
     * {Promise} A promise is returned.
     *
     *                      @resolve {ValidationResult} - The deserialized result object.
     *
     *                      @reject {Error|ServiceError} - The error object.
     *
     * {ServiceCallback} optionalCallback(err, result, request, response)
     *
     *                      {Error|ServiceError}  err        - The Error object if an error occurred, null otherwise.
     *
     *                      {ValidationResult} [result]   - The deserialized result object if an error did not occur.
     *                      See {@link ValidationResult} for more information.
     *
     *                      {WebResource} [request]  - The HTTP Request object if an error did not occur.
     *
     *                      {http.IncomingMessage} [response] - The HTTP Response stream if an error did not occur.
     */
    validateRequestResponse(requestResponse: models.RequestResponse, options?: { customHeaders? : { [headerName: string]: string; } }): Promise<models.ValidationResult>;
    validateRequestResponse(requestResponse: models.RequestResponse, callback: ServiceCallback<models.ValidationResult>): void;
    validateRequestResponse(requestResponse: models.RequestResponse, options: { customHeaders? : { [headerName: string]: string; } }, callback: ServiceCallback<models.ValidationResult>): void;
}
