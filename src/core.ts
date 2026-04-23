import { RPCAPI } from "./api.js";
import { RPCBuildin } from "./buildin/buildin.js";
import type { RPCConnection } from "./connection.js";
import type { RPCContext } from "./context.js";
import type { RPCAPIDefine } from "./define.js";
import { RPCHandler } from "./handler.js";
import type { RPCMiddleware } from "./middleware.js";
import { RPCPacketFactory, type RPCPacket, type RPCRequestPacket, type RPCResponsePacket } from "./packet.js";
import { TypedEmitter, type RPCDefineToRPCAPI } from "./utils.js";

type RPCCoreEvents = {



}

/**
 * RPC核心类，处理连接、请求、响应和中间件处理，主要采用事件驱动模式
 * 
 */
class RPCCore<L extends RPCAPIDefine<any>,R extends RPCAPIDefine<any>> {

    private destroyed = false;
    public emitter = new TypedEmitter<RPCCoreEvents>();
    private onConnectionReciveEventHandler: (packet: RPCPacket) => void;


    public requestContextRecords = new Map</* requestId */string,{
        context:RPCContext,
        resolve: (context:RPCContext) => void,
        reject: (e:Error) => void
    }>();

    public connection:RPCConnection;
    public handler:RPCHandler;
    public middlewares:RPCMiddleware[];
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }

    constructor(params:{
        connection:RPCConnection,
        handler?:RPCHandler
        middlewares?:RPCMiddleware[],
        define?:{
            local?:L | undefined,
            remote?:R | undefined,
        }
    }) {
        this.connection = params.connection;
        this.handler = params.handler || new RPCHandler();
        this.middlewares = params.middlewares || [new RPCBuildin.middleware.essential() ];
        this.define = params.define || {};
        this.onConnectionReciveEventHandler = this.onConnectionRevice.bind(this);
        this.initEvents();
    }

    private initEvents() {
        this.connection.emitter.on('receive', this.onConnectionReciveEventHandler);
    }

    /** 包进站 */
    private async onConnectionRevice(inboundPacket: RPCPacket) {
        let context: RPCContext | undefined = undefined;
        // 关联 context
        if(RPCPacketFactory.isResponsePacket(inboundPacket)){
            const record = this.requestContextGet(inboundPacket.requestId);
            if(record){
                context = record.context;
                context.inbound = inboundPacket;
                context.outbound = undefined;
                context.response = inboundPacket;
            }
        }
        if(!context){
            context = {
                core:this,
                inbound:inboundPacket,
                request:RPCPacketFactory.isRequestPacket(inboundPacket) ? inboundPacket : undefined,
                response:RPCPacketFactory.isResponsePacket(inboundPacket) ? inboundPacket : undefined,
            }
        }

        /** 处理入站包 */
        context = await this.throughMiddleware(context,'inbound');

        /** 如果没有要出站的包则终止 */
        if(!context.outbound){
            return;
        }

        /** 处理出站包 */
        context = await this.throughMiddleware(context,'outbound');
        if(!context.outbound){
            return;
        }
        
        /** 发送出站包 */
        await this.connection.send(context.outbound).catch(e => {
            console.error('Failed to send outbound packet:', e);
        });
    }


    private async throughMiddleware(context: RPCContext,direction:'inbound'|'outbound', index?: number | undefined): Promise<RPCContext> {
        if (index == undefined) {
            index = 0;
        }

        const middleware = this.middlewares[index];

        if(!middleware){
            return Promise.resolve(context);
        }

        let executedNextByMiddleware = false;
        const nextFn:((context:RPCContext) => Promise<RPCContext>) = async (context) => {
            if(direction == 'inbound'){
                context = await this.throughMiddleware(context,direction,index + 1);
            }else if(direction == 'outbound'){
                context = await this.throughMiddleware(context,direction,index + 1);
            }
            return Promise.resolve(context);
        }

        if(direction == 'inbound'){
            context = await middleware.inbound(context,(context) => {
                executedNextByMiddleware = true;
                return nextFn(context);
            });
        }else if(direction == 'outbound'){
            context = await middleware.outbound(context,(context) => {
                executedNextByMiddleware = true;
                return nextFn(context);
            });
        }

        if(executedNextByMiddleware){
            return context;
        }else{
            return nextFn(context);
        }
    }

    // /** send request through connection */
    // public async request(requestPacket: RPCRequestPacket, config: {
    //     timeout: number,
    // }): Promise<RPCResponsePacket> {
    //     if (config.timeout < 0) {
    //         throw new Error('Timeout must be greater than 0');
    //     }

    //     let timeoutRejecter: ReturnType<typeof setTimeout> | undefined;

    //     const context:RPCContext = {
    //         connection:this.connection,
    //         core:this,
    //         define:this.define,
    //         request:requestPacket
    //     }

    //     const responseContextPromise = this.requestContextRecord(context);

    //     const cleanup = () => {
    //         clearTimeout(timeoutRejecter);
    //         // this.requestPacketResolveMap.delete(requestPacket.id);
    //     }

    //     const responsePacket = new Promise<RPCResponsePacket>((resolve, reject) => {
    //         // setup timeout
    //         timeoutRejecter = setTimeout(() => {
    //             reject(new Error(`Request timed out after ${config.timeout}ms`));
    //         }, config.timeout)
    //         // record request packet
    //         // this.requestPacketResolveMap.set(requestPacket.id, { 
    //         //     request:requestPacket,
    //         //     resolve:resolve,
    //         //     reject:reject,
    //         // });

    //     }).then((response) => {
    //         cleanup();
    //         return response;
    //     }, (e) => {
    //         cleanup();
    //         return RPCPacketFactory.createResponsePacket({
    //             requestId: requestPacket.id,
    //             error: e.message,
    //         })
    //     })

    //     try {
    //         // send request packet
    //         let context: RPCContext = {
    //             core:this,
    //             connection: this.connection,
    //             outbound: requestPacket,
    //             request:requestPacket,
    //         }
    //         context = await this.throughMiddleware(context,'outbound');
    //         if(!context.outbound){
    //             cleanup();
    //             return RPCPacketFactory.createResponsePacket({
    //                 requestId: requestPacket.id,
    //                 error: 'request packet is not sent due middleware interrupt',
    //             })
    //         }
    //         if(!RPCPacketFactory.isRequestPacket(context.outbound)){
    //             cleanup();
    //             return RPCPacketFactory.createResponsePacket({
    //                 requestId: requestPacket.id,
    //                 error: 'request packet is not valid due middleware interrupt',
    //             })
    //         }
    //         context.connection.send(context.outbound);
    //     } catch (e) {
    //         cleanup();
    //         throw e;
    //     }

    //     return responsePacket;
    // }

    // public async requsetResolve(requestId:string,responsePacket:RPCResponsePacket){
    //     const record = this.requestPacketResolveMap.get(requestId);
    //     if(!record){
    //         return;
    //     }
    //     record.resolve(responsePacket);
    // }

    public async request(request:RPCRequestPacket,options?:{
        timeout?:number
    }): Promise<RPCResponsePacket>{

        const requestId = request.id;

        // 创建请求context
        let context:RPCContext = {
            core:this,
            request:request,
        }

        // 登记请求
        const responseContextPromise = this.requestContextRecord(requestId,context);

        // 设置超时
        const requestTimeout = options?.timeout || 10 * 1000;
        let timeoutRejecter = setTimeout(() => {
            context.response = RPCPacketFactory.createResponsePacket({
                requestId:requestId,
                error:`request timeout after ${requestTimeout}`
            })
            this.requestContextResolve(requestId,context)
        },requestTimeout);

        // 中间件
        // 设置出站包
        context.outbound = request;
        context = await this.throughMiddleware(context,'outbound');
        if(!context.outbound){
            if(context.response){
                this.requestContextResolve(requestId,context);
            }else{
                context.response = RPCPacketFactory.createResponsePacket({
                    requestId:requestId,
                    error:`Invalid request intercepted by middleware`
                })
                this.requestContextResolve(requestId,context);
            }
        }else{
            // 发送请求
            await context.core.connection.send(context.outbound).catch(e => {
                console.error('Failed to send outbound packet:', e);
            });
        }

        responseContextPromise.finally(() => {
            clearTimeout(timeoutRejecter);
        })

        return responseContextPromise.then((context) => {
            if(context.response){
                return context.response;
            }else{
                return RPCPacketFactory.createResponsePacket({
                    requestId:requestId,
                    error:'empty response'
                })
            }
        }).catch((e) => {
            return RPCPacketFactory.createResponsePacket({
                requestId:requestId,
                error:e instanceof Error ? e.message : `${e}`
            })
        })
    }

    public requestContextRecord(requestId:string,context:RPCContext):Promise<RPCContext>{
        if(!context.request){
            throw new Error('require context.request')
        }
        if(requestId != context.request.id){
            throw new Error('requestId not match context.request.id');
        }
        const contextPromise = new Promise<RPCContext>((resolve,reject) => {
            this.requestContextRecords.set(requestId,{
                context:context,
                resolve:resolve,
                reject:reject,
            })
        });
        return contextPromise;
    }

    public requestContextGet(requestId:string){
        return this.requestContextRecords.get(requestId);
    }

    public requestContextResolve(requestId:string,context:RPCContext){
        const record = this.requestContextGet(requestId);
        if(!record){
            return;
        }
        record.resolve(context);
        this.requestContextRecords.delete(requestId);
    }


    public getAPI(): RPCDefineToRPCAPI<R> {
        const api = new RPCAPI<R>();
        return api.interface(async (params) => {
            const methodConfig = this.define.remote?.resolveMethodConfig(params.serviceName, params.methodName);
            const requestPacket = RPCPacketFactory.createRequestPacket({
                serviceName: params.serviceName,
                methodName: params.methodName,
                args: params.args,
            })
            const responsePacket = await this.request(requestPacket).catch((e) => {
                return RPCPacketFactory.createResponsePacket({
                    requestId:requestPacket.id,
                    error:e instanceof Error ? e.message : `error:${e}`,
                })
            })
            return {
                request: requestPacket,
                response: responsePacket,
            };
        })
    }

    public destroy() {
        this.destroyed = true;
        this.requestContextRecords.forEach((record, requestId) => {
            record.reject(new Error('core destoryed'))
        })
        this.connection.emitter.off('receive', this.onConnectionReciveEventHandler);
        this.emitter.removeAllListeners();
    }
}

export {
    RPCCore
}