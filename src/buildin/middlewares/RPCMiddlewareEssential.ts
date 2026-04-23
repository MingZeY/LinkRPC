import type { RPCContext } from "../../context.js";
import { RPCMiddleware } from "../../middleware.js";
import { RPCPacketFactory, type RPCResponsePacket } from "../../packet.js";

class RPCMiddlewareEssential extends RPCMiddleware{
    
    /**
     * 入站请求包：将请求转换为响应包
     * 入站响应包：将响应包对应的请求包resolve
     */

    async inbound(context: RPCContext, next: (context: RPCContext) => Promise<RPCContext>): Promise<RPCContext> {
        context = await next(context);
        if(context.request
        /** 包含一个正确的请求包 */
        && context.request == context.inbound 
        /** 没有响应包 */
        && context.response == undefined
        /** 没有需要发送的响应包 */
        && context.outbound == undefined){// 收到请求
            const requestId = context.request.id;
            const responsePacket = await context.core.handler.handle(context.request,context).catch((e) => {
                return RPCPacketFactory.createResponsePacket({
                    requestId:requestId,
                    error:e.message,
                })
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
            context.core.requestContextResolve(context.request.id,context);
            return context;
        }else{
            return next(context);
        }
    }

    // async inbound(context: RPCContext, next: (context: RPCContext) => Promise<RPCContext>): Promise<RPCContext> {
    //     if(RPCPacketFactory.isResponsePacket(context.inbound)){
    //         const requestId = context.inbound.requestId;
    //         context.response = context.inbound;
    //         context = await next(context);
    //         if(context.inbound && RPCPacketFactory.isResponsePacket(context.inbound)){
    //             if(context.inbound.requestId == requestId){
    //                 context.core.requsetResolve(requestId,context.inbound);
    //             }else{
    //                 context.core.requsetResolve(requestId,RPCPacketFactory.createResponsePacket({
    //                     requestId:requestId,
    //                     error:`Invalid response packet:packet id mismatch`,
    //                 }))
    //             }
    //         }else{
    //             context.core.requsetResolve(requestId,RPCPacketFactory.createResponsePacket({
    //                 requestId:requestId,
    //                 error:`Empty response packet`,
    //             }))
    //         }
    //         return context;
    //     }else if(RPCPacketFactory.isRequestPacket(context.inbound)){
    //         context.request = context.inbound;
    //         /** 其他中间件先处理 */
    //         context = await next(context);
    //         /** 如果没有请求包或请求包不合法，则不处理 */
    //         if(!context.inbound
    //         || !RPCPacketFactory.isRequestPacket(context.inbound)
    //         ){
    //             return context;
    //         }
    //         const requestId = context.inbound.id;
    //         context.outbound = await context.core.handler.handle(context.inbound,context).catch((e) => {
    //             return RPCPacketFactory.createResponsePacket({
    //                 requestId:requestId,
    //                 error:e.message,
    //             })
    //         });
    //         return context;
    //     }else{
    //         return next(context);
    //     }
    // }


    async outbound(context: RPCContext, next: (context: RPCContext) => Promise<RPCContext>): Promise<RPCContext> {
        return next(context);
    }

}

export {
    RPCMiddlewareEssential
}