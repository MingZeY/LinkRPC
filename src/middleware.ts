import type { LinkRPCContext } from "./context.js";
/**
 * Packet处理中间件，常见于加密、过滤、压缩等
 * 当一个包进入或离开时，会调用该中间件进行处理
 */
class LinkRPCMiddleware{

    async inbound(context:LinkRPCContext,next:(context:LinkRPCContext) => Promise<LinkRPCContext>):Promise<LinkRPCContext>{
        return next(context);
    }

    async outbound(context:LinkRPCContext,next:(context:LinkRPCContext) => Promise<LinkRPCContext>):Promise<LinkRPCContext>{
        return next(context);
    }
}


export {
    LinkRPCMiddleware
}