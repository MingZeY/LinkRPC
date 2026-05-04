import { LinkRPCAPI } from "./api.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";
import { LinkRPCConnection } from "./connection.js";
import { DEFAULT_CORE_REQUEST_TIMEOUT } from "./const.js";
import type { LinkRPCContext } from "./context.js";
import { LinkRPCAPIDefine } from "./define.js";
import { LinkRPCHandler } from "./handler.js";
import type { LinkRPCMiddleware } from "./middleware.js";
import { LinkRPCPacketFactory, type LinkRPCPacket, type LinkRPCRequestPacket, type LinkRPCResponsePacket } from "./packet.js";
import { TypedEmitter, type LinkRPCDefineMethodBody, type LinkRPCDefineMethodName, type LinkRPCDefineServiceInstance, type LinkRPCDefineServiceName, type LinkRPCDefineToRPCAPI } from "./utils.js"

type LinkRPCCoreRequestOptions = {
    timeout?: number | undefined,
}

type LinkRPCEvents = {
    receive: (packet: LinkRPCPacket) => void,
}

class LinkRPCHub <L extends LinkRPCAPIDefine<any>,R extends LinkRPCAPIDefine<any>>{

    public emitter = new TypedEmitter<LinkRPCEvents>();

    public default: {
        requestOptions: LinkRPCCoreRequestOptions,
    } = {
            requestOptions: {
                timeout: DEFAULT_CORE_REQUEST_TIMEOUT
            }
        }

    public requestContextRecords = new Map</* requestId */string, {
        context: LinkRPCContext,
        resolve: (context: LinkRPCContext) => void,
        reject: (e: Error) => void
    }>();

    // private activePromises = new Set<Promise<any>>();

