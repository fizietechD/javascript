import * as http from 'http';
import request = require('request');
import { ApisApi, HttpError, V1APIResource, V1APIResourceList, V1DeleteOptions, V1Status } from './api';
import { KubeConfig } from './config';
import ObjectSerializer from './serializer';
import { KubernetesListObject, KubernetesObject } from './types';
import { RequestResult, Watch } from './watch';

/** Union type of body types returned by KubernetesObjectApi. */
type KubernetesObjectResponseBody =
    | KubernetesObject
    | KubernetesListObject<KubernetesObject>
    | V1Status
    | V1APIResourceList;

/** Kubernetes API verbs. */
type KubernetesApiAction = 'create' | 'delete' | 'patch' | 'read' | 'list' | 'replace';

type KubernetesObjectHeader<T extends KubernetesObject | KubernetesObject> = Pick<
    T,
    'apiVersion' | 'kind'
> & {
    metadata: {
        name: string;
        namespace?: string;
    };
};

interface GroupVersion {
    group: string;
    version: string;
}

/**
 * Valid Content-Type header values for patch operations.  See
 * https://kubernetes.io/docs/tasks/run-application/update-api-object-kubectl-patch/
 * for details.
 */
enum KubernetesPatchStrategies {
    /** Diff-like JSON format. */
    JsonPatch = 'application/json-patch+json',
    /** Simple merge. */
    MergePatch = 'application/merge-patch+json',
    /** Merge with different strategies depending on field metadata. */
    StrategicMergePatch = 'application/strategic-merge-patch+json',
}

/**
 * Describes the type of an watch event.
 * Object is:
 * - If Type is Added or Modified: the new state of the object.
 * - If Type is Deleted: the state of the object immediately before deletion.
 * - If Type is Bookmark: the object (instance of a type being watched) where
 *   only ResourceVersion field is set. On successful restart of watch from a
 *   bookmark resourceVersion, client is guaranteed to not get repeat event
 *   nor miss any events.
 * - If Type is Error: *api.Status is recommended; other types may make sense
 *   depending on context.
 */
export enum KubernetesEventType {
    ADDED = 'ADDED',
    MODIFIED = 'MODIFIED',
    DELETED = 'DELETED',
    BOOKMARK = 'BOOKMARK',
    ERROR = 'ERROR',
}

export type WatchObject<T extends KubernetesObject | KubernetesObject> = {
    type: KubernetesEventType;
    object: T;
};

export type WatchCallback<T extends KubernetesObject | KubernetesObject> = (
    phase: KubernetesEventType,
    apiObj: T,
    watchObj?: WatchObject<T>,
) => void;

export type WatchOptions = {
    /**
     * To mitigate the impact of short history window,
     * the Kubernetes API provides a watch event named BOOKMARK.
     * It is a special kind of event to mark that all changes
     * up to a given resourceVersion the client is requesting
     * have already been sent.
     *
     * See https://kubernetes.io/docs/reference/using-api/api-concepts/#watch-bookmarks
     */
    allowWatchBookmarks?: boolean;
    /**
     * Start watch at the given resource version.
     * Starting at a specific resource version means that only events
     * starting from that versions are included in the watch stream.
     */
    resourceVersion?: string;
};

export type WatchResult = {
    abort: () => void;
};

/**
 * Dynamically construct Kubernetes API request URIs so client does not have to know what type of object it is acting
 * on.
 */
export class KubernetesObjectApi extends ApisApi {
    /**
     * Create a KubernetesObjectApi object from the provided KubeConfig.  This method should be used rather than
     * [[KubeConfig.makeApiClient]] so we can properly determine the default namespace if one is provided by the current
     * context.
     *
     * @param kc Valid Kubernetes config
     * @return Properly instantiated [[KubernetesObjectApi]] object
     */
    public static makeApiClient(kc: KubeConfig): KubernetesObjectApi {
        const client = kc.makeApiClient(KubernetesObjectApi);
        client.setDefaultNamespace(kc);
        client.watcher = new Watch(kc);
        return client;
    }

    /** Initialize the default namespace.  May be overwritten by context. */
    protected defaultNamespace: string = 'default';

    /** Cache resource API response. */
    protected apiVersionResourceCache: Record<string, V1APIResourceList> = {};

    protected watcher?: Watch;

