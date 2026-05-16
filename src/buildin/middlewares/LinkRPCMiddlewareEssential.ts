import type { LinkRPCContext } from "../../context.js";
import { LinkRPCError } from "../../error.js";
import { LinkRPCMiddleware } from "../../middleware.js";
import { LinkRPCPacketFactory, type LinkRPCRequestPacket, type LinkRPCResponsePacket } from "../../packet.js";

type LinkRPCMiddlewareEssentialHandler = (request:LinkRPCRequestPacket,context?:LinkRPCContext) => Promise<LinkRPCResponsePacket>;
type LinkRPCMiddlewareEssentialResolver = (requestId:string,context:LinkRPCContext) => void;

class LinkRPCMiddlewareEssential extends LinkRPCMiddleware{

    private handler:LinkRPCMiddlewareEssentialHandler;
    private resolver:LinkRPCMiddlewareEssentialResolver;

    constructor(params:{
        handler:LinkRPCMiddlewareEssentialHandler,
        resolver:LinkRPCMiddlewareEssentialResolver,
    }){
        super();
        this.handler = params.handler;
        this.resolver = params.resolver;
    }
    
    /**
     * 入站请求包：将请求转换为响应包
     * 入站响应包：将响应包对应的请求包resolve
     */

    async inbound(context: LinkRPCContext, next: (context: LinkRPCContext) => Promise<LinkRPCContext>): Promise<LinkRPCContext> {
        context = await next(context);
        if(context.request
        /** 包含一个正确的请求包 */
        && context.request == context.inbound 
        /** 没有响应包 */
        && context.response == undefined
        /** 没有需要发送的响应包 */
        && context.outbound == undefined){// 收到请求
            const requestId = context.request.id;
            const responsePacket = await this.handler(context.request,context).catch((e) => {
                if(e instanceof LinkRPCError){
                    return LinkRPCPacketFactory.createResponsePacket({
                        requestId:requestId,
                        error:e.message,
                        code:e.code,
                    })
                }else{
                    context.hub.emitter.emit('error',e instanceof Error ? e : new Error(e));
                    return LinkRPCPacketFactory.createResponsePacket({
                        requestId:requestId,
                        error:`Server Internal Error`,
                    })
                }
            });
            context.response = responsePacket;
            context.outbound = responsePacket;
            return context;
        }else if(context.response
        /** 包含一个正确的响应包 */
        && context.response == context.inbound
        /** 包含一个正确的请求包 */
        && context.request
        /** 不再有新的数据要发送 */
        && context.outbound == undefined
        ){// 收到响应
            // context.hub.requestContextResolve(context.request.id,context);
            this.resolver(context.request.id,context);
            return context;
        }else{
            return next(context);
        }
    }

    async outbound(context: LinkRPCContext, next: (context: LinkRPCContext) => Promise<LinkRPCContext>): Promise<LinkRPCContext> {
        return next(context);
    }

}

export {
    LinkRPCMiddlewareEssential
}