    public handler: LinkRPCHandler;
    public middlewares: LinkRPCMiddleware[];

    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }

    constructor(params?: {
        handler?: LinkRPCHandler,
        middlewares?: LinkRPCMiddleware[],
        define?:{
            local?:L | undefined,
            remote?:R | undefined,
        }
    }) {
        this.handler = params?.handler || new LinkRPCHandler();
        this.middlewares = params?.middlewares || [];
        this.middlewares.unshift(new LinkRPCBuildin.middleware.Essential(this.handler));
        this.define = params?.define || {};
    }

    public async inbound(connection: LinkRPCConnection, inboundPacket: LinkRPCPacket, pipe: boolean = true): Promise<LinkRPCContext> {
        let context: LinkRPCContext | undefined = undefined;
        if (LinkRPCPacketFactory.isResponsePacket(inboundPacket)) {
            const record = this.requestContextGet(inboundPacket.requestId);
            if (record) {
                context = record.context;
                context.inbound = inboundPacket;
                context.outbound = undefined;
                context.response = inboundPacket;
            }
        }
        if (!context) {
            context = {
                hub: this,
                connection: connection,
                inbound: inboundPacket,
                request: LinkRPCPacketFactory.isRequestPacket(inboundPacket) ? inboundPacket : undefined,
                response: LinkRPCPacketFactory.isResponsePacket(inboundPacket) ? inboundPacket : undefined,
            }
        }
        if (pipe) {
            return await this.inboundContext(context);
        }
        return context;
    }

    public async inboundContext(context: LinkRPCContext, pipe: boolean = true): Promise<LinkRPCContext> {
        /** 处理入站包 */
        context = await this.throughMiddleware(context, 'inbound');
        /** 如果没有要出站的包则终止 */
        if (!context.outbound) {
            return context;
        }
        if (pipe) {
            return await this.outboundContext(context);
        }
        return context;
    }

    public async outboundContext(context: LinkRPCContext, pipe: boolean = true): Promise<LinkRPCContext> {
        /** 处理出站包 */
        context = await this.throughMiddleware(context, 'outbound');
        if (!context.outbound) {
            return context;
        }
        if (pipe) {
            await this.outbound(context.connection, context.outbound);
            return context;
        }
        return context;
    }

    public async outbound(connection: LinkRPCConnection, outboundPacket: LinkRPCPacket): Promise<void> {
        /** 发送出站包 */
        await connection.send(outboundPacket);
        return;
    }


    public requestContextRecord(requestId: string, context: LinkRPCContext): Promise<LinkRPCContext> {
        if (!context.request) {
            throw new Error('require context.request')
        }
        if (requestId != context.request.id) {
            throw new Error('requestId not match context.request.id');
        }
        const contextPromise = new Promise<LinkRPCContext>((resolve, reject) => {
            this.requestContextRecords.set(requestId, {
                context: context,
                resolve: resolve,
                reject: reject,
            })
        });
        return contextPromise;
    }

    public requestContextGet(requestId: string) {
        return this.requestContextRecords.get(requestId);
    }

    public requestContextResolve(requestId: string, context: LinkRPCContext) {
        const record = this.requestContextGet(requestId);
        if (!record) {
            return;
        }
        record.resolve(context);
        this.requestContextRecords.delete(requestId);
    }

    private async throughMiddleware(context: LinkRPCContext, direction: 'inbound' | 'outbound', index?: number | undefined): Promise<LinkRPCContext> {
        if (!index) {
            index = 0;
        }

        const middleware = this.middlewares[index];

        if (!middleware) {
            return Promise.resolve(context);
        }

        let executedNextByMiddleware = false;
        const nextFn: ((context: LinkRPCContext) => Promise<LinkRPCContext>) = async (context) => {
            if (index == undefined) {
                throw new Error("index is undefined");
            }
            if (direction == 'inbound') {
                context = await this.throughMiddleware(context, direction, index + 1);
            } else if (direction == 'outbound') {
                context = await this.throughMiddleware(context, direction, index + 1);
            }
            return Promise.resolve(context);
        }

        if (direction == 'inbound') {
            context = await middleware.inbound(context, (context) => {
                executedNextByMiddleware = true;
                return nextFn(context);
            });
        } else if (direction == 'outbound') {
            context = await middleware.outbound(context, (context) => {
                executedNextByMiddleware = true;
                return nextFn(context);
            });
        }

        if (executedNextByMiddleware) {
            return context;
        } else {
            return nextFn(context);
        }
    }

    public async request(connection: LinkRPCConnection, requestPacket: LinkRPCRequestPacket, options?: {
        timeout?: number | undefined;
    }): Promise<LinkRPCResponsePacket> {
        const requestId = requestPacket.id;

        // 创建请求context
        let context: LinkRPCContext = {
            hub: this,
            connection: connection,
            request: requestPacket,
        }


        // 设置超时
        const requestTimeout = options?.timeout || this.default.requestOptions.timeout;
        let timeoutRejecter = setTimeout(() => {
            context.response = LinkRPCPacketFactory.createResponsePacket({
                requestId: requestId,
                error: `request timeout after ${requestTimeout}`
            })
            this.requestContextResolve(requestId, context)
        }, requestTimeout);

        // 登记请求
        const responseContextPromise = this.requestContextRecord(requestId, context);
        responseContextPromise.finally(() => {
            clearTimeout(timeoutRejecter);
        })

        // 设置出站包
        context.outbound = requestPacket;

        context = await this.outboundContext(context, false).catch((e) => {
            context.response = LinkRPCPacketFactory.createResponsePacket({
                requestId:requestId,
                error:`Outbound Middleware Error: ${e.message}`
            });
            return context;
        })

        if (!context.outbound) {
            if (context.response) {
                this.requestContextResolve(requestId, context);
            } else {
                context.response = LinkRPCPacketFactory.createResponsePacket({
                    requestId: requestId,
                    error: `Invalid request intercepted by middleware`
                })
                this.requestContextResolve(requestId, context);
            }
        } else {
            // 发送请求
            await this.outbound(context.connection, context.outbound).catch((e: Error) => {
                context.response = LinkRPCPacketFactory.createResponsePacket({
                    requestId: requestId,
                    error:`Outbound Error: ${e.message}`
                })
                this.requestContextResolve(requestId, context);
            })
        }

        return responseContextPromise.then((context) => {
            if (context.response) {
                return context.response;
            } else {
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId: requestId,
                    error: 'empty response'
                })
            }
        }).catch((e) => {
            return LinkRPCPacketFactory.createResponsePacket({
                requestId: requestId,
                error: e instanceof Error ? e.message : `${e}`
            })
        })
    }

    public getAPI(connection: LinkRPCConnection): LinkRPCDefineToRPCAPI<R> {
        const api = new LinkRPCAPI<R>();
        return api.interface(async (params) => {
            const methodConfig = this.define.remote?.resolveMethodConfig(params.serviceName, params.methodName);
            const requestPacket = LinkRPCPacketFactory.createRequestPacket({
                serviceName: params.serviceName,
                methodName: params.methodName,
                args: params.args,
            })

            const responsePromise = this.request(connection, requestPacket, {
                timeout: methodConfig?.timeout
            }).catch((e) => {
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId: requestPacket.id,
                    error: e instanceof Error ? e.message : `error:${e}`,
                })
            }).finally(() => {
                // this.activePromises.delete(responsePromise);
            })
            // this.activePromises.add(responsePromise);
            const responsePacket = await responsePromise;
            return {
                request: requestPacket,
                response: responsePacket,
            };
        })
    }

    public use(middleware: LinkRPCMiddleware) {
        this.middlewares.push(middleware);
    }

    public hook<S extends LinkRPCDefineServiceName<L>, M extends LinkRPCDefineMethodName<L, S>>(serviceName: S, methodName: M, config: {
        handler: LinkRPCDefineMethodBody<L, S, M>,
        bind?: any,
    }) {
        this.handler.hook(serviceName, methodName, config);
    }

    public unhook<S extends LinkRPCDefineServiceName<L>, M extends LinkRPCDefineMethodName<L, S>>(serviceName: S, methodName: M) {
        this.handler.unhook(serviceName, methodName);
    }

    public hookService<S extends LinkRPCDefineServiceName<L>>(serviceName: S, instance: LinkRPCDefineServiceInstance<L, S>) {
        const methodList = LinkRPCAPIDefine.getMethodList(instance);
        for (let methodName of methodList) {
            this.hook(serviceName, methodName as LinkRPCDefineMethodName<L, S>, {
                handler: instance[methodName],
                bind: instance,
            })
        }
    }

}

export {
    LinkRPCHub
}