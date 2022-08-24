const appendQueryToPath = (path: string, query: { [key: string]: string }) => {
    if (query) {
        path += "?";
        Object.entries(query).forEach(([k, v]) => {
            path += `${k}=${v}&`;
        });
    }
    return path;
};

const fetchCall = async <T = any>(
    path: string,
    method = "GET",
    query?: any,
    data?: any
): Promise<T> => {
    const res = await fetch(appendQueryToPath(path, query), {
        method,
        body: data && JSON.stringify(data),
    });
    return await res.json();
};

export interface RestError {
    code: string | number;
    reason: string;
    details: any;
}
export interface RestResponse {
    [key: string]: any;
    getLink(rel?: string): ApiLink | undefined;
    getLinks(): ApiLink[];
    json(def?: any): any;
    get(key: string, def?: any): any;
}

interface RequestOptions {
    isMeteor?: boolean;
    meteorConfig?: {
        wait?: boolean;
        retry?: boolean;
    };
    data?: any;
    query?: {
        [key: string]: string;
    };
    method?: string;
    loading?: string;
    quiet?: boolean;
}
const meteor = {
  call<T = any & { error?: RestError }>(
        name: string,
        params?: EJSONable,
        args?: {
            wait?: boolean;
            noRetry?: boolean;
        }
    ) {
        return new Promise<T>(async (resolve, reject) => {
            if (!Meteor.status().connected && args?.noRetry) {
                return reject({
                    code: 100,
                    reason: "请求失败",
                    details: "暂时无法连接网络",
                    message: "暂时无法连接网络，请稍后再试",
                    type: "EONET",
                });
            }
            const gap = Date.now() - lastCall;
            console.warn(`${name}= ${gap}`);
            lastCall = Date.now();
            if (!Meteor.userId()) {
                const wt = (currentCounters * (200 - gap)) / 1000;
                if (wt > 0.005) {
                    await sleep(wt);
                    console.error(`wait call ${wt}`);
                }
            } else {
                const wt = (currentCounters * (100 - gap)) / 1000;
                if (wt > 0.005) {
                    await sleep(wt);
                    console.error(`wait call ${wt}`);
                }
            }
            console.info(`current call out ${++currentCounters}`);
            Mcore.apply(
                name,
                params === undefined ? [] : [params],
                args,
                (err, res) => {
                    currentCounters--;
                    if (err) {
                        const e = {
                            code: 100 as string | number,
                            reason: "请求失败",
                            details: err.cause || (err as any).details,
                            message: err.message,
                            type: (err as any).errorType || "UNKNOW_TYPE",
                        };
                        if ((err as any)?.errorType === "Meteor.Error") {
                            e.code = (err as any).error;
                            e.reason = (err as any).reason || "未知原因";
                            e.details = (err as any).details || "";
                        }
                        return reject(e);
                    }
                    resolve(res as any);
                }
            );
        });
    },

}

const meteorCall = async (
    path: string,
    method = "GET",
    query?: any,
    body?: any,
    config?: {
        wait?: boolean;
        retry?: boolean;
    }
) => {
    return meteor.call<RestResponse>(
        `${method}.${path}`,
        {
            query,
            body,
        },
        { wait: !!config?.wait, noRetry: !config?.retry, ...config }
    );
};

