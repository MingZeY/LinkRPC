import { LinkRPCAPI } from "./api.js";
import { LinkRPCBuildin } from "./buildin/buildin.js";
import type { LinkRPCConnection } from "./connection.js";
import { DEFAULT_CORE_REQUEST_TIMEOUT } from "./const.js";
import type { LinkRPCContext } from "./context.js";
import { LinkRPCAPIDefine } from "./define.js";
import { LinkRPCHandler } from "./handler.js";
import type { LinkRPCMiddleware } from "./middleware.js";
import { LinkRPCPacketFactory, type LinkRPCPacket, type LinkRPCRequestPacket, type LinkRPCResponsePacket } from "./packet.js";
import { TypedEmitter, type LinkRPCDefineMethodBody, type LinkRPCDefineMethodName, type LinkRPCDefineServiceInstance, type LinkRPCDefineServiceName, type LinkRPCDefineToRPCAPI } from "./utils.js";

type LinkRPCCoreEvents = {
    destroy:() => void,
    destroyed:() => void,
}

type LinkRPCCoreRequestOptions = {
    timeout?:number | undefined,
}

/**
 * RPC核心类，处理连接、请求、响应和中间件处理，主要采用事件驱动模式
 * 
 */
class LinkRPCCore<L extends LinkRPCAPIDefine<any>,R extends LinkRPCAPIDefine<any>> {

    public emitter = new TypedEmitter<LinkRPCCoreEvents>();
    private destroyed = false;

    public requestContextRecords = new Map</* requestId */string,{
        context:LinkRPCContext,
        resolve: (context:LinkRPCContext) => void,
        reject: (e:Error) => void
    }>();

    private activePromises = new Set<Promise<any>>();