    /**
     * Create any Kubernetes resource.
     * @param spec Kubernetes resource spec.
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized
     *        dryRun directive will result in an error response and no further processing of the request. Valid values
     *        are: - All: all dry run stages will be processed
     * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The
     *        value must be less than or 128 characters long, and only contain printable characters, as defined by
     *        https://golang.org/pkg/unicode/#IsPrint.
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and [[KubernetesObject]].
     */
    public async create<T extends KubernetesObject | KubernetesObject>(
        spec: T,
        pretty?: string,
        dryRun?: string,
        fieldManager?: string,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: T; response: http.IncomingMessage }> {
        // verify required parameter 'spec' is not null or undefined
        if (spec === null || spec === undefined) {
            throw new Error('Required parameter spec was null or undefined when calling create.');
        }

        const localVarPath = await this.specUriPath(spec, 'create');
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers);

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (dryRun !== undefined) {
            localVarQueryParameters.dryRun = ObjectSerializer.serialize(dryRun, 'string');
        }

        if (fieldManager !== undefined) {
            localVarQueryParameters.fieldManager = ObjectSerializer.serialize(fieldManager, 'string');
        }

        const localVarRequestOptions: request.Options = {
            method: 'POST',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
            body: ObjectSerializer.serialize(spec, 'KubernetesObject'),
        };