export const  restApi = {
    async get(path: string, query?: any, options?: RequestOptions) {
        return this.request({
            path,
            query,
            ...options,
            method: "get",
        });
    },
    async post(
        path: string,
        data?: any,
        query?: any,
        options?: RequestOptions
    ) {
        return this.request({
            path,
            query,
            data,
            ...options,
            method: "post",
        });
    },
    async put(path: string, data?: any, query?: any, options?: RequestOptions) {
        return this.request({
            path,
            query,
            data,
            ...options,
            method: "put",
        });
    },
    async delete(
        path: string,
        data?: any,
        query?: any,
        options?: RequestOptions
    ) {
        return this.request({
            path,
            method: "delete",
            query,
            data,
            ...options,
        });
    },
    async request(options: RequestOptions & { path: string }) {
        const op = Object.assign(
            { loading: "请稍等...", isMeteor: true, method: "get" },
            options
        );
        if (!op.path) {
            throw new Error(`need path`);
        }
        if (!["get", "post", "put", "delete"].includes(op.method)) {
            op.method = "get";
            console.warn(`unsupported method "${op.method}"`);
        }
        const id = `REQ_${Date.now()}`;
        console.time(id);
        console.log(`[REST REQUEST START] ${id}`, op);
        let p: Promise<RestResponse>;
        if (op.isMeteor) {
            p = meteorCall(
                op.path,
                op.method.toUpperCase(),
                op.query,
                op.data,
                op.meteorConfig
            );
        } else {
            p = fetchCall<RestResponse>(
                op.path,
                op.method.toUpperCase(),
                op.query,
                op.data
            );
        }
        p = p.then((d) => ({
            getLink(rel = "default") {
                return d._links?.find((el: { rel: string }) => el.rel === rel);
            },
            getLinks() {
                return d._links || [];
            },
            json<T = any>(def?: T) {
                return d ?? (def as T);
            },
            get(key: string, def?: any) {
                return d?.[key] ?? def;
            },
        }));
        let r: any;
        let e: any;
        p = p.then((e) => {
            r = e.json();
            return e;
        });
        if (!op.quiet) {
            p = p.catch((err: RestError) => {
                if (err.reason) {
                    showWarn(err.reason);
                }
                e = err;
                throw err;
            });
        }
        p = p.finally(() => {
            console.log(`[REST REQUEST END] ${id}`, [e, r]);
            console.timeEnd(id);
        });
        return op.loading ? wrapPromisWithLoading(p, op.loading) : p;
    },
    async sequence(
        ...args: Array<string | (RequestOptions & { spread?: RequestOptions })>
    ) {
        const { strs: rels, objs: opts } = pairStringObject(args);
        const init = {
            path: rels.shift()!,
            ...opts.shift(),
        };
        let res = await this.request(init);
        const len = rels.length;
        for (let i = 0; i < len; i++) {
            const opt = opts.shift();
            const link = rels.shift();
            const mergedOpt = {
                ...opt,
                ...opt?.spread,
            };
            res = await this.useLink(res.getLink(link), mergedOpt);
        }
        return res;
    },
    async useLink(
        link?: ApiLink,
        options?: {
            isMeteor?: boolean;
            meteorConfig?: any;
            data?: any;
            query?: any;
            method?: string;
        }
    ) {
        if (!link) {
            showWarn(`功能暂时不可用`);
            throw new Error(`no link`);
        }
        return this.request({
            path: link.url,
            ...options,
            method: link.method ?? "get",
        });
    },
    handleError(cb: (err: RestError) => void) {
        return (err: RestError) => cb(err);
    },
    mapErrorCode(
        map: {
            [key: number | string]: (err: RestError) => void;
        } & {
            default?: (err: RestError) => void;
        }
    ) {
        return (err: RestError) => {
            const handler = map[err.code] ?? map.default;
            if (handler) {
                handler(err);
            }
        };
    },
    upload(file: Blob, option?: { timeout?: number }) {
        return ufs.uploadFile(file, {
            timeout: Math.max(60000, file.size),
            ...option,
        });
    },
    uploadAsync(file: Blob, option?: { timeout?: number }) {
        return ufs.uploadFileAysnc(file, {
            timeout: Math.max(60000, file.size),
            ...option,
        });
    },
    async prepare(...args: Array<string | RequestOptions>) {
        const api = this.extractLink();
        if (api) {
            return this.useLink(api);
        }
    },
    extractLink() {
        const route = useRoute();
        const link = route.query._link as any[] | string | undefined;
        if (!Array.isArray(link) && link) {
            try {
                return JSON.parse(decodeURIComponent(link)) as ApiLink;
            } catch (error) {
                //
            }
        }
    },
    routerLink(link?: ApiLink, d?: any) {
        if (!link) {
            showWarn("暂不支持该操作");
            throw new Error(`no link`);
        }
        return {
            ...d,
            query: {
                ...d?.query,
                _link: encodeURIComponent(JSON.stringify(link)),
            },
        };
    },
    reqLink(api: string, keys: string[]) {
        const re = keys.map(() => shallowRef<ApiLink>());
        this.get(api).then((res) => {
            keys.forEach((k, i) => (re[i].value = res.getLink(k)));
        });
        return re;
    },
    streamQueryLink(signal: Subject<{ data?: any; query?: any }>) {
        const api = this.extractLink();
        return this.streamLink(signal, api);
    },
    streamLink(signal: Subject<{ data?: any; query?: any }>, api?: ApiLink) {
        return new ObserableVue<{ data?: RestResponse; error?: RestError }>(
            new Observable((suber) => {
                if (!api) {
                    showWarn("操作暂时不可用");
                    return suber.error("no api avaliable");
                }
                suber.add(
                    signal.subscribe((d) => {
                        this.useLink(api, d)
                            .then((data) => suber.next({ data }))
                            .catch((error) => {
                                suber.error({ error });
                            });
                    })
                );
            })
        );
    },
    buildStreamSignil() {
        return new Subject<{ data?: any; query?: any }>();
    },
};