    public connection:LinkRPCConnection;
    public handler:LinkRPCHandler;
    public middlewares:LinkRPCMiddleware[];
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }
    public default:{
        requestOptions:LinkRPCCoreRequestOptions,
    } = {
        requestOptions:{
            timeout:DEFAULT_CORE_REQUEST_TIMEOUT
        }
    }

    constructor(params:{
        connection:LinkRPCConnection,
        handler?:LinkRPCHandler
        middlewares?:LinkRPCMiddleware[],
        define?:{
            local?:L | undefined,
            remote?:R | undefined,
        }
    }) {
        this.connection = params.connection;
        this.handler = params.handler || new LinkRPCHandler();
        this.middlewares = params.middlewares || [new LinkRPCBuildin.middleware.essential() ];
        this.define = params.define || {};
        this.initEvents();
    }

    private initEvents() {
        const listener = (packet:LinkRPCPacket) => {
            const promise = this.onConnectionRevice(packet);
            this.activePromises.add(promise);
            promise.finally(() => {
                this.activePromises.delete(promise);
            })
        }
        this.connection.emitter.on('receive', listener);
        this.emitter.on('destroy',() => {
            /** stop receive new packet */
            this.connection.emitter.off('receive',listener);
        })
    }

    /** 包进站 */
    private async onConnectionRevice(inboundPacket: LinkRPCPacket) {
        let context: LinkRPCContext | undefined = undefined;
        // 关联 context
        if(LinkRPCPacketFactory.isResponsePacket(inboundPacket)){
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
                request:LinkRPCPacketFactory.isRequestPacket(inboundPacket) ? inboundPacket : undefined,
                response:LinkRPCPacketFactory.isResponsePacket(inboundPacket) ? inboundPacket : undefined,
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

        return;
    }

    private async throughMiddleware(context: LinkRPCContext,direction:'inbound'|'outbound', index?: number | undefined): Promise<LinkRPCContext> {
        if (!index) {
            index = 0;
        }

        const middleware = this.middlewares[index];

        if(!middleware){
            return Promise.resolve(context);
        }

        let executedNextByMiddleware = false;
        const nextFn:((context:LinkRPCContext) => Promise<LinkRPCContext>) = async (context) => {
            if(index == undefined){
                throw new Error("index is undefined");
            }
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

    public async request(request:LinkRPCRequestPacket,options?:LinkRPCCoreRequestOptions): Promise<LinkRPCResponsePacket>{
        const requestId = request.id;

        // 创建请求context
        let context:LinkRPCContext = {
            core:this,
            request:request,
        }

        // 登记请求
        const responseContextPromise = this.requestContextRecord(requestId,context);

        // 设置超时
        const requestTimeout = options?.timeout || this.default.requestOptions.timeout;
        let timeoutRejecter = setTimeout(() => {
            context.response = LinkRPCPacketFactory.createResponsePacket({
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
                context.response = LinkRPCPacketFactory.createResponsePacket({
                    requestId:requestId,
                    error:`Invalid request intercepted by middleware`
                })
                this.requestContextResolve(requestId,context);
            }
        }else{
            // 发送请求
            await context.core.connection.send(context.outbound).catch((e:Error) => {
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
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId:requestId,
                    error:'empty response'
                })
            }
        }).catch((e) => {
            return LinkRPCPacketFactory.createResponsePacket({
                requestId:requestId,
                error:e instanceof Error ? e.message : `${e}`
            })
        })
    }

    public requestContextRecord(requestId:string,context:LinkRPCContext):Promise<LinkRPCContext>{
        if(!context.request){
            throw new Error('require context.request')
        }
        if(requestId != context.request.id){
            throw new Error('requestId not match context.request.id');
        }
        const contextPromise = new Promise<LinkRPCContext>((resolve,reject) => {
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

    public requestContextResolve(requestId:string,context:LinkRPCContext){
        const record = this.requestContextGet(requestId);
        if(!record){
            return;
        }
        record.resolve(context);
        this.requestContextRecords.delete(requestId);
    }


    public getAPI(): LinkRPCDefineToRPCAPI<R> {
        const api = new LinkRPCAPI<R>();
        return api.interface(async (params) => {
            const methodConfig = this.define.remote?.resolveMethodConfig(params.serviceName, params.methodName);
            const requestPacket = LinkRPCPacketFactory.createRequestPacket({
                serviceName: params.serviceName,
                methodName: params.methodName,
                args: params.args,
            })

            const responsePromise = this.request(requestPacket,{
                timeout:methodConfig?.timeout
            }).catch((e) => {
                return LinkRPCPacketFactory.createResponsePacket({
                    requestId:requestPacket.id,
                    error:e instanceof Error ? e.message : `error:${e}`,
                })
            }).finally(() => {
                this.activePromises.delete(responsePromise);
            })
            this.activePromises.add(responsePromise);
            const responsePacket = await responsePromise;
            return {
                request: requestPacket,
                response: responsePacket,
            };
        })
    }

    public async destroy(force:boolean = false) {
        this.emitter.emit('destroy')
        if(force){
            this.requestContextRecords.forEach((record, requestId) => {
                record.reject(new Error('core destoryed'))
            })
        }if(!force){
            await Promise.all(this.activePromises);
        }
        this.destroyed = true;
        this.emitter.emit('destroyed');
        this.emitter.removeAllListeners();
    }

    public isDestroyed(){
        return this.destroyed;
    }
}

class LinkRPCCoreHub<L extends LinkRPCAPIDefine<any>,R extends LinkRPCAPIDefine<any>>{
    private destroyed = false;
    public cores:Map<LinkRPCConnection,LinkRPCCore<L,R>> = new Map();
    public handler:LinkRPCHandler;
    public middlewares:LinkRPCMiddleware[];
    public define:{
        local?:L | undefined,
        remote?:R | undefined,
    }

    constructor(params:{
        handler?:LinkRPCHandler
        middlewares?:LinkRPCMiddleware[],
        define:{
            local?:L | undefined,
            remote?:R | undefined,
        }
    }){
        this.handler = params.handler || new LinkRPCHandler();
        this.middlewares = params.middlewares || [];
        this.define = params.define;
        this.middlewares.unshift(new LinkRPCBuildin.middleware.essential());
    }

    public setCore(connection:LinkRPCConnection):LinkRPCCore<L,R>{
        if(this.cores.has(connection)){
            return this.cores.get(connection)!;
        }
        if(connection.isClosed()){
            throw new Error('connection is closed');
        }
        const core = new LinkRPCCore({
            connection,
            handler:this.handler,
            middlewares:this.middlewares,
            define:this.define,
        });
        core.emitter.once('destroyed',() => {
            this.cores.delete(connection);
        })
        connection.emitter.once('closed',() => {
            core.destroy();
        })
        this.cores.set(connection,core);
        return core;
    }

    public getCore(connection:LinkRPCConnection):LinkRPCCore<L,R>|undefined{
        return this.cores.get(connection);
    }

    public use(middleware:LinkRPCMiddleware){
        this.middlewares.push(middleware);
    }

    public hook<S extends LinkRPCDefineServiceName<L>,M extends LinkRPCDefineMethodName<L,S>>(serviceName:S,methodName:M,config:{
        handler:LinkRPCDefineMethodBody<L,S,M>,
        bind?:any,
    }){
        this.handler.hook(serviceName,methodName,config);
    }

    public unhook<S extends LinkRPCDefineServiceName<L>,M extends LinkRPCDefineMethodName<L,S>>(serviceName:S,methodName:M){
        this.handler.unhook(serviceName,methodName);
    }

    public hookService<S extends LinkRPCDefineServiceName<L>>(serviceName:S,instance:LinkRPCDefineServiceInstance<L,S>){
        const methodList = LinkRPCAPIDefine.getMethodList(instance);
        for(let methodName of methodList){
            this.hook(serviceName,methodName as LinkRPCDefineMethodName<L,S>,{
                handler:instance[methodName],
                bind:instance,
            })
        }
    }

    public destory(){
        this.destroyed = true;
        this.cores.forEach((core) => {
            core.destroy();
        })
    }

    public isDestroyed(){
        return this.destroyed;
    }

}

export {
    LinkRPCCore,
    LinkRPCCoreHub,
}