        return this.requestPromise(localVarRequestOptions);
    }

    /**
     * Delete any Kubernetes resource.
     * @param spec Kubernetes resource spec
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized
     *        dryRun directive will result in an error response and no further processing of the request. Valid values
     *        are: - All: all dry run stages will be processed
     * @param gracePeriodSeconds The duration in seconds before the object should be deleted. Value must be non-negative
     *        integer. The value zero indicates delete immediately. If this value is nil, the default grace period for
     *        the specified type will be used. Defaults to a per object value if not specified. zero means delete
     *        immediately.
     * @param orphanDependents Deprecated: please use the PropagationPolicy, this field will be deprecated in
     *        1.7. Should the dependent objects be orphaned. If true/false, the \&quot;orphan\&quot; finalizer will be
     *        added to/removed from the object\&#39;s finalizers list. Either this field or PropagationPolicy may be
     *        set, but not both.
     * @param propagationPolicy Whether and how garbage collection will be performed. Either this field or
     *        OrphanDependents may be set, but not both. The default policy is decided by the existing finalizer set in
     *        the metadata.finalizers and the resource-specific default policy. Acceptable values are:
     *        \&#39;Orphan\&#39; - orphan the dependents; \&#39;Background\&#39; - allow the garbage collector to delete
     *        the dependents in the background; \&#39;Foreground\&#39; - a cascading policy that deletes all dependents
     *        in the foreground.
     * @param body See [[V1DeleteOptions]].
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and a Kubernetes [[V1Status]].
     */
    public async delete(
        spec: KubernetesObject,
        pretty?: string,
        dryRun?: string,
        gracePeriodSeconds?: number,
        orphanDependents?: boolean,
        propagationPolicy?: string,
        body?: V1DeleteOptions,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: V1Status; response: http.IncomingMessage }> {
        // verify required parameter 'spec' is not null or undefined
        if (spec === null || spec === undefined) {
            throw new Error('Required parameter spec was null or undefined when calling delete.');
        }

        const localVarPath = await this.specUriPath(spec, 'delete');
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers);

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (dryRun !== undefined) {
            localVarQueryParameters.dryRun = ObjectSerializer.serialize(dryRun, 'string');
        }

        if (gracePeriodSeconds !== undefined) {
            localVarQueryParameters.gracePeriodSeconds = ObjectSerializer.serialize(
                gracePeriodSeconds,
                'number',
            );
        }

        if (orphanDependents !== undefined) {
            localVarQueryParameters.orphanDependents = ObjectSerializer.serialize(
                orphanDependents,
                'boolean',
            );
        }

        if (propagationPolicy !== undefined) {
            localVarQueryParameters.propagationPolicy = ObjectSerializer.serialize(
                propagationPolicy,
                'string',
            );
        }

        const localVarRequestOptions: request.Options = {
            method: 'DELETE',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
            body: ObjectSerializer.serialize(body, 'V1DeleteOptions'),
        };

        return this.requestPromise<V1Status>(localVarRequestOptions, 'V1Status');
    }

    /**
     * Patch any Kubernetes resource.
     * @param spec Kubernetes resource spec
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized
     *        dryRun directive will result in an error response and no further processing of the request. Valid values
     *        are: - All: all dry run stages will be processed
     * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes.  The
     *        value must be less than or 128 characters long, and only contain printable characters, as defined by
     *        https://golang.org/pkg/unicode/#IsPrint. This field is required for apply requests
     *        (application/apply-patch) but optional for non-apply patch types (JsonPatch, MergePatch,
     *        StrategicMergePatch).
     * @param force Force is going to \&quot;force\&quot; Apply requests.  It means user will re-acquire conflicting
     *        fields owned by other people. Force flag must be unset for non-apply patch requests.
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and [[KubernetesObject]].
     */
    public async patch<T extends KubernetesObject | KubernetesObject>(
        spec: T,
        pretty?: string,
        dryRun?: string,
        fieldManager?: string,
        force?: boolean,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: T; response: http.IncomingMessage }> {
        // verify required parameter 'spec' is not null or undefined
        if (spec === null || spec === undefined) {
            throw new Error('Required parameter spec was null or undefined when calling patch.');
        }

        const localVarPath = await this.specUriPath(spec, 'patch');
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers, 'PATCH');

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (dryRun !== undefined) {
            localVarQueryParameters.dryRun = ObjectSerializer.serialize(dryRun, 'string');
        }

        if (fieldManager !== undefined) {
            localVarQueryParameters.fieldManager = ObjectSerializer.serialize(fieldManager, 'string');
        }

        if (force !== undefined) {
            localVarQueryParameters.force = ObjectSerializer.serialize(force, 'boolean');
        }

        const localVarRequestOptions: request.Options = {
            method: 'PATCH',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
            body: ObjectSerializer.serialize(spec, 'object'),
        };

        return this.requestPromise(localVarRequestOptions);
    }

    /**
     * Read any Kubernetes resource.
     * @param spec Kubernetes resource spec
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param exact Should the export be exact.  Exact export maintains cluster-specific fields like
     *        \&#39;Namespace\&#39;. Deprecated. Planned for removal in 1.18.
     * @param exportt Should this value be exported.  Export strips fields that a user can not
     *        specify. Deprecated. Planned for removal in 1.18.
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and [[KubernetesObject]].
     */
    public async read<T extends KubernetesObject | KubernetesObject>(
        spec: KubernetesObjectHeader<T>,
        pretty?: string,
        exact?: boolean,
        exportt?: boolean,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: T; response: http.IncomingMessage }> {
        // verify required parameter 'spec' is not null or undefined
        if (spec === null || spec === undefined) {
            throw new Error('Required parameter spec was null or undefined when calling read.');
        }
        // verify required parameter 'kind' is not null or undefined
        if (spec.kind === null || spec.kind === undefined) {
            throw new Error('Required parameter spec.kind was null or undefined when calling read.');
        }
        if (!spec.apiVersion) {
            throw new Error('Required parameter spec.apiVersion was null or undefined when calling read.');
        }

        const localVarPath = await this.specUriPath(spec, 'read');
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers);

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (exact !== undefined) {
            localVarQueryParameters.exact = ObjectSerializer.serialize(exact, 'boolean');
        }

        if (exportt !== undefined) {
            localVarQueryParameters.export = ObjectSerializer.serialize(exportt, 'boolean');
        }

        const localVarRequestOptions: request.Options = {
            method: 'GET',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
        };

        return this.requestPromise(localVarRequestOptions);
    }

    /**
     * List any Kubernetes resources.
     * @param apiVersion api group and version of the form <apiGroup>/<version>
     * @param kind Kubernetes resource kind
     * @param namespace list resources in this namespace
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param exact Should the export be exact.  Exact export maintains cluster-specific fields like
     *        \&#39;Namespace\&#39;. Deprecated. Planned for removal in 1.18.
     * @param exportt Should this value be exported.  Export strips fields that a user can not
     *        specify. Deprecated. Planned for removal in 1.18.
     * @param fieldSelector A selector to restrict the list of returned objects by their fields. Defaults to everything.
     * @param labelSelector A selector to restrict the list of returned objects by their labels. Defaults to everything.
     * @param limit Number of returned resources.
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and [[KubernetesListObject<KubernetesObject>]].
     */
    public async list<T extends KubernetesObject | KubernetesObject>(
        apiVersion: string,
        kind: string,
        namespace?: string,
        pretty?: string,
        exact?: boolean,
        exportt?: boolean,
        fieldSelector?: string,
        labelSelector?: string,
        limit?: number,
        continueToken?: string,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: KubernetesListObject<T>; response: http.IncomingMessage }> {
        // verify required parameters 'apiVersion', 'kind' is not null or undefined
        if (apiVersion === null || apiVersion === undefined) {
            throw new Error('Required parameter apiVersion was null or undefined when calling list.');
        }
        if (kind === null || kind === undefined) {
            throw new Error('Required parameter kind was null or undefined when calling list.');
        }

        const localVarPath = await this.specUriPath(
            {
                apiVersion,
                kind,
                metadata: {
                    namespace,
                },
            },
            'list',
        );
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers);

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (exact !== undefined) {
            localVarQueryParameters.exact = ObjectSerializer.serialize(exact, 'boolean');
        }

        if (exportt !== undefined) {
            localVarQueryParameters.export = ObjectSerializer.serialize(exportt, 'boolean');
        }

        if (fieldSelector !== undefined) {
            localVarQueryParameters.fieldSelector = ObjectSerializer.serialize(fieldSelector, 'string');
        }

        if (labelSelector !== undefined) {
            localVarQueryParameters.labelSelector = ObjectSerializer.serialize(labelSelector, 'string');
        }

        if (limit !== undefined) {
            localVarQueryParameters.limit = ObjectSerializer.serialize(limit, 'number');
        }

        if (continueToken !== undefined) {
            localVarQueryParameters.continue = ObjectSerializer.serialize(continueToken, 'string');
        }

        const localVarRequestOptions: request.Options = {
            method: 'GET',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
        };

        return this.requestPromise(localVarRequestOptions);
    }

    /**
     * Replace any Kubernetes resource.
     * @param spec Kubernetes resource spec
     * @param pretty If \&#39;true\&#39;, then the output is pretty printed.
     * @param dryRun When present, indicates that modifications should not be persisted. An invalid or unrecognized
     *        dryRun directive will result in an error response and no further processing of the request. Valid values
     *        are: - All: all dry run stages will be processed
     * @param fieldManager fieldManager is a name associated with the actor or entity that is making these changes. The
     *        value must be less than or 128 characters long, and only contain printable characters, as defined by
     *        https://golang.org/pkg/unicode/#IsPrint.
     * @param options Optional headers to use in the request.
     * @return Promise containing the request response and [[KubernetesObject]].
     */
    public async replace<T extends KubernetesObject | KubernetesObject>(
        spec: T,
        pretty?: string,
        dryRun?: string,
        fieldManager?: string,
        options: { headers: { [name: string]: string } } = { headers: {} },
    ): Promise<{ body: T; response: http.IncomingMessage }> {
        // verify required parameter 'spec' is not null or undefined
        if (spec === null || spec === undefined) {
            throw new Error('Required parameter spec was null or undefined when calling replace.');
        }

        const localVarPath = await this.specUriPath(spec, 'replace');
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders(options.headers);

        if (pretty !== undefined) {
            localVarQueryParameters.pretty = ObjectSerializer.serialize(pretty, 'string');
        }

        if (dryRun !== undefined) {
            localVarQueryParameters.dryRun = ObjectSerializer.serialize(dryRun, 'string');
        }

        if (fieldManager !== undefined) {
            localVarQueryParameters.fieldManager = ObjectSerializer.serialize(fieldManager, 'string');
        }

        const localVarRequestOptions: request.Options = {
            method: 'PUT',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
            body: ObjectSerializer.serialize(spec, 'KubernetesObject'),
        };

        return this.requestPromise(localVarRequestOptions);
    }

    /**
     * Watches the given resources and calls provided callback with the parsed json object
     * upon event received over the watcher connection.
     *
     * @param resource defines the resources to watch. Namespace is optional.
     *                 Undefined namespace means to watch all namespaces.
     * @param options Optional options that are passed to the watch request.
     * @param callback callback function that is called with the parsed json object upon event received.
     * @param done callback is called either when connection is closed or when there
     *             is an error. In either case, watcher takes care of properly closing the
     *             underlaying connection so that it doesn't leak any resources.
     *
     * @returns WatchResult object that can be used to abort the watch.
     */
    public async watch<T extends KubernetesObject | KubernetesObject>({
        resource,
        options = {},
        callback,
        done,
    }: {
        resource: {
            apiVersion: string;
            kind: string;
            namespace?: string;
        };
        options?: WatchOptions;
        callback: WatchCallback<T>;
        done: (err: unknown) => void;
    }): Promise<WatchResult> {
        if (!this.watcher) {
            throw new Error('Watcher not initialized');
        }
        const resourcePath = new URL(
            await this.specUriPath(
                {
                    apiVersion: resource.apiVersion,
                    kind: resource.kind,
                    metadata: {
                        namespace: resource.namespace,
                    },
                },
                'list',
            ),
        ).pathname;
        const type = await this.getSerializationType(resource.apiVersion, resource.kind);
        const cb: WatchCallback<T> = (phase: KubernetesEventType, apiObj: T, watchObj?: WatchObject<T>) => {
            const obj = ObjectSerializer.deserialize(apiObj, type);
            callback(
                phase,
                obj,
                watchObj
                    ? {
                          ...watchObj,
                          object: obj,
                      }
                    : undefined,
            );
        };
        const res: RequestResult = await this.watcher.watch(
            resourcePath,
            options,
            // required to convert to less strict type.
            cb as (phase: string, apiObj: any, watchObj?: any) => void,
            done,
        );
        return {
            abort: () => res.abort(),
        };
    }

    /** Set default namespace from current context, if available. */
    protected setDefaultNamespace(kc: KubeConfig): string {
        if (kc.currentContext) {
            const currentContext = kc.getContextObject(kc.currentContext);
            if (currentContext && currentContext.namespace) {
                this.defaultNamespace = currentContext.namespace;
            }
        }
        return this.defaultNamespace;
    }

    /**
     * Use spec information to construct resource URI path.  If any required information in not provided, an Error is
     * thrown.  If an `apiVersion` is not provided, 'v1' is used.  If a `metadata.namespace` is not provided for a
     * request that requires one, the context default is used, if available, if not, 'default' is used.
     *
     * @param spec Kubernetes resource spec which must define kind and apiVersion properties.
     * @param action API action, see [[K8sApiAction]].
     * @return tail of resource-specific URI
     */
    protected async specUriPath(spec: KubernetesObject, action: KubernetesApiAction): Promise<string> {
        if (!spec.kind) {
            throw new Error('Required spec property kind is not set');
        }
        if (!spec.apiVersion) {
            spec.apiVersion = 'v1';
        }
        if (!spec.metadata) {
            spec.metadata = {};
        }
        const resource = await this.resource(spec.apiVersion, spec.kind);
        if (!resource) {
            throw new Error(`Unrecognized API version and kind: ${spec.apiVersion} ${spec.kind}`);
        }
        if (resource.namespaced && !spec.metadata.namespace && action !== 'list') {
            spec.metadata.namespace = this.defaultNamespace;
        }
        const parts = [this.apiVersionPath(spec.apiVersion)];
        if (resource.namespaced && spec.metadata.namespace) {
            parts.push('namespaces', encodeURIComponent(String(spec.metadata.namespace)));
        }
        parts.push(resource.name);
        if (action !== 'create' && action !== 'list') {
            if (!spec.metadata.name) {
                throw new Error('Required spec property name is not set');
            }
            parts.push(encodeURIComponent(String(spec.metadata.name)));
        }
        return parts.join('/').toLowerCase();
    }

    /** Return root of API path up to API version. */
    protected apiVersionPath(apiVersion: string): string {
        const api = apiVersion.includes('/') ? 'apis' : 'api';
        return [this.basePath, api, apiVersion].join('/');
    }

    /**
     * Merge default headers and provided headers, setting the 'Accept' header to 'application/json' and, if the
     * `action` is 'PATCH', the 'Content-Type' header to [[KubernetesPatchStrategies.StrategicMergePatch]].  Both of
     * these defaults can be overriden by values provided in `optionsHeaders`.
     *
     * @param optionHeaders Headers from method's options argument.
     * @param action HTTP action headers are being generated for.
     * @return Headers to use in request.
     */
    protected generateHeaders(
        optionsHeaders: { [name: string]: string },
        action: string = 'GET',
    ): { [name: string]: string } {
        const headers: { [name: string]: string } = Object.assign({}, this._defaultHeaders);
        headers.accept = 'application/json';
        if (action === 'PATCH') {
            headers['content-type'] = KubernetesPatchStrategies.StrategicMergePatch;
        }
        Object.assign(headers, optionsHeaders);
        return headers;
    }

    /**
     * Get metadata from Kubernetes API for resources described by `kind` and `apiVersion`.  If it is unable to find the
     * resource `kind` under the provided `apiVersion`, `undefined` is returned.
     *
     * This method caches responses from the Kubernetes API to use for future requests.  If the cache for apiVersion
     * exists but the kind is not found the request is attempted again.
     *
     * @param apiVersion Kubernetes API version, e.g., 'v1' or 'apps/v1'.
     * @param kind Kubernetes resource kind, e.g., 'Pod' or 'Namespace'.
     * @return Promise of the resource metadata or `undefined` if the resource is not found.
     */
    protected async resource(apiVersion: string, kind: string): Promise<V1APIResource | undefined> {
        // verify required parameter 'apiVersion' is not null or undefined
        if (apiVersion === null || apiVersion === undefined) {
            throw new Error('Required parameter apiVersion was null or undefined when calling resource');
        }
        // verify required parameter 'kind' is not null or undefined
        if (kind === null || kind === undefined) {
            throw new Error('Required parameter kind was null or undefined when calling resource');
        }

        if (this.apiVersionResourceCache[apiVersion]) {
            const resource = this.apiVersionResourceCache[apiVersion].resources.find((r) => r.kind === kind);
            if (resource) {
                return resource;
            }
        }

        const localVarPath = this.apiVersionPath(apiVersion);
        const localVarQueryParameters: any = {};
        const localVarHeaderParams = this.generateHeaders({});

        const localVarRequestOptions: request.Options = {
            method: 'GET',
            qs: localVarQueryParameters,
            headers: localVarHeaderParams,
            uri: localVarPath,
            useQuerystring: this._useQuerystring,
            json: true,
        };

        try {
            const getApiResponse = await this.requestPromise<V1APIResourceList>(
                localVarRequestOptions,
                'V1APIResourceList',
            );
            this.apiVersionResourceCache[apiVersion] = getApiResponse.body;
            return this.apiVersionResourceCache[apiVersion].resources.find((r) => r.kind === kind);
        } catch (e) {
            if (e instanceof Error) {
                e.message = `Failed to fetch resource metadata for ${apiVersion}/${kind}: ${e.message}`;
            }
            throw e;
        }
    }

    protected async getSerializationType(apiVersion?: string, kind?: string): Promise<string> {
        if (apiVersion === undefined || kind === undefined) {
            return 'KubernetesObject';
        }
        // Types are defined in src/gen/api/models with the format "<Version><Kind>".
        // Version and Kind are in PascalCase.
        const gv = this.groupVersion(apiVersion);
        const version = gv.version.charAt(0).toUpperCase() + gv.version.slice(1);
        return `${version}${kind}`;
    }

    protected groupVersion(apiVersion: string): GroupVersion {
        const v = apiVersion.split('/');
        return v.length === 1
            ? {
                  group: 'core',
                  version: apiVersion,
              }
            : {
                  group: v[0],
                  version: v[1],
              };
    }

    /**
     * Standard Kubernetes request wrapped in a Promise.
     */
    protected async requestPromise<T extends KubernetesObjectResponseBody = KubernetesObject>(
        requestOptions: request.Options,
        type?: string,
    ): Promise<{ body: T; response: http.IncomingMessage }> {
        let authenticationPromise = Promise.resolve();
        if (this.authentications.BearerToken.apiKey) {
            authenticationPromise = authenticationPromise.then(() =>
                this.authentications.BearerToken.applyToRequest(requestOptions),
            );
        }
        authenticationPromise = authenticationPromise.then(() =>
            this.authentications.default.applyToRequest(requestOptions),
        );

        let interceptorPromise = authenticationPromise;
        for (const interceptor of this.interceptors) {
            interceptorPromise = interceptorPromise.then(() => interceptor(requestOptions));
        }
        await interceptorPromise;

        return new Promise<{ body: T; response: http.IncomingMessage }>((resolve, reject) => {
            request(requestOptions, async (error, response, body) => {
                if (error) {
                    reject(error);
                } else {
                    // TODO(schrodit): support correct deserialization to KubernetesObject.
                    if (type === undefined) {
                        type = await this.getSerializationType(body.apiVersion, body.kind);
                    }
                    body = ObjectSerializer.deserialize(body, type);
                    if (response.statusCode && response.statusCode >= 200 && response.statusCode <= 299) {
                        resolve({ response, body });
                    } else {
                        reject(new HttpError(response, body, response.statusCode));
                    }
                }
            });
        });
    }
}
